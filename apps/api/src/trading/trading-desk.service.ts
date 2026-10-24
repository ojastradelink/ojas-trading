import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildPageMeta } from '../common/dto/pagination.dto';
import { RequestUser } from '../common/types/request-user';
import { PrismaService } from '../prisma/prisma.service';
import { SourceQueryDto, TradingDeskQueryDto } from './trading.dto';

const num = (v: unknown) => Number(v ?? 0);
const r3 = (n: number) => Number(n.toFixed(3));
const DAY = 86_400_000;

/** Whole calendar days from today (UTC) to a date (the lifting due date); negative = overdue. */
function daysLeft(due: Date | null): number | null {
  if (!due) return null;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const d = new Date(due);
  return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - today) / DAY);
}

// Contract expiry (lifting due date) soonest first; trades with no lifting date last.
const EXPIRY_FIRST: Prisma.DealOrderByWithRelationInput[] = [
  { liftingDate: { sort: 'asc', nulls: 'last' } },
  { date: 'desc' },
  { createdAt: 'desc' },
];

// ═══════════════════════════════════════════════════════════════════════════
//  Trading desk — every trade our own (self) firm makes. Purchases are stock in
//  hand (qty − what was sold from them); sales show which purchase they drew on.
// ═══════════════════════════════════════════════════════════════════════════
@Injectable()
export class TradingDeskService {
  constructor(private readonly prisma: PrismaService) {}

  async desk(user: RequestUser, q: TradingDeskQueryDto) {
    const base: Prisma.DealWhereInput = { companyId: user.companyId, deletedAt: null };
    if (q.productId) base.productId = q.productId;
    const selfFilter = q.selfPartyId ? { id: q.selfPartyId, isSelf: true } : { isSelf: true };

    const [selfFirms, purchases, sales] = await Promise.all([
      this.prisma.party.findMany({
        where: { companyId: user.companyId, deletedAt: null, isSelf: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.deal.findMany({
        where: { ...base, buyerParty: selfFilter },
        include: {
          buyerParty: true, sellerParty: true, product: true,
          sales: { where: { deletedAt: null }, select: { id: true, dealNo: true, quantity: true } },
        },
        orderBy: EXPIRY_FIRST,
      }),
      this.prisma.deal.findMany({
        where: { ...base, sellerParty: selfFilter },
        include: { buyerParty: true, sellerParty: true, product: true, sourceDeal: { select: { id: true, dealNo: true } } },
        orderBy: EXPIRY_FIRST,
      }),
    ]);

    const holdings = purchases.map((d) => {
      const sold = d.sales.reduce((n, s) => n + num(s.quantity), 0);
      return {
        id: d.id,
        dealNo: d.dealNo,
        date: d.date,
        selfFirm: d.buyerParty?.name ?? '—',
        selfPartyId: d.buyerPartyId,
        supplier: d.sellerParty?.name ?? '—',
        productId: d.productId,
        product: d.product ? { code: d.product.code, name: d.product.name } : null,
        quantity: num(d.quantity),
        sold: r3(sold),
        inHand: r3(num(d.quantity) - sold),
        rate: num(d.rate),
        dueDate: d.dueDate,
        liftingDate: d.liftingDate,
        daysLeft: daysLeft(d.liftingDate), // colour coding runs off the lifting due date
        sales: d.sales.map((s) => ({ dealNo: s.dealNo, quantity: num(s.quantity) })),
      };
    });

    // In hand per self firm + material (all purchases, before hiding sold-out rows).
    const byMaterial = new Map<string, { selfFirm: string; code: string; name: string; bought: number; sold: number; inHand: number }>();
    for (const h of holdings) {
      const key = `${h.selfPartyId}|${h.productId}`;
      const m = byMaterial.get(key) ?? { selfFirm: h.selfFirm, code: h.product?.code ?? '—', name: h.product?.name ?? '', bought: 0, sold: 0, inHand: 0 };
      m.bought += h.quantity; m.sold += h.sold; m.inHand += h.inHand;
      byMaterial.set(key, m);
    }
    const summary = [...byMaterial.values()]
      .map((m) => ({ ...m, bought: r3(m.bought), sold: r3(m.sold), inHand: r3(m.inHand) }))
      .sort((a, b) => b.inHand - a.inHand);

    return {
      selfFirms,
      summary,
      holdings: q.showSoldOut === 'true' ? holdings : holdings.filter((h) => h.inHand > 1e-6),
      sales: sales.map((d) => ({
        id: d.id,
        dealNo: d.dealNo,
        date: d.date,
        selfFirm: d.sellerParty?.name ?? '—',
        buyer: d.buyerParty?.name ?? '—',
        product: d.product ? { code: d.product.code, name: d.product.name } : null,
        quantity: num(d.quantity),
        rate: num(d.rate),
        dueDate: d.dueDate,
        liftingDate: d.liftingDate,
        daysLeft: daysLeft(d.liftingDate), // colour coding runs off the lifting due date
        sourceDeal: d.sourceDeal, // null = an older sale not linked to a purchase yet
      })),
    };
  }

  /**
   * Purchases a self firm can sell from — the deal form's "Selling from" list.
   * When editing a sale, its own qty doesn't count against its source.
   */
  async sources(user: RequestUser, q: SourceQueryDto) {
    const where: Prisma.DealWhereInput = {
      companyId: user.companyId,
      deletedAt: null,
      buyerPartyId: q.sellerPartyId,
      buyerParty: { isSelf: true },
    };
    if (q.productId) where.productId = q.productId;
    if (q.search) where.OR = [{ dealNo: { contains: q.search, mode: 'insensitive' } }, { product: { code: { contains: q.search, mode: 'insensitive' } } }];
    const rows = await this.prisma.deal.findMany({
      where,
      include: {
        product: true, sellerParty: true,
        sales: { where: { deletedAt: null, ...(q.excludeDealId ? { id: { not: q.excludeDealId } } : {}) }, select: { quantity: true } },
      },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }], // oldest stock first
    });
    const items = rows
      .map((d) => {
        const sold = d.sales.reduce((n, s) => n + num(s.quantity), 0);
        return {
          id: d.id,
          dealNo: d.dealNo,
          date: d.date,
          productId: d.productId,
          product: d.product,
          supplier: d.sellerParty?.name ?? '—',
          quantity: num(d.quantity),
          rate: num(d.rate),
          inHand: r3(num(d.quantity) - sold),
          dueDate: d.dueDate,
        };
      })
      .filter((d) => d.inHand > 1e-6 || d.id === q.currentSourceId);
    return { items, meta: buildPageMeta(items.length, 1, Math.max(items.length, 1)) };
  }
}
