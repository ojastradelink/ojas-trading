'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, FileText, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiGet } from '@/lib/api';
import { formatNumber } from '@/lib/format';

interface Company {
  name: string; legalName?: string | null; addressLine?: string | null;
  city?: string | null; state?: string | null; pincode?: string | null;
  phone?: string | null; email?: string | null; gstin?: string | null;
}

interface ContractData {
  firmName: string; firmAddress: string; firmPhone: string;
  contractNo: string; date: string;
  supplierName: string; supplierCity: string; supplierState: string; supplierContact: string;
  buyerName: string; buyerCity: string; buyerState: string; buyerContact: string;
  itemName: string; qty: string; weight: string; rate: string;
  paymentCondition: string; goodsCondition: string; deliveryCondition: string;
  deliverAt: string; bardanaCondition: string; brokerageNote: string; remarks: string;
}

const TERMS = [
  'Seller & Buyer are bound to agree for every bargain confirmed by us because we confirm bargain only by offer by both parties. Both parties may confirm after bargain.',
  'Buyer & Seller are responsible for payment and any other Govt. document like Goods Transfer Form / Sales Tax forms; we are not responsible for payment in any case.',
  'In condition of any dispute in said bargain, our decision will be final and both parties are bound to agree.',
  'If the disputed matter filed in any court, our role will be only as a witness.',
  'Half brokerage will be charged if the bargain is cancelled and double brokerage will be charged in case of settlement.',
  'All disputes are subject to local jurisdiction only.',
  'Buyer & Seller send bargain confirmation.',
];

function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

function dmy(v?: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function contractStyle(): string {
  return `
  .cn { box-sizing: border-box; width: 190mm; margin: 0 auto; padding: 10mm; background: #fff; color: #111;
        font-family: 'Times New Roman', Georgia, serif; font-size: 12px; line-height: 1.45; }
  .cn * { box-sizing: border-box; }
  .cn-firm { text-align: center; border-bottom: 2px solid #111; padding-bottom: 6px; }
  .cn-firm h1 { margin: 0; font-size: 20px; letter-spacing: .3px; }
  .cn-firm p { margin: 2px 0 0; font-size: 11px; }
  .cn-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 12px; }
  .cn-bar .t { font-size: 15px; font-weight: 700; text-decoration: underline; }
  .cn-parties { display: flex; gap: 0; margin-top: 10px; border: 1px solid #111; }
  .cn-party { width: 50%; padding: 8px 10px; }
  .cn-party + .cn-party { border-left: 1px solid #111; }
  .cn-party .lbl { font-size: 10px; text-transform: uppercase; color: #555; letter-spacing: .4px; }
  .cn-party .nm { font-size: 14px; font-weight: 700; margin: 1px 0 3px; }
  .cn-party .ln { font-size: 12px; }
  table.cn-items { width: 100%; border-collapse: collapse; margin-top: 10px; }
  table.cn-items th, table.cn-items td { border: 1px solid #111; padding: 6px 8px; }
  table.cn-items th { background: #f1f1f1; font-size: 11px; text-transform: uppercase; }
  table.cn-items td.r, table.cn-items th.r { text-align: right; }
  table.cn-items td.item { text-align: left; font-weight: 600; }
  .cn-details { margin-top: 12px; border: 1px solid #111; padding: 8px 10px; }
  .cn-details h3 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .4px; }
  .cn-details .row { display: flex; padding: 2px 0; font-size: 12px; }
  .cn-details .row .k { width: 160px; font-weight: 700; }
  .cn-details .row .v { flex: 1; border-bottom: 1px dotted #999; min-height: 16px; }
  .cn-terms { margin-top: 12px; }
  .cn-terms h3 { margin: 0 0 4px; font-size: 12px; text-transform: uppercase; }
  .cn-terms ol { margin: 0; padding-left: 18px; }
  .cn-terms li { font-size: 10px; line-height: 1.4; margin-bottom: 2px; }
  .cn-sign { display: flex; justify-content: space-between; margin-top: 26px; font-size: 12px; font-weight: 600; }
  @media print { body { margin: 0; } .cn { width: auto; box-shadow: none; } }
  `;
}

function contractBody(d: ContractData): string {
  const row = (k: string, v: string) => `<div class="row"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`;
  return `
  <div class="cn">
    <div class="cn-firm">
      <h1>${esc(d.firmName || 'Ojas Trading')}</h1>
      ${d.firmAddress ? `<p>${esc(d.firmAddress)}</p>` : ''}
      ${d.firmPhone ? `<p>${esc(d.firmPhone)}</p>` : ''}
    </div>
    <div class="cn-bar">
      <span>Cont. No. : <b>${esc(d.contractNo)}</b></span>
      <span class="t">Contract Slip</span>
      <span>Date : <b>${esc(d.date)}</b></span>
    </div>
    <div class="cn-parties">
      <div class="cn-party">
        <div class="lbl">Supplier Name</div>
        <div class="nm">${esc(d.supplierName || '—')}</div>
        ${d.supplierCity || d.supplierState ? `<div class="ln">${esc([d.supplierCity, d.supplierState].filter(Boolean).join(', '))}</div>` : ''}
        ${d.supplierContact ? `<div class="ln">Contact Person : ${esc(d.supplierContact)}</div>` : ''}
      </div>
      <div class="cn-party">
        <div class="lbl">Buyer Name</div>
        <div class="nm">${esc(d.buyerName || '—')}</div>
        ${d.buyerCity || d.buyerState ? `<div class="ln">${esc([d.buyerCity, d.buyerState].filter(Boolean).join(', '))}</div>` : ''}
        ${d.buyerContact ? `<div class="ln">Contact Person : ${esc(d.buyerContact)}</div>` : ''}
      </div>
    </div>
    <table class="cn-items">
      <thead><tr><th class="item">Item Name</th><th class="r">Qty</th><th class="r">Weight (M.T.)</th><th class="r">Rate</th></tr></thead>
      <tbody><tr>
        <td class="item">${esc(d.itemName || '—')}</td>
        <td class="r">${esc(d.qty || '0.00')}</td>
        <td class="r">${esc(d.weight || '0.00')}</td>
        <td class="r">${esc(d.rate || '0.00')}</td>
      </tr></tbody>
    </table>
    <div class="cn-details">
      <h3>Other Details</h3>
      ${row('Payment Condition', d.paymentCondition)}
      ${row('Goods Condition', d.goodsCondition)}
      ${row('Delivery Condition', d.deliveryCondition)}
      ${row('Deliver At', d.deliverAt)}
      ${row('Bardana Condition', d.bardanaCondition)}
      ${d.brokerageNote ? row('Brokerage', d.brokerageNote) : ''}
      ${row('Remarks', d.remarks)}
    </div>
    <div class="cn-terms">
      <h3>Terms &amp; Conditions</h3>
      <ol>${TERMS.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
    </div>
    <div class="cn-sign">
      <span>Buyer / Seller's Signature</span>
      <span>Agent's Signature</span>
    </div>
  </div>`;
}

function printContract(d: ContractData) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.contractNo || 'contract')}</title><style>${contractStyle()}</style></head><body>${contractBody(d)}</body></html>`;
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  iframe.srcdoc = html;
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => iframe.remove(), 1500);
    }
  };
  document.body.appendChild(iframe);
}

export function ContractNoteModal({
  open,
  onClose,
  deal,
}: {
  open: boolean;
  onClose: () => void;
  deal: any | null;
}) {
  const companyQ = useQuery({
    queryKey: ['settings', 'company'],
    queryFn: () => apiGet<Company>('/settings/company'),
    enabled: open,
  });

  const initial = useMemo<ContractData>(() => {
    const c = companyQ.data;
    const firmName = c?.legalName || c?.name || 'Ojas Trading';
    const firmAddress = [c?.addressLine, c?.city, c?.state, c?.pincode].filter(Boolean).join(', ');
    const firmPhone = c?.phone ? `Phone : ${c.phone}` : '';

    const d = deal ?? {};
    // Every deal is Seller → Buyer: the seller is the contract's Supplier.
    const supplier = d.sellerParty;
    const buyer = d.buyerParty;
    const rs = (v: any) => `Rs. ${formatNumber(Number(v ?? 0), 0)}/-`;
    const brokerageNote = `Buyer ${rs(d.buyerBrokerage)} PMT · Seller ${rs(d.sellerBrokerage)} PMT (plus applicable GST)`;
    const deposit = d.deposit != null && Number(d.deposit) > 0 ? `Deposit ${rs(d.deposit)}` : '';

    return {
      firmName,
      firmAddress,
      firmPhone,
      contractNo: d.dealNo ?? '',
      date: dmy(d.date),
      supplierName: supplier?.name ?? '',
      supplierCity: supplier?.city ?? '',
      supplierState: '',
      supplierContact: supplier?.contactPerson ?? '',
      buyerName: buyer?.name ?? '',
      buyerCity: buyer?.city ?? '',
      buyerState: '',
      buyerContact: buyer?.contactPerson ?? '',
      itemName: d.product?.name ?? d.product?.code ?? '',
      qty: '',
      weight: d.quantity != null ? formatNumber(Number(d.quantity), 2) : '',
      rate: d.rate != null ? formatNumber(Number(d.rate), 2) : '',
      paymentCondition: d.paymentCondition ?? '',
      goodsCondition: d.shipmentMonth ? `${d.shipmentMonth} Shipment` : '',
      deliveryCondition: d.liftingDate ? `Lifting by ${dmy(d.liftingDate)}` : '',
      deliverAt: d.port ?? '',
      bardanaCondition: '',
      brokerageNote,
      remarks: deposit,
    };
  }, [deal, companyQ.data]);

  const [data, setData] = useState<ContractData>(initial);
  useEffect(() => setData(initial), [initial]);

  if (!open || !deal) return null;

  // NB: a plain function (not a nested component) so inputs keep focus while typing.
  const field = (label: string, k: keyof ContractData, placeholder?: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input
        value={data[k]}
        placeholder={placeholder}
        onChange={(e) => setData((s) => ({ ...s, [k]: e.target.value }))}
      />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative z-10 flex max-h-[90vh] w-full max-w-6xl flex-col rounded-lg border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="size-4" /> Contract Note · {deal.dealNo}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="size-4" /></Button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-2">
          {/* Editable fields */}
          <div className="space-y-4 overflow-y-auto border-r border-border p-5">
            <p className="text-xs text-muted-foreground">
              Parties, item, qty, rate and the deal&apos;s port, payment, lifting date, shipment &amp; deposit are pre-filled. Adjust anything below, then download.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {field('Contract No.', 'contractNo')}
              {field('Date', 'date', 'dd/mm/yyyy')}
            </div>

            <div className="rounded-md border border-border p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Supplier</p>
              <div className="grid grid-cols-2 gap-3">
                {field('Name', 'supplierName')}
                {field('Contact Person', 'supplierContact')}
                {field('City', 'supplierCity')}
                {field('State', 'supplierState')}
              </div>
            </div>

            <div className="rounded-md border border-border p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Buyer</p>
              <div className="grid grid-cols-2 gap-3">
                {field('Name', 'buyerName')}
                {field('Contact Person', 'buyerContact')}
                {field('City', 'buyerCity')}
                {field('State', 'buyerState')}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {field('Item Name', 'itemName')}
              {field('Qty', 'qty')}
              {field('Weight (M.T.)', 'weight')}
              {field('Rate', 'rate')}
            </div>

            <div className="rounded-md border border-dashed border-border p-3">
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Other Details</p>
              <div className="grid grid-cols-1 gap-3">
                {field('Payment Condition', 'paymentCondition', 'e.g. Advance')}
                {field('Goods Condition', 'goodsCondition', 'e.g. July Shipment')}
                {field('Delivery Condition', 'deliveryCondition', 'e.g. + 10 Days From Pho')}
                {field('Deliver At', 'deliverAt', 'e.g. Ex-Kandla')}
                {field('Bardana Condition', 'bardanaCondition')}
                {field('Remarks', 'remarks', 'e.g. 3 Rs. Per Kg. Deposit Under 7 Days')}
              </div>
            </div>
          </div>

          {/* Live preview */}
          <div className="overflow-y-auto bg-muted/40 p-5">
            <div className="origin-top scale-[0.92] rounded-md border border-border bg-white shadow-sm">
              <div dangerouslySetInnerHTML={{ __html: `<style>${contractStyle()}</style>${contractBody(data)}` }} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => printContract(data)}>
            <Download className="size-4" /> Download / Print
          </Button>
        </div>
      </div>
    </div>
  );
}
