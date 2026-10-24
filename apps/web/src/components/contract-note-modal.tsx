'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, FileText, Loader2, Mail, Send, X } from 'lucide-react';
import Link from 'next/link';
import { type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, apiGet } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { formatNumber } from '@/lib/format';

interface Company {
  name: string; legalName?: string | null; addressLine?: string | null;
  city?: string | null; state?: string | null; pincode?: string | null;
  phone?: string | null; email?: string | null; gstin?: string | null;
}

export type ContractNoteVariant = 'direct' | 'degum';

// A broker's Contract Note in the layout of the client's sample confirmation
// note (JDM/2627062002), under Ojas branding. Everything the deal (and, for
// degum, its shipment record) holds is pre-filled; all of it stays editable.
interface NoteData {
  firmName: string; firmAddress: string; firmEmail: string; firmPhone: string; firmGstin: string;
  noteNo: string; date: string;
  sellerName: string; sellerAddress: string;
  buyerName: string; buyerAddress: string;
  commodity: string; specification: string;
  port: string; payment: string; shipment: string; lifting: string;
  quantity: string; tolerance: string; quantityWords: string;
  price: string; priceWords: string;
  // Degum shipment details — printed only when filled.
  vessel: string; vesselEta: string; clearance: string; tank: string; terminal: string;
  chain: string; duty: string; paymentDue: string; finalPayment: string;
  otherTerms: string; // one clause per line
  brokerage: string;
}

const BRAND = '#2a4074'; // the app's primary navy (hsl 222 47% 31%)
const BRAND_TINT = '#eef1f8';
// Ojas + Rajendra Kumar Arun Kumar letterhead (apps/web/public). The print
// iframe's srcdoc inherits the app's base URL, so the relative path resolves there too.
const LOGO_URL = '/brand/contract-note-logo.png';

const TERM_DUTY = 'Any change in duty, tariff, additional duty, Govt. policies etc. on Buyer A/c.';
const TERM_SURVEYOR = 'Loading must take place under a surveyor’s supervision, failing which we do not take responsibility for any quality issues at the loading port or elsewhere.';
const TERM_BROKER = 'This contract is entered into subject to the General Terms & Conditions for the purpose of Oils & Fats & the By-laws of the Indian Vegetable Oil Processors Association, Mumbai. Further, we have brought about this contract in our capacity as Broker (Agent) for both the Seller & the Buyer and hence it is subject to the Law of Agency & other contents of the Indian Contract Act 1872, for the time being in force. As we are acting only as Broker, we will not be liable and/or responsible whatsoever for non-performance of contract.';

const DEFAULT_DEGUM_LIFTING =
  '10 days from PHO date or from the date of receipt of tank terminal details, whichever is later.';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function esc(s: string): string {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

function toDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** 20.06.2026 */
function dmy(v?: string | null): string {
  const d = toDate(v);
  if (!d) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** 27th June 2026 */
function longDate(v?: string | null): string {
  const d = toDate(v);
  if (!d) return '';
  const n = d.getDate();
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Indian-style number-to-words for a whole number. */
function inWords(value: number): string {
  const n = Math.floor(Math.abs(Number(value) || 0));
  if (n === 0) return 'Zero';
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (x: number): string => (x < 20 ? a[x] : (b[Math.floor(x / 10)] + (x % 10 ? ' ' + a[x % 10] : '')));
  const three = (x: number): string => {
    const h = Math.floor(x / 100), r = x % 100;
    return (h ? a[h] + ' Hundred' + (r ? ' and ' : '') : '') + (r ? two(r) : '');
  };
  let rem = n;
  const parts: string[] = [];
  const crore = Math.floor(rem / 10000000); rem %= 10000000;
  const lakh = Math.floor(rem / 100000); rem %= 100000;
  const thousand = Math.floor(rem / 1000); rem %= 1000;
  if (crore) parts.push(inWords(crore) + ' Crore');
  if (lakh) parts.push(two(lakh) + ' Lakh');
  if (thousand) parts.push(two(thousand) + ' Thousand');
  if (rem) parts.push(three(rem));
  return parts.join(' ').trim();
}

const rs = (v: any, digits = 0) => `Rs. ${formatNumber(Number(v ?? 0), digits)}/-`;

function partyAddress(p: any): string {
  if (!p) return '';
  return [p.address, p.city, p.gstin && `GSTIN: ${p.gstin}`].filter(Boolean).join('\n');
}

function withMs(name: string): string {
  const n = (name ?? '').trim();
  return !n || /^m\/s\b/i.test(n) ? n : `M/s ${n}`;
}

function noteStyle(): string {
  return `
  .on { box-sizing: border-box; width: 190mm; margin: 0 auto; padding: 8mm 10mm; background: #fff; color: #000;
        font-family: 'Times New Roman', Georgia, serif; font-size: 12px; line-height: 1.35; }
  .on * { box-sizing: border-box; }
  /* The logo's lettering is white, so it sits on a navy band. */
  .on-logo { background: ${BRAND}; border-radius: 3px; padding: 8px 14px; text-align: center; line-height: 0; }
  .on-logo img { width: 100%; height: auto; }
  .on-firm { text-align: center; }
  .on-firm .addr { font-size: 9px; margin-top: 5px; line-height: 1.35; color: #222; }
  .on-rule { border-bottom: 3px solid ${BRAND}; margin: 6px 0 1px; }
  .on-rule2 { border-bottom: 1px solid ${BRAND}; margin: 0 0 6px; }
  .on-title { text-align: center; margin: 4px 0 6px; }
  .on-title span { display: inline-block; background: ${BRAND}; color: #fff; padding: 2px 14px; border-radius: 2px;
                   font-family: Arial, Helvetica, sans-serif; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; }
  .on-head { display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; }
  .on-intro { font-size: 10.5px; font-weight: 700; margin: 5px 0 6px; text-transform: uppercase; }
  table.on-kv { width: 100%; border-collapse: collapse; border: 1.5px solid ${BRAND}; }
  table.on-kv td { border: 1px solid ${BRAND}; padding: 3px 7px; vertical-align: top; font-size: 11px; text-transform: uppercase; }
  table.on-kv td.k { width: 150px; font-weight: 700; background: ${BRAND_TINT}; color: ${BRAND}; }
  table.on-kv td.v { font-weight: 700; }
  .on-kv .party { font-weight: 700; font-style: italic; }
  .on-kv .nominee { font-weight: 400; font-style: italic; padding-left: 14px; }
  .on-kv .words { font-weight: 400; }
  table.on-terms { width: 100%; border-collapse: collapse; }
  table.on-terms td { border: none; padding: 1px 4px 3px; vertical-align: top; font-size: 10.5px; font-weight: 400; text-transform: uppercase; background: none; color: #000; }
  table.on-terms td.num { width: 22px; text-align: right; font-weight: 700; }
  .on-foot { margin-top: 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; text-align: center; }
  .on-sign { display: flex; justify-content: flex-end; margin-top: 10px; font-size: 12px; font-weight: 700; text-transform: uppercase; }
  .on-sign .box { text-align: center; min-width: 200px; }
  .on-sign .for { color: ${BRAND}; }
  .on-sign .space { height: 44px; }
  .on-sign .line { border-top: 1px solid #000; padding-top: 2px; font-size: 10px; font-weight: 400; }
  .on-bottom { margin-top: 10px; border-top: 3px solid ${BRAND}; }
  @media print {
    body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .on { width: auto; padding: 6mm 8mm; }
  }
  `;
}

function partyBlock(name: string, address: string): string {
  const addr = String(address ?? '')
    .split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => `<div class="party">${esc(l)}</div>`).join('');
  return `<div class="party">${esc(name || '—')}</div>${addr}<div class="nominee">&amp;/OR THEIR NOMINEE</div>`;
}

function noteBody(d: NoteData, variant: ContractNoteVariant): string {
  const kv = (k: string, v: string) => `<tr><td class="k">${esc(k)}</td><td class="v">${v}</td></tr>`;
  // Optional rows (degum shipment details) are left out of the print when blank.
  const opt = (k: string, v: string) => (v.trim() ? kv(k, esc(v)) : '');

  const qtyLine = [
    [d.quantity && `${esc(d.quantity)} MTs`, esc(d.tolerance)].filter(Boolean).join(' '),
    d.quantityWords ? `<span class="words">(${esc(d.quantityWords)})</span>` : '',
  ].filter(Boolean).join(' ');
  const priceLine = [
    esc(d.price),
    d.priceWords ? `<span class="words">(${esc(d.priceWords)})</span>` : '',
  ].filter(Boolean).join(' ');

  const terms = d.otherTerms.split('\n').map((t) => t.trim()).filter(Boolean);
  const termsHtml = terms.length
    ? `<table class="on-terms">${terms.map((t, i) => `<tr><td class="num">${i + 1}</td><td>${esc(t)}</td></tr>`).join('')}</table>`
    : '—';

  const firmLine = [
    d.firmAddress && `Address: ${d.firmAddress}`,
    d.firmEmail && `Email Id: ${d.firmEmail}`,
    d.firmPhone && `Mo No: ${d.firmPhone}`,
    d.firmGstin && `GSTIN: ${d.firmGstin}`,
  ].filter(Boolean).map(esc).join(' &nbsp;|&nbsp; ');

  const tankTerminal = [d.tank, d.terminal].map((s) => s.trim()).filter(Boolean).join(' / ');
  const firm = d.firmName || 'Ojas Trading';

  return `
  <div class="on">
    <div class="on-logo"><img src="${LOGO_URL}" alt="${esc(firm)}"></div>
    ${firmLine ? `<div class="on-firm"><div class="addr">${firmLine}</div></div>` : ''}
    <div class="on-rule"></div><div class="on-rule2"></div>
    <div class="on-title"><span>CONTRACT NOTE</span></div>
    <div class="on-head">
      <span>Contract Note No.: ${esc(d.noteNo || '—')}</span>
      <span>DATED ${esc(d.date || '—')}.</span>
    </div>
    <div class="on-intro">Under your instruction and order, we confirm having concluded on account of the parties
      mentioned below for following transaction on following terms &amp; conditions:</div>
    <table class="on-kv">
      ${kv('Sellers', partyBlock(d.sellerName, d.sellerAddress))}
      ${kv('Buyers', partyBlock(d.buyerName, d.buyerAddress))}
      ${kv('Commodity', esc(d.commodity || '—'))}
      ${kv('Specification', esc(d.specification || '—'))}
      ${kv('Port', esc(d.port || '—'))}
      ${kv('Payment', esc(d.payment || '—'))}
      ${kv('Shipment', esc(d.shipment || '—'))}
      ${variant === 'degum' ? [
        opt('Vessel', d.vessel),
        opt('Tentative Arrival', d.vesselEta),
        opt('Actual Clearance', d.clearance),
        opt('Tank / Terminal', tankTerminal),
        opt('Chain', d.chain),
      ].join('') : ''}
      ${kv('Lifting', esc(d.lifting || '—'))}
      ${kv('Quantity', qtyLine || '—')}
      ${kv(variant === 'degum' ? 'Approx Parity Price (Rs.)' : 'Rate (Rs.)', priceLine || '—')}
      ${variant === 'degum' ? [
        opt('Duty', d.duty),
        opt('Payment Due', d.paymentDue),
        opt('Final Payment', d.finalPayment),
      ].join('') : ''}
      ${kv('Other Terms', termsHtml)}
      ${kv('Brokerage', esc(d.brokerage || '—'))}
    </table>
    <div class="on-foot">Our detailed contract note no. ${esc(d.noteNo || '—')} dated ${esc(d.date || '—')} follows.</div>
    <div class="on-sign">
      <div class="box">
        <div class="for">For ${esc(firm)}</div>
        <div class="space"></div>
        <div class="line">Authorised Signatory</div>
      </div>
    </div>
    <div class="on-bottom"></div>
  </div>`;
}

function printNote(d: NoteData, variant: ContractNoteVariant) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(d.noteNo || 'contract-note')}</title><style>${noteStyle()}</style></head><body>${noteBody(d, variant)}</body></html>`;
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

/** The note as an A4 PDF — same template as the preview and the print. */
async function notePdf(d: NoteData, variant: ContractNoteVariant): Promise<Blob> {
  const html2pdf = (await import('html2pdf.js')).default; // browser-only; keep it out of SSR
  const html = `<div><style>${noteStyle()} .on { width: 190mm; padding: 0; }</style>${noteBody(d, variant)}</div>`;
  // Tailwind's preflight `img { display: block }` skews html2canvas's font-baseline
  // probe (an <img> in the live document), drawing all text too low so it clips into
  // the table borders. Undo it just for the capture.
  const fix = document.createElement('style');
  fix.textContent = 'img { display: inline !important; }';
  document.head.appendChild(fix);
  try {
    return await html2pdf()
      .set({
        margin: [8, 10, 8, 10],
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(html)
      .outputPdf('blob');
  } finally {
    fix.remove();
  }
}

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Address chips: Enter, comma or blur adds what was typed; × removes. */
function EmailList({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const [bad, setBad] = useState('');
  const commit = () => {
    const parts = draft.split(/[,;\s]+/).map((t) => t.trim().toLowerCase()).filter(Boolean);
    if (!parts.length) return;
    const invalid = parts.filter((t) => !EMAIL_RE.test(t));
    onChange([...value, ...parts.filter((t) => EMAIL_RE.test(t) && !value.includes(t))]);
    setDraft(invalid.join(', '));
    setBad(invalid.length ? `Not a valid email: ${invalid.join(', ')}` : '');
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
    if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-input bg-background px-2 py-1">
        {value.map((e) => (
          <span key={e} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs">
            {e}
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => onChange(value.filter((x) => x !== e))} aria-label={`Remove ${e}`}>
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          className="min-w-[10rem] flex-1 bg-transparent py-1 text-sm outline-none"
          value={draft}
          placeholder={value.length ? '' : 'name@example.com'}
          onChange={(e) => { setDraft(e.target.value); setBad(''); }}
          onKeyDown={onKey}
          onBlur={commit}
        />
      </div>
      {bad && <p className="text-xs text-destructive">{bad}</p>}
    </div>
  );
}

/** Textareas grow with their content instead of scrolling inside the form. */
function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  // border-box: the height has to include the borders on top of the content.
  el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
}

/**
 * The note at its real print width (190mm), scaled down to fit its column.
 * Side by side (lg+) it also fits the height, so the whole page is always in
 * view and the preview never needs its own scrollbar; stacked on small screens
 * it fits the width and scrolls with the form.
 */
function NotePreview({ html }: { html: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ scale: 1, w: 0, h: 0 });

  useLayoutEffect(() => {
    const box = boxRef.current;
    const page = pageRef.current;
    if (!box || !page) return;
    const measure = () => {
      const w = page.offsetWidth; // untransformed size
      const h = page.offsetHeight;
      if (!w || !h) return;
      const sideBySide = window.matchMedia('(min-width: 1024px)').matches;
      const scale = Math.min(1, box.clientWidth / w, sideBySide ? box.clientHeight / h : Infinity);
      setFit({ scale, w, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(page);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={boxRef} className="flex h-full w-full justify-center">
      <div className="shrink-0" style={{ width: fit.w * fit.scale, height: fit.h * fit.scale }}>
        <div
          ref={pageRef}
          className="bg-white shadow-sm ring-1 ring-border"
          style={{ width: '190mm', transform: `scale(${fit.scale})`, transformOrigin: 'top left' }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}

function buildNote(deal: any, c: Company | undefined, variant: ContractNoteVariant): NoteData {
  const d = deal ?? {};
  const g = d.degumDetail ?? {};
  const degum = variant === 'degum';

  const qty = d.quantity != null ? Number(d.quantity) : null;
  const rate = d.rate != null ? Number(d.rate) : null;
  const deposit = d.deposit != null ? Number(d.deposit) : 0;
  const due = longDate(d.dueDate);

  // Payment: the deal's condition; its due date goes on the deposit clause when
  // there is a deposit (as in the sample), else on the payment line itself.
  const payment = [d.paymentCondition, !deposit && due && `due by ${due}`].filter(Boolean).join(', ');

  const terms = degum ? [TERM_DUTY, TERM_SURVEYOR, TERM_BROKER] : [TERM_DUTY, TERM_BROKER];
  if (deposit > 0) terms.push(`Deposit of ${rs(deposit)} will be applicable${due ? ` and is due by ${due}` : ''}.`);

  const brokerage = [
    Number(d.buyerBrokerage) > 0 && `Buyer ${rs(d.buyerBrokerage)} PMT`,
    Number(d.sellerBrokerage) > 0 && `Seller ${rs(d.sellerBrokerage)} PMT`,
  ].filter(Boolean).join(' · ');

  const pay = d.payment; // degum final payment, calculated by the API
  const paymentDue = g.paymentDueDate
    ? `${dmy(g.paymentDueDate)}${g.paymentDueDays ? ` (${g.paymentDueDays} days from clearance)` : ''}`
    : g.paymentDueDays ? `${g.paymentDueDays} days from clearance` : '';

  return {
    firmName: c?.legalName || c?.name || 'Ojas Trading',
    firmAddress: [c?.addressLine, c?.city, [c?.state, c?.pincode].filter(Boolean).join('-')].filter(Boolean).join(', '),
    firmEmail: c?.email ?? '',
    firmPhone: c?.phone ?? '',
    firmGstin: c?.gstin ?? '',
    noteNo: d.dealNo ?? '',
    date: dmy(d.date),
    sellerName: withMs(d.sellerParty?.name ?? ''),
    sellerAddress: partyAddress(d.sellerParty),
    buyerName: withMs(d.buyerParty?.name ?? ''),
    buyerAddress: partyAddress(d.buyerParty),
    commodity: d.product?.name ?? d.product?.code ?? '',
    specification: '',
    port: d.port ?? '',
    payment,
    shipment: d.shipmentMonth ? `${d.shipmentMonth} Shipment` : '',
    lifting: d.liftingDate ? `On or before ${longDate(d.liftingDate)}` : degum ? DEFAULT_DEGUM_LIFTING : '',
    quantity: qty != null ? formatNumber(qty, 3) : '',
    tolerance: degum ? '±2% at seller’s option' : '',
    quantityWords: qty != null && Number.isInteger(qty) ? `${inWords(qty)} MTs` : '',
    price: rate != null ? `Rs. ${formatNumber(rate, 2)} per MT${degum ? ' + Duty / IGST' : ''}` : '',
    priceWords: rate != null && Number.isInteger(rate) ? `Rupees ${inWords(rate)} only` : '',
    vessel: g.vesselName ?? '',
    vesselEta: dmy(g.vesselEta),
    clearance: dmy(g.clearanceDate),
    tank: g.tank ?? '',
    terminal: g.terminal ?? '',
    chain: g.chain ?? '',
    duty: g.duty != null ? `Rs. ${formatNumber(Number(g.duty), 2)} per MT` : '',
    paymentDue,
    finalPayment: pay?.netPayable != null
      ? `Rs. ${formatNumber(Number(pay.netPayable), 2)} (net of deposit, incl. 5% GST, less 0.1% TDS)`
      : '',
    otherTerms: terms.join('\n'),
    brokerage: brokerage ? `${brokerage} (plus applicable GST)` : '',
  };
}

export function ContractNoteModal({
  open,
  onClose,
  deal,
  variant = 'direct',
}: {
  open: boolean;
  onClose: () => void;
  deal: any | null;
  variant?: ContractNoteVariant;
}) {
  const companyQ = useQuery({
    queryKey: ['settings', 'company'],
    queryFn: () => apiGet<Company>('/settings/company'),
    enabled: open,
  });

  const initial = useMemo(() => buildNote(deal, companyQ.data, variant), [deal, companyQ.data, variant]);
  const [data, setData] = useState<NoteData>(initial);
  useEffect(() => setData(initial), [initial]);

  // Email: buyer + seller pre-filled from master data, all editable.
  const canEmail = useAuth((s) => s.can('deal:email'));
  const sellerEmail = String(deal?.sellerParty?.email ?? '').trim().toLowerCase();
  const buyerEmail = String(deal?.buyerParty?.email ?? '').trim().toLowerCase();
  const [emailOpen, setEmailOpen] = useState(false);
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const send = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('file', await notePdf(data, variant), `Contract-Note-${deal.dealNo}.pdf`);
      fd.append('to', to.join(','));
      if (cc.length) fd.append('cc', cc.join(','));
      if (subject.trim()) fd.append('subject', subject.trim());
      if (message.trim()) fd.append('message', message.trim());
      // Explicit multipart so axios doesn't JSON-encode the FormData (the instance defaults to JSON).
      const res = await api.post(`/deals/${deal.id}/contract-note/email`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return (res.data?.data ?? res.data) as { to: string[]; cc: string[] };
    },
  });

  useEffect(() => {
    setEmailOpen(false);
    setTo([...new Set([sellerEmail, buyerEmail].filter(Boolean))]);
    setCc([]);
    setSubject(deal ? `Contract Note ${deal.dealNo}${deal.product?.name ? ` – ${deal.product.name}` : ''}` : '');
    setMessage('');
    send.reset();
  }, [deal, sellerEmail, buyerEmail]); // eslint-disable-line react-hooks/exhaustive-deps

  // The email section sits at the end of the form; bring it into view when opened.
  const emailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (emailOpen) emailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [emailOpen]);

  if (!open || !deal) return null;
  const degum = variant === 'degum';
  const sendError = (send.error as any)?.response?.data?.message ?? (send.error as any)?.message;

  // NB: plain functions (not nested components) so inputs keep focus while typing.
  const field = (label: string, k: keyof NoteData, placeholder?: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input value={data[k]} placeholder={placeholder} onChange={(e) => setData((s) => ({ ...s, [k]: e.target.value }))} />
    </div>
  );
  const area = (label: string, k: keyof NoteData, rows = 3, placeholder?: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Textarea
        ref={(el) => autoGrow(el)}
        rows={rows}
        className="resize-none overflow-hidden"
        value={data[k]}
        placeholder={placeholder}
        onChange={(e) => setData((s) => ({ ...s, [k]: e.target.value }))}
      />
    </div>
  );
  const section = (title: string, children: ReactNode, dashed = false) => (
    <div className={`rounded-md border ${dashed ? 'border-dashed' : ''} border-border p-3`}>
      <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{title}</p>
      {children}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative z-10 flex h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="size-4" /> {degum ? 'Degum ' : ''}Contract Note · {deal.dealNo}
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="size-4" /></Button>
        </div>

        {/* One scroll area: the form on the left (stacked above the preview on small
            screens); on lg+ only the form scrolls and the preview fits its column. */}
        <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:overflow-hidden">
          {/* Editable fields + email */}
          <div className="space-y-4 p-5 lg:min-h-0 lg:overflow-y-auto lg:border-r lg:border-border">
            <p className="text-xs text-muted-foreground">
              Pre-filled from the deal{degum ? ' and its shipment details' : ''}. Add the specification and adjust
              anything below, then download.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {field('Contract Note No.', 'noteNo')}
              {field('Date', 'date', 'dd.mm.yyyy')}
            </div>

            {section('Sellers', <>
              {field('Name', 'sellerName')}
              <div className="mt-3">{area('Address', 'sellerAddress', 2, 'One line per row')}</div>
            </>)}

            {section('Buyers', <>
              {field('Name', 'buyerName')}
              <div className="mt-3">{area('Address', 'buyerAddress', 2, 'One line per row')}</div>
            </>)}

            <div className="grid grid-cols-1 gap-3">
              {field('Commodity', 'commodity')}
              {field('Specification', 'specification', 'e.g. FFA below 1%, acceptable with a single rebate 1-2%')}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {field('Port', 'port', 'e.g. Ex Tank Kandla')}
              {field('Payment', 'payment', 'e.g. Advance Payment')}
              {field('Shipment', 'shipment', 'e.g. August 2026 Shipment')}
              {field('Brokerage', 'brokerage')}
            </div>

            {area('Lifting', 'lifting', 2)}

            {section('Quantity & Price', <>
              <div className="grid grid-cols-2 gap-3">
                {field('Quantity (MT)', 'quantity')}
                {field('Tolerance', 'tolerance', 'e.g. ±2% at seller’s option')}
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3">
                {field('Quantity in words', 'quantityWords')}
                {field(degum ? 'Approx Parity Price' : 'Rate', 'price')}
                {field('Price in words', 'priceWords')}
              </div>
            </>)}

            {degum && section('Shipment details (printed when filled)', (
              <div className="grid grid-cols-2 gap-3">
                {field('Vessel', 'vessel')}
                {field('Tentative Arrival', 'vesselEta', 'dd.mm.yyyy')}
                {field('Actual Clearance', 'clearance', 'dd.mm.yyyy')}
                {field('Chain', 'chain')}
                {field('Tank', 'tank')}
                {field('Terminal', 'terminal')}
                {field('Duty', 'duty')}
                {field('Payment Due', 'paymentDue')}
                <div className="col-span-2">{field('Final Payment', 'finalPayment')}</div>
              </div>
            ), true)}

            {area('Other Terms (one clause per line)', 'otherTerms', 6)}

            {emailOpen && (
              <div ref={emailRef} className="scroll-mt-5 space-y-3 rounded-md border border-primary/40 bg-muted/30 p-3">
                <p className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
                  <Mail className="size-4" /> Email the contract note (PDF attached)
                </p>
                {(!sellerEmail || !buyerEmail) && (
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    {!sellerEmail && !buyerEmail ? 'Seller and Buyer have' : !sellerEmail ? 'Seller has' : 'Buyer has'} no
                    email in master data. Add the address below, or save it under{' '}
                    <Link href="/master/parties" className="underline">Master › Parties</Link>.
                  </p>
                )}
                <EmailList label="To" value={to} onChange={setTo} />
                <EmailList label="CC" value={cc} onChange={setCc} />
                <div className="space-y-1">
                  <Label className="text-xs">Subject</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Message (optional, replaces the standard greeting)</Label>
                  <Textarea
                    ref={(el) => autoGrow(el)}
                    rows={3}
                    className="resize-none overflow-hidden"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>
                {send.isSuccess && (
                  <p className="text-sm text-green-700 dark:text-green-400">
                    Sent to {[...send.data.to, ...send.data.cc].join(', ')}.
                  </p>
                )}
                {send.isError && <p className="text-sm text-destructive">{sendError ?? 'Email could not be sent.'}</p>}
              </div>
            )}
          </div>

          {/* Live preview — the whole page, scaled to fit */}
          <div className="border-t border-border bg-muted/40 p-5 lg:min-h-0 lg:border-t-0">
            <NotePreview html={`<style>${noteStyle()}</style>${noteBody(data, variant)}`} />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {canEmail && !emailOpen && (
            <Button variant="outline" onClick={() => setEmailOpen(true)}>
              <Mail className="size-4" /> Send by email
            </Button>
          )}
          {canEmail && emailOpen && (
            <Button variant="outline" disabled={!to.length || send.isPending} onClick={() => send.mutate()}>
              {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              {send.isPending ? 'Sending…' : send.isSuccess ? 'Send again' : 'Send'}
            </Button>
          )}
          <Button onClick={() => printNote(data, variant)}>
            <Download className="size-4" /> Download / Print
          </Button>
        </div>
      </div>
    </div>
  );
}
