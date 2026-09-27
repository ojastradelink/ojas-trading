'use client';

import { useQuery } from '@tanstack/react-query';
import { Pencil, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { apiGet } from '@/lib/api';
import { DEGUM_ENDPOINT, GST_RATE, TDS_RATE, degumPayment } from '@/lib/degum-config';
import { formatNumber } from '@/lib/format';

// Colours / type sizes copied from the client's "Payment Calculator" workbook.
const C = {
  navy: '#1F3864', blue: '#2E75B6', label: '#D6E4F0', input: '#FFFFC0', note: '#F2F2F2',
  noteText: '#595959', totalBg: '#FCE4D6', totalText: '#C00000', payBg: '#E2EFDA', payText: '#00703C',
  footerText: '#BFBFBF', border: '#BFBFBF',
};

/** Excel's #,##0.00 (Indian digit grouping, like the rest of the app). */
const amt = (n: number) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const cell = 'border px-3 py-1.5 align-middle';
const labelCell = `${cell} text-left text-sm font-bold`;
const valueCell = `${cell} text-right text-base tabular-nums`;
const noteCell = `${cell} text-left text-xs`;

function degumLabel(d: any) {
  const who = d.degumDetail?.vesselName ?? d.sellerParty?.name ?? '';
  return `${d.dealNo}${who ? ` — ${who}` : ''} · ${formatNumber(d.quantity, 3)} MT`;
}

/**
 * The workbook's payment sheet for one degum deal. Rate, quantity and deposit
 * come from the deal, duty from its shipment details. Rate and deposit stay
 * editable like the sheet's yellow cells, as a what-if only — nothing is saved.
 */
export function DegumPaymentCalculator({
  dealId,
  onDealChange,
  onEditShipment,
}: {
  dealId: string;
  onDealChange: (id: string) => void;
  onEditShipment: (deal: any) => void;
}) {
  const q = useQuery({
    queryKey: ['degum', 'one', dealId],
    queryFn: () => apiGet<any>(`${DEGUM_ENDPOINT}/${dealId}`),
    enabled: !!dealId,
  });
  const deal = q.data;

  const [rate, setRate] = useState('');
  const [deposit, setDeposit] = useState('');
  const dealRate = deal ? String(Number(deal.rate)) : '';
  const dealDeposit = deal ? String(Number(deal.deposit ?? 0)) : '';
  // Re-prefill whenever another deal is picked or the deal's figures change.
  useEffect(() => { setRate(dealRate); setDeposit(dealDeposit); }, [deal?.id, dealRate, dealDeposit]);

  const duty = deal?.degumDetail?.duty != null ? Number(deal.degumDetail.duty) : null;
  const qty = deal ? Number(deal.quantity) : 0;
  const p = deal && duty != null ? degumPayment(Number(rate || 0), duty, qty, Number(deposit || 0)) : null;
  const edited = !!deal && (rate !== dealRate || deposit !== dealDeposit);
  const show = (n: number | undefined) => (n == null ? '—' : amt(n));

  const section = (title: string) => (
    <tr>
      <td colSpan={3} className={`${cell} text-center text-[13px] font-bold`} style={{ background: C.blue, color: '#fff', borderColor: C.border }}>
        {title}
      </td>
    </tr>
  );
  const row = (label: string, value: React.ReactNode, note: string, opts: { valueStyle?: React.CSSProperties; labelStyle?: React.CSSProperties; bold?: boolean } = {}) => (
    <tr>
      <td className={labelCell} style={{ background: C.label, color: C.navy, borderColor: C.border, ...opts.labelStyle }}>{label}</td>
      <td className={`${valueCell} ${opts.bold ? 'font-bold' : ''}`} style={{ background: '#fff', color: '#000', borderColor: C.border, ...opts.valueStyle }}>{value}</td>
      <td className={noteCell} style={{ background: C.note, color: C.noteText, borderColor: C.border }}>{note}</td>
    </tr>
  );
  // A yellow input cell, like the sheet's editable RATE / DEPOSIT.
  const inputCell = (value: string, set: (v: string) => void, label: string) => (
    <input
      type="number"
      min={0}
      step="0.01"
      aria-label={label}
      value={value}
      onChange={(e) => set(e.target.value)}
      className="w-full bg-transparent text-right text-base tabular-nums outline-none focus:ring-2 focus:ring-[#2E75B6]"
    />
  );

  const footer = deal
    ? [deal.degumDetail?.vesselName, `${formatNumber(qty, 3)} MT`, deal.degumDetail?.terminal]
        .filter(Boolean).map((s: string) => s.toUpperCase()).join('  •  ')
    : '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-md space-y-1.5">
          <Label>Deal</Label>
          <Combobox
            endpoint={DEGUM_ENDPOINT}
            value={dealId}
            selectedLabel={deal ? degumLabel(deal) : undefined}
            onChange={(id) => onDealChange(id)}
            mapLabel={degumLabel}
            placeholder="Select a degum deal…"
          />
        </div>
        {deal && (
          <>
            <Button variant="outline" size="sm" onClick={() => onEditShipment(deal)}>
              <Pencil className="size-4" /> Shipment details
            </Button>
            {edited && (
              <Button variant="ghost" size="sm" onClick={() => { setRate(dealRate); setDeposit(dealDeposit); }}>
                <RotateCcw className="size-4" /> Reset to deal values
              </Button>
            )}
          </>
        )}
      </div>

      {!dealId && <p className="text-sm text-muted-foreground">Pick a deal to calculate its final payment.</p>}
      {dealId && q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {deal && (
        <>
          {duty == null && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Duty isn&apos;t entered for {deal.dealNo} yet, so the payment can&apos;t be calculated.{' '}
              <button className="font-medium underline" onClick={() => onEditShipment(deal)}>Add it in the shipment details</button>.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] max-w-[860px] border-collapse" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '36.6%' }} />
                <col style={{ width: '26.8%' }} />
                <col style={{ width: '36.6%' }} />
              </colgroup>
              <tbody>
                <tr>
                  <td colSpan={3} className="px-3 py-3 text-center text-2xl font-bold tracking-wide" style={{ background: C.navy, color: '#fff' }}>
                    PAYMENT CALCULATION
                  </td>
                </tr>
                <tr><td colSpan={3} className="h-2 p-0" style={{ background: C.blue }} /></tr>

                {section('▶  INPUT PARAMETERS  (Edit highlighted cells only)')}
                {row('RATE  (₹/MT)', inputCell(rate, setRate, 'Rate per MT'), '✎  Enter base rate per MT', { valueStyle: { background: C.input } })}
                {row('DEPOSIT  (₹)', inputCell(deposit, setDeposit, 'Deposit'), '✎  Advance / deposit paid', { valueStyle: { background: C.input } })}

                {section('▶  FIXED CONSTANTS')}
                {row('DUTY  (+)  (₹/MT)', duty == null ? <span style={{ color: C.totalText }}>Not entered</span> : amt(duty), 'Fixed • contract duty')}
                {row('QUANTITY  (MT)', amt(qty), 'Fixed • contract quantity')}
                {row('GST RATE', `${(GST_RATE * 100).toFixed(1)}%`, 'Fixed • 5 %')}
                {row('TDS RATE', `${(TDS_RATE * 100).toFixed(2)}%`, 'Fixed • 0.1 % of Amount')}

                {section('▶  CALCULATED VALUES')}
                {row('NET RATE  (₹/MT)', show(p?.netRate), 'Formula: Rate + Duty')}
                {row('AMOUNT  (₹)', show(p?.amount), 'Formula: Net Rate x Qty')}
                {row('GST  (₹)', show(p?.gst), 'Formula: Amount x 5%')}
                {row('BASIC AMOUNT  (₹)', show(p?.basicAmount), 'Formula: Amount + GST')}
                {row('TDS  (-)  (₹)', show(p?.tds), 'Formula: Amount x 0.1%')}

                {section('▶  SETTLEMENT SUMMARY')}
                {row('TOTAL AMOUNT  (₹)', show(p?.totalAmount), 'Formula: Basic Amount - TDS', { valueStyle: { background: C.totalBg, color: C.totalText }, bold: true })}
                {row('DEPOSIT  (-)  (₹)', amt(Number(deposit || 0)), 'Pulls from Deposit input')}
                {row('NET PAYABLE AMOUNT  (₹)', show(p?.netPayable), '✔  Final payment due', {
                  labelStyle: { background: C.navy, color: '#fff' },
                  valueStyle: { background: C.payBg, color: C.payText },
                  bold: true,
                })}

                <tr><td colSpan={3} className="h-3 p-0" /></tr>
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-center text-xs" style={{ background: C.navy, color: C.footerText }}>
                    {footer}{footer ? '    |  ' : ''}This sheet is auto-calculated – edit only RATE &amp; DEPOSIT
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="max-w-[860px] text-xs text-muted-foreground">
            Rate, quantity and deposit come from deal {deal.dealNo}; duty from its shipment details. Editing Rate or
            Deposit here only changes this calculation — the deal is not changed. The Final Payment column uses the
            deal&apos;s own values.
          </p>
        </>
      )}
    </div>
  );
}
