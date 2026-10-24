import type { DealColumn } from './deal-config';

/** Payment is due this many days after the vessel's actual clearance. */
export const PAYMENT_DUE_OPTIONS = Array.from({ length: 11 }, (_, i) => i + 5); // 5 … 15

export const DEGUM_ENDPOINT = '/degum';

/**
 * Default Degum flag for a new product — mirrors the API (master-data/degum-material.ts):
 * code CDSBO / CSBDO (letters only), or a name saying "crude … degummed".
 */
export function looksDegum(code?: string, name?: string): boolean {
  const c = (code ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  if (c === 'CDSBO' || c === 'CSBDO') return true;
  const n = (name ?? '').toLowerCase();
  return n.includes('crude') && n.includes('degum');
}

export interface DegumField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select';
  options?: { value: string; label: string }[];
}

/** Shipment columns shown after the deal's own columns (read off `degumDetail`). */
export const DEGUM_COLUMNS: DealColumn[] = [
  { key: 'degumDetail.vesselName', label: 'Vessel' },
  { key: 'degumDetail.vesselEta', label: 'Tentative Arrival', fmt: 'date' },
  { key: 'degumDetail.clearanceDate', label: 'Actual Clearance', fmt: 'date' },
  { key: 'degumDetail.tank', label: 'Tank' },
  { key: 'degumDetail.terminal', label: 'Terminal' },
  { key: 'degumDetail.chain', label: 'Chain' },
  { key: 'degumDetail.duty', label: 'Duty ₹/MT', fmt: 'money' },
  { key: 'degumDetail.paymentDueDays', label: 'Payment Terms (days)', fmt: 'num' },
  { key: 'degumDetail.paymentDueDate', label: 'Payment Due', fmt: 'date' },
  { key: 'payment.netPayable', label: 'Final Payment', fmt: 'money' }, // calculated by the API
];

/** Editable in the Degum form — stored on the shipment record, never on the deal. */
export const DEGUM_FIELDS: DegumField[] = [
  { key: 'vesselName', label: 'Vessel Name', type: 'text' },
  { key: 'vesselEta', label: 'Tentative Arrival at Port', type: 'date' },
  { key: 'clearanceDate', label: 'Actual Vessel Clearance', type: 'date' },
  { key: 'tank', label: 'Tank', type: 'text' },
  { key: 'terminal', label: 'Terminal', type: 'text' },
  { key: 'chain', label: 'Chain', type: 'text' },
  { key: 'duty', label: 'Duty (₹/MT)', type: 'number' },
  {
    key: 'paymentDueDays', label: 'Payment Due Date', type: 'select',
    options: PAYMENT_DUE_OPTIONS.map((d) => ({ value: String(d), label: `${d} days after clearance` })),
  },
];

// ── Final payment — the client's "Payment Calculator" workbook ─────────────────
// Mirrors apps/api/src/degum/payment.ts (the API's figure is what the table shows);
// used here so the calculator's Rate / Deposit inputs recalculate live.
export const GST_RATE = 0.05;
export const TDS_RATE = 0.001;

export interface DegumPayment {
  netRate: number; amount: number; gst: number; basicAmount: number;
  tds: number; totalAmount: number; netPayable: number;
}

export function degumPayment(rate: number, duty: number, quantity: number, deposit: number): DegumPayment {
  const netRate = rate + duty;            // Rate + Duty
  const amount = netRate * quantity;      // Net Rate × Qty
  const gst = amount * GST_RATE;          // Amount × 5%
  const basicAmount = amount + gst;       // Amount + GST
  const tds = amount * TDS_RATE;          // Amount × 0.1%
  const totalAmount = basicAmount - tds;  // Basic − TDS
  return { netRate, amount, gst, basicAmount, tds, totalAmount, netPayable: totalAmount - deposit };
}

export const DEGUM_SORTS = [
  { label: 'Trade date', value: 'date' },
  { label: 'Deal ID', value: 'dealNo' },
  { label: 'Tentative arrival', value: 'vesselEta' },
  { label: 'Actual clearance', value: 'clearanceDate' },
  { label: 'Payment due', value: 'paymentDueDate' },
];
