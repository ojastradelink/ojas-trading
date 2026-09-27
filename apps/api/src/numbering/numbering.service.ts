import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Generates gapless, human-readable document numbers per company + key
 * (TRADE, PO, SO, INVOICE, PAYMENT, DISPATCH ...). The counter is incremented
 * atomically inside a transaction so concurrent requests never collide.
 *
 * Format:  <PREFIX><YEAR?>-<zero-padded-seq>   e.g.  TRD-25-26-00042
 */
@Injectable()
export class NumberingService {
  constructor(private readonly prisma: PrismaService) {}

  private defaults(
    key: string,
  ): { prefix: string; padding: number; resetYearly: boolean } {
    // Deal numbers follow the workbook style: PREFIX-### (no FY suffix).
    const map: Record<
      string,
      { prefix: string; padding: number; resetYearly: boolean }
    > = {
      DEAL: { prefix: 'DL', padding: 3, resetYearly: false },
      PARTY: { prefix: 'PTY', padding: 4, resetYearly: false },
    };
    return map[key] ?? { prefix: key, padding: 5, resetYearly: true };
  }

  /** Indian FY label for a date, e.g. 2026-06-27 -> "26-27". */
  private fyLabel(date = new Date(), fyStartMonth = 4): string {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const startYear = m >= fyStartMonth ? y : y - 1;
    const a = String(startYear).slice(-2);
    const b = String(startYear + 1).slice(-2);
    return `${a}-${b}`;
  }

  async next(
    companyId: string,
    key: string,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    const client = tx ?? this.prisma;
    const def = this.defaults(key);
    const yearLabel = this.fyLabel();

    // upsert-then-increment within the (optional) transaction
    const existing = await client.numberSequence.findUnique({
      where: { companyId_key: { companyId, key } },
    });

    let seq: { prefix: string; padding: number; nextValue: number };
    if (!existing) {
      const created = await client.numberSequence.create({
        data: {
          companyId,
          key,
          prefix: def.prefix,
          padding: def.padding,
          nextValue: 2,
          resetYearly: def.resetYearly,
          yearLabel,
        },
      });
      seq = { prefix: created.prefix, padding: created.padding, nextValue: 1 };
    } else {
      const resetNeeded =
        existing.resetYearly && existing.yearLabel !== yearLabel;
      const updated = await client.numberSequence.update({
        where: { companyId_key: { companyId, key } },
        data: resetNeeded
          ? { nextValue: 2, yearLabel }
          : { nextValue: { increment: 1 } },
      });
      seq = {
        prefix: existing.prefix,
        padding: existing.padding,
        nextValue: resetNeeded ? 1 : updated.nextValue - 1,
      };
    }

    const padded = String(seq.nextValue).padStart(seq.padding, '0');
    const yearPart = def.resetYearly ? `-${yearLabel}` : '';
    return `${seq.prefix}${yearPart}-${padded}`;
  }
}
