import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { buildPageMeta } from '../common/dto/pagination.dto';
import { RequestUser } from '../common/types/request-user';
import { NumberingService } from '../numbering/numbering.service';
import { PrismaService } from '../prisma/prisma.service';
import { StockService } from '../trading/stock.service';
import { parseWorkbook, requiredHeaders, resolveImportRows, SPEC_DEAL } from './deals-io';
import { CreateDealDto, DealQueryDto, UpdateDealDto } from './dto/deals.dto';

export interface Ctx {
  ipAddress?: string | null;
  userAgent?: string | null;
}

const r4 = (n: number) => Number(n.toFixed(4));
const brokerageTotal = (qty: number, buyer: number, seller: number) => r4(qty * (buyer + seller));
/** Due date = trade date + payment term (whole days). */
const dueDateFrom = (tradeDate: Date, days?: number | null) =>
  days ? new Date(tradeDate.getTime() + days * 86_400_000) : null;

const INCLUDE = {
  buyerParty: true, sellerParty: true, product: true,
  sourceDeal: { select: { id: true, dealNo: true } }, // the purchase a self-firm sale draws on
} as const;
// Columns the client may sort by (guards against Prisma 500s / injection).
const SORTABLE = ['dealNo', 'date', 'quantity', 'rate', 'buyerBrokerage', 'sellerBrokerage', 'brokerageTotal', 'shipmentMonth', 'deposit', 'dueDate', 'liftingDate', 'createdAt'];
// Optional columns: blanks sort last in either direction (Postgres puts them first on DESC).
const NULLABLE = ['shipmentMonth', 'deposit', 'dueDate', 'liftingDate'];

// ═══════════════════════════════════════════════════════════════════════════
//  Deals — one unified Buyer ↔ Seller trade. We broker it and charge each side
//  a per-ton brokerage: Brokerage Total = Qty × (Buyer + Seller brokerage).
// ═══════════════════════════════════════════════════════════════════════════
@Injectable()
export class DealService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly stock: StockService,
  ) {}

  /** Tenant-scoped where clause from the list filters. */
  private buildWhere(user: RequestUser, q: DealQueryDto): Prisma.DealWhereInput {
    const where: Prisma.DealWhereInput = { companyId: user.companyId, deletedAt: null };
    if (q.productId) where.productId = q.productId;
    if (q.buyerPartyId) where.buyerPartyId = q.buyerPartyId;
    if (q.sellerPartyId) where.sellerPartyId = q.sellerPartyId;
    if (q.shipmentMonth) where.shipmentMonth = q.shipmentMonth;
    if (q.dateFrom || q.dateTo) {
      const range: Prisma.DateTimeFilter = {};
      if (q.dateFrom) range.gte = new Date(q.dateFrom);
      if (q.dateTo) {
        const to = new Date(q.dateTo);
        to.setHours(23, 59, 59, 999); // inclusive end-of-day
        range.lte = to;
      }
      where.date = range;
    }
    if (q.search) {
      const contains = { contains: q.search, mode: 'insensitive' as const };
      where.OR = [
        { dealNo: contains },
        { port: contains },
        { paymentCondition: contains },
        { shipmentMonth: contains },
        { buyerParty: { name: contains } },
        { sellerParty: { name: contains } },
        { product: { code: contains } },
      ];
    }
    return where;
  }

  private buildOrderBy(q: DealQueryDto): Prisma.DealOrderByWithRelationInput {
    if (!q.sortBy || !SORTABLE.includes(q.sortBy)) return { createdAt: 'desc' }; // latest created on top
    const sort = q.sortDir === 'asc' ? 'asc' : 'desc';
    return { [q.sortBy]: NULLABLE.includes(q.sortBy) ? { sort, nulls: 'last' } : sort };
  }

  async list(user: RequestUser, q: DealQueryDto) {
    const where = this.buildWhere(user, q);
    const [items, total] = await Promise.all([
      this.prisma.deal.findMany({ where, include: INCLUDE, orderBy: this.buildOrderBy(q), skip: q.skip, take: q.limit }),
      this.prisma.deal.count({ where }),
    ]);
    return { items, meta: buildPageMeta(total, q.page, q.limit) };
  }

  /** All rows matching the filters (no pagination) — used for export. */
  exportAll(user: RequestUser, q: DealQueryDto) {
    return this.prisma.deal.findMany({ where: this.buildWhere(user, q), include: INCLUDE, orderBy: this.buildOrderBy(q) });
  }

  async get(user: RequestUser, id: string) {
    const row = await this.prisma.deal.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      include: INCLUDE,
    });
    if (!row) throw new NotFoundException('Deal not found');
    return row;
  }

  /** A deal needs two distinct parties that belong to this company. */
  private async assertParties(companyId: string, buyerPartyId?: string | null, sellerPartyId?: string | null) {
    if (!buyerPartyId || !sellerPartyId) throw new BadRequestException('A deal needs both a buyer and a seller.');
    if (buyerPartyId === sellerPartyId) {
      throw new BadRequestException('Buyer and seller must be different parties.');
    }
    const found = await this.prisma.party.count({
      where: { companyId, deletedAt: null, id: { in: [buyerPartyId, sellerPartyId] } },
    });
    if (found < 2) throw new BadRequestException('Buyer or seller party not found.');
  }

  /** Material's total brokerage ₹/MT (also verifies the material exists). */
  private async productBrokerage(companyId: string, productId: string): Promise<number> {
    const p = await this.prisma.product.findFirst({
      where: { id: productId, companyId, deletedAt: null },
      select: { brokerage: true },
    });
    if (!p) throw new BadRequestException('Material not found.');
    return Number(p.brokerage);
  }

  async create(user: RequestUser, dto: CreateDealDto, ctx: Ctx) {
    await this.assertParties(user.companyId, dto.buyerPartyId, dto.sellerPartyId);
    // Unset sides default to an equal split of the material's brokerage.
    const half = r4((await this.productBrokerage(user.companyId, dto.productId)) / 2);
    const buyerBrokerage = dto.buyerBrokerage ?? half;
    const sellerBrokerage = dto.sellerBrokerage ?? half;
    const date = dto.date ? new Date(dto.date) : new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      // Our own firm selling must name the purchase the stock comes from.
      const sourceDealId = await this.stock.resolveSource({
        companyId: user.companyId, sellerPartyId: dto.sellerPartyId, productId: dto.productId,
        quantity: dto.quantity, sourceDealId: dto.sourceDealId, required: true,
      }, tx);
      const dealNo = await this.numbering.next(user.companyId, 'DEAL', tx);
      return tx.deal.create({
        data: {
          companyId: user.companyId,
          dealNo,
          date,
          sourceDealId,
          buyerPartyId: dto.buyerPartyId,
          sellerPartyId: dto.sellerPartyId,
          productId: dto.productId,
          quantity: dto.quantity,
          rate: dto.rate,
          buyerBrokerage,
          sellerBrokerage,
          brokerageTotal: brokerageTotal(dto.quantity, buyerBrokerage, sellerBrokerage),
          port: dto.port ?? null,
          paymentCondition: dto.paymentCondition ?? null,
          liftingDate: dto.liftingDate ? new Date(dto.liftingDate) : null,
          shipmentMonth: dto.shipmentMonth ?? null,
          deposit: dto.deposit ?? null,
          dueDays: dto.dueDays ?? null,
          dueDate: dueDateFrom(date, dto.dueDays),
          createdById: user.id,
          updatedById: user.id,
        },
      });
    });
    await this.auditWrite(user, 'CREATE', row.id, `Created deal ${row.dealNo}`, ctx);
    return this.get(user, row.id);
  }

  async update(user: RequestUser, id: string, dto: UpdateDealDto, ctx: Ctx) {
    const before = await this.get(user, id);
    await this.assertParties(
      user.companyId,
      dto.buyerPartyId ?? before.buyerPartyId,
      dto.sellerPartyId ?? before.sellerPartyId,
    );
    if (dto.productId) await this.productBrokerage(user.companyId, dto.productId); // existence check
    const qty = dto.quantity ?? Number(before.quantity);
    const buyerBrokerage = dto.buyerBrokerage ?? Number(before.buyerBrokerage);
    const sellerBrokerage = dto.sellerBrokerage ?? Number(before.sellerBrokerage);
    // The due date follows the trade date: a new term, or a moved trade date on a
    // deal that has a term, recalculates it; dueDays = null clears both. An older
    // explicit due date (no term) is left alone until a term is picked.
    const date = dto.date ? new Date(dto.date) : before.date;
    let due: { dueDays?: number | null; dueDate?: Date | null } = {};
    if (dto.dueDays === null) due = { dueDays: null, dueDate: null };
    else if (dto.dueDays) due = { dueDays: dto.dueDays, dueDate: dueDateFrom(date, dto.dueDays) };
    else if (dto.date && before.dueDays) due = { dueDate: dueDateFrom(date, before.dueDays) };

    // Stock: a purchase with sales keeps its buyer / material / enough qty; a
    // self-firm sale re-checks its source. An older sale with no source stays
    // editable until its seller, material, qty or source is changed.
    const next = {
      buyerPartyId: dto.buyerPartyId ?? before.buyerPartyId!,
      sellerPartyId: dto.sellerPartyId ?? before.sellerPartyId!,
      productId: dto.productId ?? before.productId,
    };
    await this.stock.assertPurchaseEdit(before, { buyerPartyId: next.buyerPartyId, productId: next.productId, quantity: qty });
    const wantedSource = dto.sourceDealId !== undefined ? dto.sourceDealId : before.sourceDealId;
    const stockChanged =
      next.sellerPartyId !== before.sellerPartyId || next.productId !== before.productId ||
      qty !== Number(before.quantity) || wantedSource !== before.sourceDealId;
    const sourceDealId = await this.stock.resolveSource({
      companyId: user.companyId, sellerPartyId: next.sellerPartyId, productId: next.productId,
      quantity: qty, sourceDealId: wantedSource, saleId: id, required: stockChanged || !!before.sourceDealId,
    });

    const row = await this.prisma.deal.update({
      where: { id },
      data: {
        date: dto.date ? new Date(dto.date) : undefined,
        buyerPartyId: dto.buyerPartyId ?? undefined,
        sellerPartyId: dto.sellerPartyId ?? undefined,
        productId: dto.productId ?? undefined,
        quantity: qty,
        rate: dto.rate ?? undefined,
        buyerBrokerage,
        sellerBrokerage,
        brokerageTotal: brokerageTotal(qty, buyerBrokerage, sellerBrokerage),
        // undefined = leave as is; null = cleared in the form
        port: dto.port,
        paymentCondition: dto.paymentCondition,
        liftingDate: dto.liftingDate === undefined ? undefined : dto.liftingDate ? new Date(dto.liftingDate) : null,
        shipmentMonth: dto.shipmentMonth,
        deposit: dto.deposit,
        ...due,
        sourceDealId,
        updatedById: user.id,
      },
    });
    await this.auditWrite(user, 'UPDATE', id, `Updated deal ${before.dealNo}`, ctx, AuditService.diff(before, row));
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string, ctx: Ctx) {
    const deal = await this.get(user, id);
    await this.stock.assertCanDelete(deal);
    await this.prisma.deal.update({ where: { id }, data: { deletedAt: new Date(), updatedById: user.id } });
    await this.audit.record({
      companyId: user.companyId,
      actorId: user.id,
      action: 'DELETE',
      entityType: 'Deal',
      entityId: id,
      summary: 'Soft-deleted deal',
      ...ctx,
    });
    return { deleted: true };
  }

  /**
   * Bulk-create deals from a parsed spreadsheet. All-or-nothing: the whole file
   * is validated first, then inserted in ONE transaction. Blank brokerage cells
   * default to half the material's brokerage, like the form.
   */
  async importFile(user: RequestUser, buffer: Buffer | undefined, ctx: Ctx) {
    if (!buffer || !buffer.length) throw new BadRequestException('No file uploaded.');
    const { headers, rows } = parseWorkbook(buffer);
    if (!rows.length) throw new BadRequestException('The file has no data rows.');
    const missing = requiredHeaders().filter(
      (h) => !headers.some((x) => x.trim().toLowerCase() === h.toLowerCase()),
    );
    if (missing.length) throw new BadRequestException(`Missing required column(s): ${missing.join(', ')}`);

    const [parties, products, deals] = await Promise.all([
      this.prisma.party.findMany({ where: { companyId: user.companyId, deletedAt: null }, select: { id: true, name: true } }),
      this.prisma.product.findMany({ where: { companyId: user.companyId, deletedAt: null }, select: { id: true, code: true, brokerage: true } }),
      this.prisma.deal.findMany({ where: { companyId: user.companyId, deletedAt: null }, select: { id: true, dealNo: true } }),
    ]);
    const dealIdByNo = new Map(deals.map((d) => [d.dealNo.trim().toLowerCase(), d.id]));
    const lk = {
      partyByName: new Map(parties.map((p) => [p.name.trim().toLowerCase(), { id: p.id }])),
      productByCode: new Map(products.map((p) => [p.code.trim().toLowerCase(), { id: p.id }])),
    };
    const brokerageById = new Map(products.map((p) => [p.id, Number(p.brokerage)]));

    const { records, errors } = resolveImportRows(SPEC_DEAL, headers, rows, lk);
    records.forEach((rec, i) => {
      if (rec.buyerPartyId && rec.buyerPartyId === rec.sellerPartyId) {
        errors.push({ row: i + 2, message: 'Buyer and seller must be different parties' });
      }
      if (rec.sourceDealNo) {
        rec.sourceDealId = dealIdByNo.get(String(rec.sourceDealNo).trim().toLowerCase());
        if (!rec.sourceDealId) errors.push({ row: i + 2, message: `"Sold From" deal ${rec.sourceDealNo} not found` });
      }
    });
    if (errors.length) {
      errors.sort((a, b) => a.row - b.row);
      throw new BadRequestException({ message: `Import failed — ${errors.length} problem(s) found. Nothing was imported.`, errors });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      for (const [i, rec] of records.entries()) {
        const quantity = Number(rec.quantity);
        // Stock is checked row by row inside the transaction, so earlier rows'
        // sales count against what later rows can sell.
        let sourceDealId: string | null;
        try {
          sourceDealId = await this.stock.resolveSource({
            companyId: user.companyId, sellerPartyId: rec.sellerPartyId, productId: rec.productId,
            quantity, sourceDealId: rec.sourceDealId, required: true,
          }, tx);
        } catch (e: any) {
          throw new BadRequestException(`Row ${i + 2}: ${e.message} Nothing was imported.`);
        }
        const half = r4((brokerageById.get(rec.productId) ?? 0) / 2);
        const buyerBrokerage = rec.buyerBrokerage ?? half;
        const sellerBrokerage = rec.sellerBrokerage ?? half;
        const date = rec.date ? new Date(rec.date) : new Date();
        const dealNo = await this.numbering.next(user.companyId, 'DEAL', tx);
        await tx.deal.create({
          data: {
            companyId: user.companyId,
            dealNo,
            date,
            buyerPartyId: rec.buyerPartyId,
            sellerPartyId: rec.sellerPartyId,
            productId: rec.productId,
            quantity,
            rate: Number(rec.rate),
            buyerBrokerage,
            sellerBrokerage,
            brokerageTotal: brokerageTotal(quantity, buyerBrokerage, sellerBrokerage),
            port: rec.port ?? null,
            paymentCondition: rec.paymentCondition ?? null,
            liftingDate: rec.liftingDate ? new Date(rec.liftingDate) : null,
            shipmentMonth: rec.shipmentMonth ?? null,
            deposit: rec.deposit ?? null,
            dueDays: rec.dueDays ?? null,
            dueDate: dueDateFrom(date, rec.dueDays),
            sourceDealId,
            createdById: user.id,
            updatedById: user.id,
          },
        });
      }
      return records.length;
    });

    await this.audit.record({
      companyId: user.companyId,
      actorId: user.id,
      action: 'IMPORT',
      entityType: 'Deal',
      summary: `Imported ${created} deal(s)`,
      ...ctx,
    });
    return { imported: created };
  }

  private async auditWrite(
    user: RequestUser,
    action: 'CREATE' | 'UPDATE',
    id: string,
    summary: string,
    ctx: Ctx,
    diff?: Record<string, unknown>,
  ) {
    await this.audit.record({
      companyId: user.companyId,
      actorId: user.id,
      action,
      entityType: 'Deal',
      entityId: id,
      summary,
      diff,
      ...ctx,
    });
  }
}
