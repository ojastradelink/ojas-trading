// ═══════════════════════════════════════════════════════════════════════════
//  Degum final payment — the client's "Payment Calculator" workbook:
//    Net Rate   = Rate + Duty                 (₹/MT)
//    Amount     = Net Rate × Qty
//    GST        = Amount × 5%
//    Basic      = Amount + GST
//    TDS        = Amount × 0.1%               (on the pre-GST amount)
//    Total      = Basic − TDS
//    Net Payable= Total − Deposit             → the deal's final payment
//  Mirrored in web/src/lib/degum-config.ts for the calculator's what-if inputs.
// ═══════════════════════════════════════════════════════════════════════════

export const GST_RATE = 0.05;
export const TDS_RATE = 0.001;

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface DegumPayment {
  rate: number;
  duty: number;
  quantity: number;
  gstRate: number;
  tdsRate: number;
  netRate: number;
  amount: number;
  gst: number;
  basicAmount: number;
  tds: number;
  totalAmount: number;
  deposit: number;
  netPayable: number;
}

/** Full breakdown, each figure rounded to paise (Excel shows #,##0.00). */
export function degumPayment(rate: number, duty: number, quantity: number, deposit: number): DegumPayment {
  const netRate = rate + duty;
  const amount = netRate * quantity;
  const gst = amount * GST_RATE;
  const basicAmount = amount + gst;
  const tds = amount * TDS_RATE;
  const totalAmount = basicAmount - tds;
  const netPayable = totalAmount - deposit;
  return {
    rate, duty, quantity, gstRate: GST_RATE, tdsRate: TDS_RATE,
    netRate: r2(netRate), amount: r2(amount), gst: r2(gst), basicAmount: r2(basicAmount),
    tds: r2(tds), totalAmount: r2(totalAmount), deposit: r2(deposit), netPayable: r2(netPayable),
  };
}

/** A degum deal's final payment — null until the duty is entered. */
export function paymentForDeal(deal: {
  rate: unknown; quantity: unknown; deposit: unknown; degumDetail?: { duty: unknown } | null;
}): DegumPayment | null {
  const duty = deal.degumDetail?.duty;
  if (duty == null) return null;
  return degumPayment(Number(deal.rate), Number(duty), Number(deal.quantity), Number(deal.deposit ?? 0));
}
