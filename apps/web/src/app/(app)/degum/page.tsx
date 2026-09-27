'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { ArrowDownUp, Calculator, Filter, Pencil, Search, Ship, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/data-table';
import { DegumPaymentCalculator } from '@/components/degum-payment-calculator';
import { getPath, renderCell } from '@/components/deal-cell';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { apiGet, apiPut, type Paginated } from '@/lib/api';
import { DEAL_COLUMNS } from '@/lib/deal-config';
import { DEGUM_COLUMNS, DEGUM_ENDPOINT, DEGUM_FIELDS, DEGUM_SORTS, degumPayment, type DegumField } from '@/lib/degum-config';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';

function toDateInput(v: any): string {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** Shipment details → form strings. */
function detailToForm(detail: any): Record<string, string> {
  const f: Record<string, string> = {};
  if (!detail) return f;
  for (const fld of DEGUM_FIELDS) {
    const v = detail[fld.key];
    if (v == null) continue;
    f[fld.key] = fld.type === 'date' ? toDateInput(v) : String(v);
  }
  return f;
}

/** Actual clearance + payment term — mirrors the API, for the "Due on …" preview. */
function paymentDueFrom(clearance?: string, days?: string): Date | null {
  const n = Number(days);
  if (!clearance || !n) return null;
  const base = new Date(clearance);
  return Number.isNaN(base.getTime()) ? null : new Date(base.getTime() + n * 86_400_000);
}

const FILTERS = [
  { key: 'buyerPartyId', label: 'Buyer' },
  { key: 'sellerPartyId', label: 'Seller' },
];

export default function DegumPage() {
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filterLabels, setFilterLabels] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<'shipments' | 'calculator'>('shipments');
  const [calcDealId, setCalcDealId] = useState('');

  const params = useMemo(() => {
    const p: Record<string, any> = {};
    if (search) p.search = search;
    if (sortBy) { p.sortBy = sortBy; p.sortDir = sortDir; }
    for (const [k, v] of Object.entries(filters)) if (v) p[k] = v;
    return p;
  }, [search, sortBy, sortDir, filters]);

  const list = useQuery({
    queryKey: ['degum', page, params],
    queryFn: () => apiGet<Paginated<any>>(DEGUM_ENDPOINT, { page, limit: 25, ...params }),
  });

  const save = useMutation({
    mutationFn: (payload: any) => apiPut(`${DEGUM_ENDPOINT}/${editing.id}`, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['degum'] }); close(); },
  });

  function setFilter(key: string, value: string, label?: string) {
    setFilters((s) => ({ ...s, [key]: value }));
    if (label !== undefined) setFilterLabels((s) => ({ ...s, [key]: label }));
    setPage(1);
  }
  function clearFilters() { setFilters({}); setFilterLabels({}); setPage(1); }
  const activeFilters = Object.values(filters).filter(Boolean).length;

  function openEdit(row: any) { setEditing(row); setForm(detailToForm(row.degumDetail)); }
  function openCalculator(row: any) { setCalcDealId(row.id); setTab('calculator'); }
  function close() { setEditing(null); setForm({}); save.reset(); }

  const columns = useMemo<ColumnDef<any, any>[]>(() => {
    const cols: ColumnDef<any, any>[] = [...DEAL_COLUMNS, ...DEGUM_COLUMNS].map((c) => ({
      id: c.key,
      header: c.label,
      accessorFn: (row: any) => getPath(row, c.key),
      cell: ({ getValue }) => renderCell(getValue(), c.fmt),
      enableSorting: false,
    }));
    cols.push({
      id: '_actions',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" title="Edit shipment details" onClick={(e) => { e.stopPropagation(); openEdit(row.original); }}>
            <Pencil className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" title="Payment calculator" onClick={(e) => { e.stopPropagation(); openCalculator(row.original); }}>
            <Calculator className="size-4" />
          </Button>
        </div>
      ),
    });
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit() {
    // The whole shipment record is saved each time; an empty field is stored empty.
    const payload: Record<string, any> = {};
    for (const f of DEGUM_FIELDS) {
      const v = form[f.key]?.trim();
      payload[f.key] = !v ? null : f.type === 'number' || f.key === 'paymentDueDays' ? Number(v) : v;
    }
    save.mutate(payload);
  }

  const due = paymentDueFrom(form.clearanceDate, form.paymentDueDays);
  // Live final payment for the form: the deal's rate / qty / deposit + the duty being typed.
  const formPayment = editing && form.duty
    ? degumPayment(Number(editing.rate), Number(form.duty), Number(editing.quantity), Number(editing.deposit ?? 0))
    : null;
  const dueHint = due
    ? `Due on ${formatDate(due)}`
    : form.paymentDueDays ? 'Calculated once the actual clearance date is entered' : undefined;

  // NB: a plain function (not a nested component) so inputs keep focus while typing.
  const renderField = (f: DegumField) => (
    <div key={f.key} className="space-y-1.5">
      <Label>{f.label}</Label>
      {f.type === 'select' ? (
        <Select value={form[f.key] ?? ''} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}>
          <option value="">Not set</option>
          {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      ) : (
        <Input
          type={f.type}
          min={f.type === 'number' ? 0 : undefined}
          value={form[f.key] ?? ''}
          onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
        />
      )}
      {f.key === 'paymentDueDays' && dueHint && <p className="text-xs text-muted-foreground">{dueHint}</p>}
    </div>
  );

  // Read-only summary of the deal at the top of the form.
  const summary: [string, string][] = editing
    ? [
        ['Deal', editing.dealNo],
        ['Trade date', formatDate(editing.date)],
        ['Buyer', editing.buyerParty?.name ?? '—'],
        ['Seller', editing.sellerParty?.name ?? '—'],
        ['Material', editing.product?.code ?? '—'],
        ['Qty (MT)', formatNumber(editing.quantity, 3)],
        ['Rate', formatCurrency(editing.rate)],
        ['Port', editing.port ?? '—'],
        ['Shipment', editing.shipmentMonth ?? '—'],
      ]
    : [];

  return (
    <div>
      <PageHeader
        title="Degum"
        description={`${list.data?.meta.total ?? 0} degum deals · track vessel arrival, clearance & payment`}
      />

      <div className="mb-4 inline-flex rounded-lg border border-border bg-card p-1" role="tablist">
        {([['shipments', 'Shipments', Ship], ['calculator', 'Payment Calculator', Calculator]] as const).map(([key, label, Icon]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
              tab === key ? 'bg-primary text-primary-foreground' : 'text-foreground/80 hover:bg-accent'
            }`}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'calculator' ? (
        <DegumPaymentCalculator dealId={calcDealId} onDealChange={setCalcDealId} onEditShipment={openEdit} />
      ) : (
      <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input placeholder="Search deal, party, vessel…" className="pl-8" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Button variant={showFilters || activeFilters ? 'default' : 'outline'} size="sm" onClick={() => setShowFilters((v) => !v)}>
          <Filter className="size-4" /> Filters{activeFilters ? ` (${activeFilters})` : ''}
        </Button>
        <div className="flex items-center gap-1">
          <Select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1); }} className="h-9 w-44">
            <option value="">Sort: default</option>
            {DEGUM_SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <Button variant="outline" size="icon" title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
            onClick={() => { setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); setPage(1); }}>
            <ArrowDownUp className="size-4" />
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="mb-3 rounded-lg border border-border bg-card p-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {FILTERS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label className="text-xs">{f.label}</Label>
                <Combobox
                  endpoint="/parties"
                  value={filters[f.key] ?? ''}
                  selectedLabel={filterLabels[f.key]}
                  onChange={(id, item) => setFilter(f.key, id, item.name)}
                  mapLabel={(it) => it.name}
                  placeholder="All"
                />
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-xs">Arrival from</Label>
              <Input type="date" value={filters.etaFrom ?? ''} onChange={(e) => setFilter('etaFrom', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Arrival to</Label>
              <Input type="date" value={filters.etaTo ?? ''} onChange={(e) => setFilter('etaTo', e.target.value)} />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button variant="ghost" size="sm" onClick={clearFilters} disabled={!activeFilters}>
              <X className="size-4" /> Clear filters
            </Button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={list.data?.items ?? []}
        meta={list.data?.meta}
        isLoading={list.isLoading}
        onPageChange={setPage}
        storageKey="degum"
      />
      </>
      )}

      <Modal
        open={!!editing}
        onClose={close}
        title={editing ? `Shipment details · ${editing.dealNo}` : ''}
        footer={
          <>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button onClick={submit} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save details'}</Button>
          </>
        }
      >
        <div className="mb-4 rounded-md border border-border bg-muted/40 p-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
            {summary.map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{k}</dt>
                <dd className="truncate font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">Deal details are read-only here — change them in Deals.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DEGUM_FIELDS.map(renderField)}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Final Payment (net payable)</span>
          <span className="font-semibold tabular-nums">
            {formPayment ? formatCurrency(formPayment.netPayable) : 'Enter the duty to calculate'}
          </span>
        </div>
        {save.isError && (
          <p className="mt-3 text-sm text-destructive">
            {(save.error as any)?.response?.data?.message ?? 'Save failed.'}
          </p>
        )}
      </Modal>
    </div>
  );
}
