import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type Client = PrismaService | Prisma.TransactionClient;

const r3 = (n: number) => Number(n.toFixed(3));

// ═══════════════════════════════════════════════════════════════════════════
//  Self-firm stock. A deal where our own (isSelf) firm is the BUYER is stock we
//  hold; a deal where it is the SELLER must name the purchase deal it sells
//  from (sourceDealId). In hand on a purchase = its qty − live sales from it.
// ═══════════════════════════════════════════════════════════════════════════
@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  /** Qty already sold from a purchase (live sales only), optionally ignoring one sale. */
  async soldFrom(purchaseId: string, excludeSaleId?: string | null, client: Client = this.prisma): Promise<number> {
    const agg = await client.deal.aggregate({
      where: { sourceDealId: purchaseId, deletedAt: null, ...(excludeSaleId ? { id: { not: excludeSaleId } } : {}) },
      _sum: { quantity: true },
    });
    return Number(agg._sum.quantity ?? 0);
  }

  /**
   * Validate the stock side of a deal and return the source to store. Only a
   * sale by a self firm carries a source: it must be a live purchase by that
   * same firm, of the same material, with enough qty in hand.
   * `required` is false only when editing an older sale without touching its
   * seller, material, qty or source (so legacy unlinked sales stay editable).
   */
  async resolveSource(
    args: {
      companyId: string;
      sellerPartyId: string;
      productId: string | null;
      quantity: number;
      sourceDealId: string | null | undefined;
      saleId?: string; // the deal being edited
      required: boolean;
    },
    client: Client = this.prisma,
  ): Promise<string | null> {
    const seller = await client.party.findFirst({
      where: { id: args.sellerPartyId, companyId: args.companyId },
      select: { isSelf: true, name: true },
    });
    if (!seller?.isSelf) return null; // only our own firm sells from stock
    if (!args.sourceDealId) {
      if (!args.required) return null;
      throw new BadRequestException(`${seller.name} is your own firm — pick the purchase deal this quantity is sold from.`);
    }
    if (args.sourceDealId === args.saleId) throw new BadRequestException('A deal cannot be sold from itself.');

    const source = await client.deal.findFirst({
      where: { id: args.sourceDealId, companyId: args.companyId, deletedAt: null },
      select: { id: true, dealNo: true, buyerPartyId: true, productId: true, quantity: true, product: { select: { code: true } } },
    });
    if (!source) throw new BadRequestException('The deal you are selling from was not found.');
    if (source.buyerPartyId !== args.sellerPartyId) {
      throw new BadRequestException(`${source.dealNo} was not bought by ${seller.name}, so it can't be sold from.`);
    }
    if (args.productId && source.productId !== args.productId) {
      throw new BadRequestException(`${source.dealNo} is ${source.product?.code ?? 'another material'} — sell the same material you bought.`);
    }
    const inHand = Number(source.quantity) - (await this.soldFrom(source.id, args.saleId, client));
    if (args.quantity > inHand + 1e-6) {
      throw new BadRequestException(
        `Only ${r3(Math.max(inHand, 0))} MT of ${source.product?.code ?? 'this material'} is in hand on ${source.dealNo} — cannot sell ${r3(args.quantity)} MT.`,
      );
    }
    return source.id;
  }

  /** A purchase with sales against it keeps its buyer and material, and can't drop below what's sold. */
  async assertPurchaseEdit(
    purchase: { id: string; dealNo: string; buyerPartyId: string | null; productId: string | null },
    next: { buyerPartyId: string; productId: string | null; quantity: number },
  ) {
    const sold = await this.soldFrom(purchase.id);
    if (sold <= 0) return;
    if (next.buyerPartyId !== purchase.buyerPartyId || next.productId !== purchase.productId) {
      throw new BadRequestException(`${purchase.dealNo} already has sales against it — its buyer and material can't change.`);
    }
    if (next.quantity < sold - 1e-6) {
      throw new BadRequestException(`${r3(sold)} MT of ${purchase.dealNo} is already sold — the quantity can't go below that.`);
    }
  }

  async assertCanDelete(deal: { id: string; dealNo: string }) {
    const sales = await this.prisma.deal.findMany({
      where: { sourceDealId: deal.id, deletedAt: null },
      select: { dealNo: true },
    });
    if (sales.length) {
      throw new BadRequestException(`${deal.dealNo} has sales against it (${sales.map((s) => s.dealNo).join(', ')}) — delete those first.`);
    }
  }
}
