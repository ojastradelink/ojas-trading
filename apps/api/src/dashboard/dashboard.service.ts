import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const num = (v: any) => Number(v ?? 0);

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * All dashboard data in ONE response. The queries run in parallel
   * server-side (fast, intra-region), so the browser makes a single
   * round-trip instead of several — a big win on high-latency links.
   */
  async overview(companyId: string) {
    const [summary, byMaterial, monthly, recentDeals, recent] = await Promise.all([
      this.summary(companyId),
      this.brokerageByMaterial(companyId),
      this.monthlyBrokerage(companyId),
      this.recentDeals(companyId),
      this.recentActivity(companyId),
    ]);
    return { summary, byMaterial, monthly, recentDeals, recent };
  }

  /** Headline KPIs across all live deals. */
  async summary(companyId: string) {
    const [row] = await this.prisma.$queryRaw<
      { deals: bigint; qty: number; tradeValue: number; brokerage: number; buyerBrokerage: number; sellerBrokerage: number; deposits: number }[]
    >`
      SELECT COUNT(*)                                        AS deals,
             COALESCE(SUM("quantity"), 0)::float8             AS qty,
             COALESCE(SUM("quantity" * "rate"), 0)::float8    AS "tradeValue",
             COALESCE(SUM("brokerageTotal"), 0)::float8       AS brokerage,
             COALESCE(SUM("quantity" * "buyerBrokerage"), 0)::float8  AS "buyerBrokerage",
             COALESCE(SUM("quantity" * "sellerBrokerage"), 0)::float8 AS "sellerBrokerage",
             COALESCE(SUM("deposit"), 0)::float8              AS deposits
      FROM "deals"
      WHERE "companyId" = ${companyId} AND "deletedAt" IS NULL;`;
    return {
      totalDeals: Number(row?.deals ?? 0),
      totalQuantity: num(row?.qty),
      totalTradeValue: num(row?.tradeValue),
      brokerageEarned: num(row?.brokerage),
      buyerBrokerage: num(row?.buyerBrokerage),
      sellerBrokerage: num(row?.sellerBrokerage),
      totalDeposits: num(row?.deposits),
    };
  }

  /** Deals, quantity and brokerage per material — biggest earner first. */
  async brokerageByMaterial(companyId: string) {
    const [groups, products] = await Promise.all([
      this.prisma.deal.groupBy({
        by: ['productId'],
        where: { companyId, deletedAt: null },
        _sum: { quantity: true, brokerageTotal: true },
        _count: { _all: true },
      }),
      // include soft-deleted products so referenced products still resolve a name
      this.prisma.product.findMany({ where: { companyId } }),
    ]);
    const byId = new Map(products.map((p) => [p.id, p]));
    return groups
      .map((g) => {
        const p = g.productId ? byId.get(g.productId) : undefined;
        const code = p ? (p.deletedAt ? `${p.code} (deleted)` : p.code) : 'No material';
        return {
          productId: g.productId,
          code,
          name: p?.name ?? '',
          deals: g._count._all,
          qty: num(g._sum.quantity),
          brokerage: num(g._sum.brokerageTotal),
        };
      })
      .sort((a, b) => b.brokerage - a.brokerage);
  }

  /** Brokerage + quantity per month over the last 12 months (by deal date). */
  async monthlyBrokerage(companyId: string) {
    const rows = await this.prisma.$queryRaw<{ month: Date; brokerage: number; qty: number }[]>`
      SELECT date_trunc('month', "date") AS month,
             COALESCE(SUM("brokerageTotal"), 0)::float8 AS brokerage,
             COALESCE(SUM("quantity"), 0)::float8 AS qty
      FROM "deals"
      WHERE "companyId" = ${companyId} AND "deletedAt" IS NULL
        AND "date" >= date_trunc('month', now()) - interval '11 months'
      GROUP BY 1 ORDER BY 1 ASC;`;
    return rows.map((r) => ({ month: r.month, brokerage: num(r.brokerage), qty: num(r.qty) }));
  }

  /** Latest deals entered. */
  async recentDeals(companyId: string, limit = 8) {
    const rows = await this.prisma.deal.findMany({
      where: { companyId, deletedAt: null },
      include: { buyerParty: true, sellerParty: true, product: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((d) => ({
      id: d.id,
      dealNo: d.dealNo,
      date: d.date,
      buyer: d.buyerParty?.name ?? '—',
      seller: d.sellerParty?.name ?? '—',
      product: d.product?.code ?? '—',
      qty: num(d.quantity),
      rate: num(d.rate),
      brokerage: num(d.brokerageTotal),
    }));
  }

  async recentActivity(companyId: string, limit = 15) {
    return this.prisma.auditLog.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
