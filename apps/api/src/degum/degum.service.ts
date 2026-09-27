import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { buildPageMeta } from '../common/dto/pagination.dto';
import { RequestUser } from '../common/types/request-user';
import { PrismaService } from '../prisma/prisma.service';
import { DegumQueryDto, SaveDegumDetailDto } from './degum.dto';
import { paymentForDeal } from './payment';

export interface Ctx {
  ipAddress?: string | null;
  userAgent?: string | null;
}

const INCLUDE = { buyerParty: true, sellerParty: true, product: true, degumDetail: true } as const;
// Sortable deal columns, and shipment columns (sorted through the detail relation).
const DEAL_SORTS = ['dealNo', 'date', 'quantity', 'createdAt'];
const DETAIL_SORTS = ['vesselEta', 'clearanceDate', 'paymentDueDate'];

/** Payment due = actual clearance + term (whole days); needs both. */
const paymentDueFrom = (clearance: Date | null, days?: number | null) =>
  clearance && days ? new Date(clearance.getTime() + days * 86_400_000) : null;

/**
 * Attach the final-payment breakdown. Calculated on every read from the deal's
 * rate / qty / deposit and the shipment duty, so it can never go stale.
 */
const withPayment = <T extends Parameters<typeof paymentForDeal>[0]>(deal: T) => ({ ...deal, payment: paymentForDeal(deal) });

// ═══════════════════════════════════════════════════════════════════════════
//  Degum — shipment tracking for deals on a degum material (e.g. CDSBO).
//  Reads the deal as-is and stores vessel / clearance / payment details in
//  degum_details, so nothing here ever writes to the deal.
// ═══════════════════════════════════════════════════════════════════════════
@Injectable()
export class DegumService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private buildWhere(user: RequestUser, q: DegumQueryDto): Prisma.DealWhereInput {
    const where: Prisma.DealWhereInput = {
      companyId: user.companyId,
      deletedAt: null,
      product: { isDegum: true },
    };
    if (q.buyerPartyId) where.buyerPartyId = q.buyerPartyId;
    if (q.sellerPartyId) where.sellerPartyId = q.sellerPartyId;
    if (q.etaFrom || q.etaTo) {
      const range: Prisma.DateTimeNullableFilter = {};
      if (q.etaFrom) range.gte = new Date(q.etaFrom);
      if (q.etaTo) {
        const to = new Date(q.etaTo);
        to.setHours(23, 59, 59, 999); // inclusive end-of-day
        range.lte = to;
      }
      where.degumDetail = { is: { vesselEta: range } };
    }
    if (q.search) {
      const contains = { contains: q.search, mode: 'insensitive' as const };
      where.OR = [
        { dealNo: contains },
        { buyerParty: { name: contains } },
        { sellerParty: { name: contains } },
        { degumDetail: { is: { vesselName: contains } } },
        { degumDetail: { is: { terminal: contains } } },
        { degumDetail: { is: { tank: contains } } },
        { degumDetail: { is: { chain: contains } } },
      ];
    }
    return where;
  }

  private buildOrderBy(q: DegumQueryDto): Prisma.DealOrderByWithRelationInput {
    const sort = q.sortDir === 'asc' ? 'asc' : 'desc';
    if (q.sortBy && DEAL_SORTS.includes(q.sortBy)) return { [q.sortBy]: sort };
    // Deals with no shipment date yet sink to the bottom either way.
    if (q.sortBy && DETAIL_SORTS.includes(q.sortBy)) return { degumDetail: { [q.sortBy]: { sort, nulls: 'last' } } };
    return { date: 'desc' };
  }

  async list(user: RequestUser, q: DegumQueryDto) {
    const where = this.buildWhere(user, q);
    const [items, total] = await Promise.all([
      this.prisma.deal.findMany({ where, include: INCLUDE, orderBy: [this.buildOrderBy(q), { createdAt: 'desc' }], skip: q.skip, take: q.limit }),
      this.prisma.deal.count({ where }),
    ]);
    return { items: items.map(withPayment), meta: buildPageMeta(total, q.page, q.limit) };
  }

  /** A live deal on a degum material, with its shipment details (if any). */
  async get(user: RequestUser, dealId: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, companyId: user.companyId, deletedAt: null },
      include: INCLUDE,
    });
    if (!deal) throw new NotFoundException('Deal not found');
    if (!deal.product?.isDegum) throw new BadRequestException('This deal is not on a degum material.');
    return withPayment(deal);
  }

  /** Create or replace the shipment details of a degum deal. The deal row is untouched. */
  async save(user: RequestUser, dealId: string, dto: SaveDegumDetailDto, ctx: Ctx) {
    const deal = await this.get(user, dealId);
    const before = deal.degumDetail;
    const clearanceDate = dto.clearanceDate ? new Date(dto.clearanceDate) : null;
    const text = (v?: string | null) => (v?.trim() ? v.trim() : null);
    const data = {
      vesselName: text(dto.vesselName),
      vesselEta: dto.vesselEta ? new Date(dto.vesselEta) : null,
      clearanceDate,
      tank: text(dto.tank),
      terminal: text(dto.terminal),
      chain: text(dto.chain),
      duty: dto.duty ?? null,
      paymentDueDays: dto.paymentDueDays ?? null,
      paymentDueDate: paymentDueFrom(clearanceDate, dto.paymentDueDays),
      updatedById: user.id,
    };
    const row = await this.prisma.degumDetail.upsert({
      where: { dealId },
      create: { companyId: user.companyId, dealId, createdById: user.id, ...data },
      update: data,
    });
    await this.audit.record({
      companyId: user.companyId,
      actorId: user.id,
      action: before ? 'UPDATE' : 'CREATE',
      entityType: 'DegumDetail',
      entityId: row.id,
      summary: `${before ? 'Updated' : 'Added'} degum details for deal ${deal.dealNo}`,
      diff: before ? AuditService.diff(before, row) : undefined,
      ...ctx,
    });
    return this.get(user, dealId);
  }
}
