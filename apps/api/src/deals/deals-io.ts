// ═══════════════════════════════════════════════════════════════════════════
//  Deals import / export — single source of truth for columns.
//  Each column knows how to render itself for EXPORT and (optionally) how to be
//  parsed back on IMPORT. Computed columns (brokerage total, due date) have no
//  `imp` descriptor, so they are ignored on import and recomputed by the service.
// ═══════════════════════════════════════════════════════════════════════════
import * as XLSX from 'xlsx';
import { DUE_DAY_OPTIONS } from './dto/deals.dto';

export type ImportKind = 'string' | 'number' | 'date' | 'enum' | 'bool' | 'party' | 'product';

export interface DealColSpec {
  header: string;
  get: (row: any) => any; // export value
  imp?: {
    key: string; // target field on the create payload / resolved id
    kind: ImportKind;
    required?: boolean;
    enum?: string[];
    allowed?: number[]; // 'number' only: the permitted values
  };
}

const n = (v: any) => (v == null ? '' : Number(v));
const d = (v: any): string => {
  if (!v) return '';
  const dt = new Date(v);
  return Number.isNaN(dt.getTime()) ? '' : dt.toISOString().slice(0, 10);
};

// One sheet shape for every deal. Import mirrors the form: Buyer, Seller,
// Material, Qty and Rate are required; blank brokerage cells default to half
// the material's brokerage, and the due date is Date + Due Days (service).
export const SPEC_DEAL: DealColSpec[] = [
  { header: 'Deal ID', get: (r) => r.dealNo },
  { header: 'Date', get: (r) => d(r.date), imp: { key: 'date', kind: 'date' } },
  { header: 'Buyer', get: (r) => r.buyerParty?.name ?? '', imp: { key: 'buyerPartyId', kind: 'party', required: true } },
  { header: 'Seller', get: (r) => r.sellerParty?.name ?? '', imp: { key: 'sellerPartyId', kind: 'party', required: true } },
  { header: 'Material', get: (r) => r.product?.code ?? '', imp: { key: 'productId', kind: 'product', required: true } },
  { header: 'Qty (MT)', get: (r) => n(r.quantity), imp: { key: 'quantity', kind: 'number', required: true } },
  { header: 'Rate', get: (r) => n(r.rate), imp: { key: 'rate', kind: 'number', required: true } },
  { header: 'Buyer Brokerage /MT', get: (r) => n(r.buyerBrokerage), imp: { key: 'buyerBrokerage', kind: 'number' } },
  { header: 'Seller Brokerage /MT', get: (r) => n(r.sellerBrokerage), imp: { key: 'sellerBrokerage', kind: 'number' } },
  { header: 'Brokerage Total', get: (r) => n(r.brokerageTotal) },
  { header: 'Port', get: (r) => r.port ?? '', imp: { key: 'port', kind: 'string' } },
  { header: 'Payment Condition', get: (r) => r.paymentCondition ?? '', imp: { key: 'paymentCondition', kind: 'string' } },
  { header: 'Lifting Due Date', get: (r) => d(r.liftingDate), imp: { key: 'liftingDate', kind: 'date' } },
  { header: 'Shipment', get: (r) => r.shipmentMonth ?? '', imp: { key: 'shipmentMonth', kind: 'string' } },
  { header: 'Deposit', get: (r) => n(r.deposit), imp: { key: 'deposit', kind: 'number' } },
  { header: 'Due Days', get: (r) => n(r.dueDays), imp: { key: 'dueDays', kind: 'number', allowed: DUE_DAY_OPTIONS } },
  { header: 'Due Date', get: (r) => d(r.dueDate) }, // calculated: Date + Due Days
  // Required when the seller is our own firm: the purchase deal no. it sells from.
  { header: 'Sold From', get: (r) => r.sourceDeal?.dealNo ?? '', imp: { key: 'sourceDealNo', kind: 'string' } },
];

// ── Workbook build (export) ──────────────────────────────────────────────────
export function buildDealWorkbook(rows: any[]): Buffer {
  const cols = SPEC_DEAL;
  const aoa = [cols.map((c) => c.header), ...rows.map((r) => cols.map((c) => c.get(r)))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = cols.map((c) => ({ wch: Math.max(10, c.header.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Deals');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

// ── Workbook parse (import) — handles .xlsx and .csv ─────────────────────────
export function parseWorkbook(buffer: Buffer): { headers: string[]; rows: Record<string, any>[] } {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { headers: [], rows: [] };
  const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true, blankrows: false });
  if (!aoa.length) return { headers: [], rows: [] };
  const headers = (aoa[0] || []).map((h) => String(h ?? '').trim());
  const rows = aoa.slice(1).map((arr) => {
    const o: Record<string, any> = {};
    headers.forEach((h, i) => (o[h] = arr[i] ?? null));
    return o;
  });
  return { headers, rows };
}

// ── Row validation + resolution ──────────────────────────────────────────────
export interface ImportLookups {
  partyByName: Map<string, { id: string }>;
  productByCode: Map<string, { id: string }>;
}
export interface ImportError {
  row: number;
  message: string;
}

const norm = (s: any) => String(s ?? '').trim().toLowerCase();

/** Validate/parse every row against the spec. Returns aligned records + all errors. */
export function resolveImportRows(
  spec: DealColSpec[],
  headers: string[],
  rows: Record<string, any>[],
  lk: ImportLookups,
): { records: Record<string, any>[]; errors: ImportError[] } {
  // map each spec column to the actual header string present in the file (case-insensitive)
  const headerFor = new Map<string, string | null>();
  for (const c of spec) {
    const found = headers.find((h) => norm(h) === norm(c.header));
    headerFor.set(c.header, found ?? null);
  }

  const errors: ImportError[] = [];
  const records: Record<string, any>[] = [];

  rows.forEach((raw, i) => {
    const rowNo = i + 2; // +1 for header row, +1 for 1-based
    const rec: Record<string, any> = {};
    const push = (m: string) => errors.push({ row: rowNo, message: m });

    for (const c of spec) {
      if (!c.imp) continue;
      const hdr = headerFor.get(c.header);
      const rawVal = hdr ? raw[hdr] : null;
      const blank = rawVal == null || String(rawVal).trim() === '';

      if (blank) {
        if (c.imp.required) push(`"${c.header}" is required`);
        continue;
      }

      switch (c.imp.kind) {
        case 'string':
          rec[c.imp.key] = String(rawVal).trim();
          break;
        case 'number': {
          const num = Number(String(rawVal).replace(/,/g, '').trim());
          if (!Number.isFinite(num)) push(`"${c.header}" must be a number (got "${rawVal}")`);
          else if (num < 0) push(`"${c.header}" cannot be negative`);
          else if (c.imp.allowed && !c.imp.allowed.includes(num)) push(`"${c.header}" must be one of ${c.imp.allowed.join(', ')} (got "${rawVal}")`);
          else rec[c.imp.key] = num;
          break;
        }
        case 'date': {
          const dt = rawVal instanceof Date ? rawVal : new Date(String(rawVal));
          if (Number.isNaN(dt.getTime())) push(`"${c.header}" is not a valid date (got "${rawVal}")`);
          else rec[c.imp.key] = dt.toISOString();
          break;
        }
        case 'enum': {
          const up = String(rawVal).trim().toUpperCase().replace(/\s+/g, '_');
          if (c.imp.enum && !c.imp.enum.includes(up)) push(`"${c.header}" must be one of ${c.imp.enum.join(', ')} (got "${rawVal}")`);
          else rec[c.imp.key] = up;
          break;
        }
        case 'bool':
          rec[c.imp.key] = /^(y|yes|true|1)$/i.test(String(rawVal).trim());
          break;
        case 'party': {
          const hit = lk.partyByName.get(norm(rawVal));
          if (!hit) push(`Party "${rawVal}" not found`);
          else rec[c.imp.key] = hit.id;
          break;
        }
        case 'product': {
          const hit = lk.productByCode.get(norm(rawVal));
          if (!hit) push(`Material "${rawVal}" not found`);
          else rec[c.imp.key] = hit.id;
          break;
        }
      }
    }

    records.push(rec);
  });

  return { records, errors };
}

/** Headers that must be present in the uploaded file. */
export function requiredHeaders(): string[] {
  return SPEC_DEAL.filter((c) => c.imp?.required).map((c) => c.header);
}
