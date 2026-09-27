'use client';

import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { ArrowUpRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { apiGet } from '@/lib/api';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';

interface Holding {
  id: string; dealNo: string; date: string; selfFirm: string; supplier: string;
  product: { code: string; name: string } | null;
  quantity: number; sold: number; inHand: number; rate: number;
  dueDate: string | null; liftingDate: string | null; daysLeft: number | null;
  sales: { dealNo: string; quantity: number }[];
}
interface Sale {
  id: string; dealNo: string; date: string; selfFirm: string; buyer: string;
  product: { code: string; name: string } | null;
  quantity: number; rate: number; dueDate: string | null; liftingDate: string | null; daysLeft: number | null;
  sourceDeal: { id: string; dealNo: string } | null;
}
interface Desk {
  selfFirms: { id: string; name: string }[];
  summary: { selfFirm: string; code: string; name: string; bought: number; sold: number; inHand: number }[];
  holdings: Holding[];
  sales: Sale[];
}

/** Lifting-due colour: red under 5 days (or overdue), yellow 5–15 days, green beyond 15. */
function dueTone(daysLeft: number | null): { color: string; label: string } {
  if (daysLeft == null) return { color: '#94a3b8', label: 'No lifting date' };
  if (daysLeft < 5) {
    return { color: '#ef4444', label: daysLeft < 0 ? `Overdue ${-daysLeft}d` : daysLeft === 0 ? 'Due today' : `${daysLeft} days` };
  }
  if (daysLeft <= 15) return { color: '#f59e0b', label: `${daysLeft} days` };
  return { color: '#22c55e', label: `${daysLeft} days` };
}

const LEGEND = [
  { color: '#ef4444', label: 'Less than 5 days' },
  { color: '#f59e0b', label: '5 – 15 days' },
  { color: '#22c55e', label: 'Above 15 days' },
  { color: '#94a3b8', label: 'No lifting date' },
];

/** Colour bar at the row's left edge (by lifting due date), shared by both tables. */
function dueColumns<T extends { daysLeft: number | null }>(): ColumnDef<T, any>[] {
  return [
    {
      id: '_due', header: '', enableSorting: false,
      meta: { cellClassName: 'relative p-0', headerClassName: 'p-0' },
      cell: ({ row }) => {
        const t = dueTone(row.original.daysLeft);
        return (
          <>
            <span title={t.label} className="absolute inset-y-0 left-0 w-2" style={{ background: t.color }} />
            <span className="block w-5" aria-hidden />
          </>
        );
      },
    },
  ];
}
const dueDateCells = <T extends { daysLeft: number | null; dueDate: string | null; liftingDate: string | null }>(): ColumnDef<T, any>[] => [
  { id: 'liftingDate', header: 'Lifting Due', enableSorting: false, cell: ({ row }) => formatDate(row.original.liftingDate) },
  {
    id: 'liftingIn', header: 'Lifting In', enableSorting: false,
    cell: ({ row }) => { const t = dueTone(row.original.daysLeft); return <Badge color={t.color}>{t.label}</Badge>; },
  },
  { id: 'dueDate', header: 'Payment Due', enableSorting: false, cell: ({ row }) => formatDate(row.original.dueDate) },
];

export default function TradingDeskPage() {
  const router = useRouter();
  const [selfPartyId, setSelfPartyId] = useState('');
  const [productId, setProductId] = useState('');
  const [productLabel, setProductLabel] = useState('');
  const [showSoldOut, setShowSoldOut] = useState(false);

  const desk = useQuery({
    queryKey: ['trading-desk', selfPartyId, productId, showSoldOut],
    queryFn: () => apiGet<Desk>('/trading-desk', {
      selfPartyId: selfPartyId || undefined,
      productId: productId || undefined,
      showSoldOut: showSoldOut ? 'true' : undefined,
    }),
  });
  const d = desk.data;

  const holdingCols = useMemo<ColumnDef<Holding, any>[]>(() => [
    ...dueColumns<Holding>(),
    { id: 'dealNo', header: 'Deal', enableSorting: false, cell: ({ row }) => <span className="font-medium">{row.original.dealNo}</span> },
    { id: 'date', header: 'Date', enableSorting: false, cell: ({ row }) => formatDate(row.original.date) },
    { id: 'selfFirm', header: 'Own Firm', accessorKey: 'selfFirm', enableSorting: false },
    { id: 'supplier', header: 'Bought From', accessorKey: 'supplier', enableSorting: false },
    { id: 'product', header: 'Material', enableSorting: false, cell: ({ row }) => row.original.product?.code ?? '—' },
    { id: 'quantity', header: 'Bought (MT)', enableSorting: false, cell: ({ row }) => formatNumber(row.original.quantity, 3) },
    { id: 'sold', header: 'Sold (MT)', enableSorting: false, cell: ({ row }) => formatNumber(row.original.sold, 3) },
    {
      id: 'inHand', header: 'In Hand (MT)', enableSorting: false,
      cell: ({ row }) => <span className={`font-semibold ${row.original.inHand > 0 ? '' : 'text-muted-foreground'}`}>{formatNumber(row.original.inHand, 3)}</span>,
    },
    { id: 'rate', header: 'Rate', enableSorting: false, cell: ({ row }) => formatCurrency(row.original.rate) },
    ...dueDateCells<Holding>(),
    {
      id: 'soldTo', header: 'Sold In', enableSorting: false,
      cell: ({ row }) => row.original.sales.length
        ? row.original.sales.map((s) => `${s.dealNo} (${formatNumber(s.quantity, 3)})`).join(', ')
        : <span className="text-muted-foreground">—</span>,
    },
    {
      id: '_sell', header: '', enableSorting: false,
      cell: ({ row }) => row.original.inHand > 0 && (
        <Button size="sm" variant="outline" onClick={() => router.push(`/deals?sellFrom=${row.original.id}`)}>
          <ArrowUpRight className="size-4" /> Sell
        </Button>
      ),
    },
  ], [router]);

  const saleCols = useMemo<ColumnDef<Sale, any>[]>(() => [
    ...dueColumns<Sale>(),
    { id: 'dealNo', header: 'Deal', enableSorting: false, cell: ({ row }) => <span className="font-medium">{row.original.dealNo}</span> },
    { id: 'date', header: 'Date', enableSorting: false, cell: ({ row }) => formatDate(row.original.date) },
    { id: 'selfFirm', header: 'Own Firm', accessorKey: 'selfFirm', enableSorting: false },
    { id: 'buyer', header: 'Sold To', accessorKey: 'buyer', enableSorting: false },
    { id: 'product', header: 'Material', enableSorting: false, cell: ({ row }) => row.original.product?.code ?? '—' },
    { id: 'quantity', header: 'Qty (MT)', enableSorting: false, cell: ({ row }) => formatNumber(row.original.quantity, 3) },
    { id: 'rate', header: 'Rate', enableSorting: false, cell: ({ row }) => formatCurrency(row.original.rate) },
    {
      id: 'source', header: 'Sold From', enableSorting: false,
      cell: ({ row }) => row.original.sourceDeal
        ? <span className="font-medium">{row.original.sourceDeal.dealNo}</span>
        : <Badge color="#f59e0b" >Not linked</Badge>,
    },
    ...dueDateCells<Sale>(),
  ], []);

  const unlinked = (d?.sales ?? []).filter((s) => !s.sourceDeal).length;

  return (
    <div>
      <PageHeader title="Trading Desk" description="Your own firm's trades — stock in hand and sales, coloured by lifting due date" />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        {(d?.selfFirms.length ?? 0) > 1 && (
          <div className="w-52 space-y-1">
            <Label className="text-xs">Own firm</Label>
            <Select value={selfPartyId} onChange={(e) => setSelfPartyId(e.target.value)}>
              <option value="">All own firms</option>
              {d!.selfFirms.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </Select>
          </div>
        )}
        <div className="w-64 space-y-1">
          <Label className="text-xs">Material</Label>
          <Combobox
            endpoint="/products"
            value={productId}
            selectedLabel={productLabel}
            onChange={(id, it) => { setProductId(id); setProductLabel(`${it.code} — ${it.name}`); }}
            mapLabel={(it) => `${it.code} — ${it.name}`}
            placeholder="All materials"
          />
        </div>
        {productId && (
          <Button variant="ghost" size="sm" onClick={() => { setProductId(''); setProductLabel(''); }}>Clear material</Button>
        )}
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" checked={showSoldOut} onChange={(e) => setShowSoldOut(e.target.checked)} />
          Show sold-out purchases
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="font-medium">Lifting due:</span>
          {LEGEND.map((c) => (
            <span key={c.label} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3.5 rounded-sm" style={{ background: c.color }} />
              {c.label}
            </span>
          ))}
        </div>
      </div>

      {d && d.selfFirms.length === 0 && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No own firm yet — mark a party as your own firm (Self) in Parties, then its trades appear here.
        </div>
      )}

      {/* In hand per material */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(d?.summary ?? []).filter((m) => m.inHand > 0).map((m) => (
          <Card key={`${m.selfFirm}-${m.code}`}>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground">{m.code} · {m.selfFirm}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">{formatNumber(m.inHand, 3)} MT</p>
              <p className="text-xs text-muted-foreground">in hand · bought {formatNumber(m.bought, 3)} · sold {formatNumber(m.sold, 3)}</p>
            </CardContent>
          </Card>
        ))}
        {d && !d.summary.some((m) => m.inHand > 0) && (
          <p className="text-sm text-muted-foreground sm:col-span-2">Nothing in hand right now.</p>
        )}
      </div>

      <Card className="mb-4">
        <CardHeader><CardTitle>Stock in Hand — Purchases</CardTitle></CardHeader>
        <CardContent className="p-0">
          <DataTable columns={holdingCols} data={d?.holdings ?? []} isLoading={desk.isLoading} storageKey="trading-holdings" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sales</CardTitle>
          {unlinked > 0 && (
            <p className="text-xs text-muted-foreground">
              {unlinked} older sale{unlinked === 1 ? ' is' : 's are'} not linked to a purchase — edit {unlinked === 1 ? 'it' : 'them'} in Deals and pick “Selling From” so stock in hand is exact.
            </p>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <DataTable columns={saleCols} data={d?.sales ?? []} isLoading={desk.isLoading} storageKey="trading-sales" />
        </CardContent>
      </Card>
    </div>
  );
}
