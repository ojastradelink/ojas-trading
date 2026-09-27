'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import {
  ArrowDownUp,
  Download,
  FileDown,
  Filter,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ContractNoteModal } from '@/components/contract-note-modal';
import { DataTable } from '@/components/data-table';
import { getPath, renderCell } from '@/components/deal-cell';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { api, apiDelete, apiGet, apiPatch, apiPost, type Paginated } from '@/lib/api';
import {
  DEAL_COLUMNS,
  DEAL_ENDPOINT,
  DEAL_FIELDS,
  DEAL_FILTERS,
  DEAL_SORTS,
  type DealField,
} from '@/lib/deal-config';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';

function toDateInput(v: any): string {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

/** Due-date option for an older deal that has an explicit due date but no 7/10-day term. */
const KEEP_DUE = 'keep';
/** Form-only flag: the chosen seller is our own firm, so the deal must say which purchase it sells from. */
const SELLER_SELF = '__sellerSelf';
/** Form-only: qty in hand on the chosen source, for its hint. */
const SOURCE_IN_HAND = '__sourceInHand';

function rowToForm(row: any): Record<string, string> {
  const f: Record<string, string> = {};
  for (const fld of DEAL_FIELDS) {
    const v = row[fld.key];
    if (v == null) continue;
    f[fld.key] = fld.type === 'date' ? toDateInput(v) : String(v);
  }
  if (row.dueDays == null && row.dueDate) f.dueDays = KEEP_DUE;
  f[SELLER_SELF] = String(!!row.sellerParty?.isSelf);
  return f;
}

/** Trade date + payment term — mirrors the API, for the form's "Due on …" preview. */
function dueFrom(tradeDate: string | undefined, days: string | undefined): Date | null {
  const n = Number(days);
  if (!n) return null;
  const base = tradeDate ? new Date(tradeDate) : new Date();
  return Number.isNaN(base.getTime()) ? null : new Date(base.getTime() + n * 86_400_000);
}

/** Half of a material's brokerage, as a form string (e.g. 200 → "100"). */
function halfOf(brokerage: any): string {
  return String(Number((Number(brokerage ?? 0) / 2).toFixed(4)));
}

export default function DealsPage() {
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filterLabels, setFilterLabels] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  // Labels for comboboxes filled in by code (a picked source sets the material, or a prefill).
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [contractRow, setContractRow] = useState<any | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported?: number; message?: string; errors?: { row: number; message: string }[] } | null>(null);

  const params = useMemo(() => {
    const p: Record<string, any> = {};
    if (search) p.search = search;
    if (sortBy) { p.sortBy = sortBy; p.sortDir = sortDir; }
    for (const [k, v] of Object.entries(filters)) if (v) p[k] = v;
    return p;
  }, [search, sortBy, sortDir, filters]);

  const list = useQuery({
    queryKey: ['deals', page, params],
    queryFn: () => apiGet<Paginated<any>>(DEAL_ENDPOINT, { page, limit: 25, ...params }),
  });

  const save = useMutation({
    mutationFn: (payload: any) =>
      editing ? apiPatch(`${DEAL_ENDPOINT}/${editing.id}`, payload) : apiPost(DEAL_ENDPOINT, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['deals'] }); closeModal(); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`${DEAL_ENDPOINT}/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deals'] }),
  });

  function setFilter(key: string, value: string, label?: string) {
    setFilters((s) => ({ ...s, [key]: value }));
    if (label !== undefined) setFilterLabels((s) => ({ ...s, [key]: label }));
    setPage(1);
  }
  function clearFilters() { setFilters({}); setFilterLabels({}); setPage(1); }
  const activeFilters = Object.values(filters).filter(Boolean).length;

  function openCreate() { setEditing(null); setLabels({}); setForm({ date: toDateInput(new Date()) }); setOpen(true); }
  function openEdit(row: any) { setEditing(row); setLabels({}); setForm(rowToForm(row)); setOpen(true); }
  function closeModal() { setOpen(false); setEditing(null); setForm({}); setLabels({}); save.reset(); }

  // "Sell" from the Trading Desk lands here as /deals?sellFrom=<purchase id>: open a new
  // deal with our firm as seller and that purchase as the source.
  useEffect(() => {
    const sellFrom = new URLSearchParams(window.location.search).get('sellFrom');
    if (!sellFrom) return;
    window.history.replaceState(null, '', window.location.pathname);
    apiGet<any>(`${DEAL_ENDPOINT}/${sellFrom}`).then((src) => {
      setEditing(null);
      setForm({
        date: toDateInput(new Date()),
        sellerPartyId: src.buyerPartyId,
        [SELLER_SELF]: 'true',
        productId: src.productId ?? '',
        sourceDealId: src.id,
        buyerBrokerage: halfOf(src.product?.brokerage),
        sellerBrokerage: halfOf(src.product?.brokerage),
      });
      setLabels({
        sellerPartyId: src.buyerParty?.name ?? '',
        productId: src.product ? `${src.product.code} — ${src.product.name}` : '',
        sourceDealId: src.dealNo,
      });
      setOpen(true);
      // Show how much is in hand on the pre-picked purchase.
      apiGet<Paginated<any>>('/trading-desk/sources', { sellerPartyId: src.buyerPartyId, productId: src.productId ?? undefined })
        .then((r) => {
          const hit = r.items.find((x) => x.id === src.id);
          if (hit) setForm((s) => ({ ...s, [SOURCE_IN_HAND]: formatNumber(hit.inHand, 3) }));
        })
        .catch(() => undefined);
    }).catch(() => undefined);
  }, []);

  async function doExport() {
    setExporting(true);
    try {
      const res = await api.get(`${DEAL_ENDPOINT}/export`, { params, responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'deals.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setImportResult({ message: 'Export failed.' });
    } finally { setExporting(false); }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResult(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post(`${DEAL_ENDPOINT}/import`, fd);
      const payload = (res.data?.data ?? res.data) as { imported: number };
      setImportResult({ imported: payload.imported });
      qc.invalidateQueries({ queryKey: ['deals'] });
    } catch (err: any) {
      const d = err?.response?.data;
      setImportResult({ message: d?.message ?? 'Import failed.', errors: d?.errors });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const columns = useMemo<ColumnDef<any, any>[]>(() => {
    const cols: ColumnDef<any, any>[] = DEAL_COLUMNS.map((c) => ({
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
          <Button variant="ghost" size="icon" title="Edit" onClick={(e) => { e.stopPropagation(); openEdit(row.original); }}>
            <Pencil className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" title="Delete" onClick={(e) => { e.stopPropagation(); remove.mutate(row.original.id); }}>
            <Trash2 className="size-4 text-destructive" />
          </Button>
          <Button variant="ghost" size="icon" title="Contract note" onClick={(e) => { e.stopPropagation(); setContractRow(row.original); }}>
            <FileDown className="size-4" />
          </Button>
        </div>
      ),
    });
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit() {
    const payload: Record<string, any> = {};
    for (const f of DEAL_FIELDS) {
      const v = form[f.key];
      if (f.key === 'sourceDealId') {
        // Only a sale by our own firm carries a source; otherwise drop any old one.
        if (form[SELLER_SELF] === 'true') { if (v) payload.sourceDealId = v; }
        else if (editing?.sourceDealId) payload.sourceDealId = null;
        continue;
      }
      if (f.key === 'dueDays') {
        // The API calculates the due date from the term. "Keep" leaves an older
        // explicit due date untouched; blank clears the due date.
        if (v === KEEP_DUE) continue;
        if (v) payload.dueDays = Number(v);
        else if (editing && (editing.dueDays != null || editing.dueDate != null)) payload.dueDays = null;
        continue;
      }
      if (v === undefined || v === '') {
        // On edit, an emptied optional field is cleared (null); the deal date
        // and brokerage always have a value, so leaving them blank keeps the old one.
        const clearable = !f.required && !f.ref && f.key !== 'date' && !f.key.endsWith('Brokerage');
        if (editing && clearable && editing[f.key] != null) payload[f.key] = null;
        continue;
      }
      payload[f.key] = f.type === 'number' ? Number(v) : v;
    }
    save.mutate(payload);
  }

  // Live "Brokerage Total" preview = Qty × (Buyer + Seller brokerage).
  const qty = Number(form.quantity || 0);
  const brokeragePreview = qty * (Number(form.buyerBrokerage || 0) + Number(form.sellerBrokerage || 0));
  // Live due date = trade date + chosen term.
  const due = dueFrom(form.date, form.dueDays);
  const dueHint = due
    ? `Due on ${formatDate(due)}`
    : form.dueDays === KEEP_DUE ? 'Set before due-date terms — pick 7 or 10 days to recalculate' : undefined;

  // NB: a plain function (not a nested component) so inputs keep focus while typing.
  const renderField = (f: DealField) => {
    // "Selling from" only applies when our own firm is the seller.
    if (f.ref === 'sources' && form[SELLER_SELF] !== 'true') return null;
    const rel = editing?.[f.key.replace(/Id$/, '')];
    const derivedLabel = !rel ? undefined
      : f.ref === 'products' ? `${rel.code} — ${rel.name}`
      : f.ref === 'sources' ? rel.dealNo
      : rel.name;
    const selectedLabel = labels[f.key] || derivedLabel;
    const hint = f.key === 'dueDays' ? dueHint
      : f.ref === 'sources'
        ? form[SOURCE_IN_HAND] ? `${form[SOURCE_IN_HAND]} MT in hand on this purchase` : 'Your own firm is selling — pick the purchase this stock comes from'
        : f.hint;
    let control: React.ReactNode;
    if (f.type === 'select' && f.ref === 'sources') {
      control = (
        <Combobox
          endpoint="/trading-desk/sources"
          params={{
            sellerPartyId: form.sellerPartyId,
            productId: form.productId || undefined,
            excludeDealId: editing?.id,
            currentSourceId: editing?.sourceDealId ?? undefined,
          }}
          value={form.sourceDealId ?? ''}
          selectedLabel={selectedLabel}
          onChange={(id, item) => {
            setForm((s) => ({
              ...s,
              sourceDealId: id,
              [SOURCE_IN_HAND]: formatNumber(item.inHand, 3),
              // The source fixes the material (and so its brokerage split).
              ...(item.productId !== s.productId
                ? { productId: item.productId, buyerBrokerage: halfOf(item.product?.brokerage), sellerBrokerage: halfOf(item.product?.brokerage) }
                : {}),
            }));
            if (item.product) setLabels((l) => ({ ...l, productId: `${item.product.code} — ${item.product.name}` }));
          }}
          mapLabel={(it) => `${it.dealNo} · ${it.product?.code ?? '—'} · ${formatNumber(it.inHand, 3)} of ${formatNumber(it.quantity, 3)} MT in hand @ ${formatCurrency(it.rate)} · ${it.supplier}`}
          placeholder="Select the purchase deal…"
        />
      );
    } else if (f.type === 'select' && f.ref) {
      control = (
        <Combobox
          endpoint={f.ref === 'products' ? '/products' : '/parties'}
          value={form[f.key] ?? ''}
          selectedLabel={selectedLabel}
          onChange={(id, item) => {
            setForm((s) => ({
              ...s,
              [f.key]: id,
              // Picking a material splits its brokerage equally between both sides.
              ...(f.key === 'productId' ? { buyerBrokerage: halfOf(item.brokerage), sellerBrokerage: halfOf(item.brokerage) } : {}),
              // Our own firm as seller → it must sell from one of its purchases.
              ...(f.key === 'sellerPartyId' ? { [SELLER_SELF]: String(!!item.isSelf) } : {}),
              // A new seller or material invalidates the chosen source.
              ...((f.key === 'sellerPartyId' || f.key === 'productId') && s[f.key] !== id ? { sourceDealId: '', [SOURCE_IN_HAND]: '' } : {}),
            }));
            setLabels((l) => ({ ...l, [f.key]: f.ref === 'products' ? `${item.code} — ${item.name}` : item.name }));
          }}
          mapLabel={(it) => (f.ref === 'products' ? `${it.code} — ${it.name}` : it.name)}
          placeholder="Search & select…"
        />
      );
    } else if (f.type === 'select') {
      const current = form[f.key];
      // Keep a legacy value (e.g. "Jul-25", or an old explicit due date) selectable.
      const legacyLabel = current === KEEP_DUE ? `Keep ${formatDate(editing?.dueDate)}` : current;
      const options = current && !(f.options ?? []).some((o) => o.value === current)
        ? [{ value: current, label: legacyLabel }, ...(f.options ?? [])]
        : f.options ?? [];
      control = (
        <Select value={current ?? ''} onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}>
          <option value="">{f.emptyLabel ?? 'Select…'}</option>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      );
    } else {
      control = (
        <Input
          type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
          min={f.type === 'number' ? 0 : undefined}
          value={form[f.key] ?? ''}
          onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
        />
      );
    }
    return (
      <div key={f.key} className="space-y-1.5">
        <Label>{f.label}{f.required && <span className="text-destructive"> *</span>}</Label>
        {control}
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    );
  };

  return (
    <div>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFile} />
      <PageHeader
        title="Deals"
        description={`${list.data?.meta.total ?? 0} records · filter, sort, import & export`}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" /> Import
            </Button>
            <Button variant="outline" size="sm" onClick={doExport} disabled={exporting}>
              <Download className="size-4" /> {exporting ? 'Exporting…' : 'Export'}
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="size-4" /> New Deal
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input placeholder="Search deal, party, port…" className="pl-8" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Button variant={showFilters || activeFilters ? 'default' : 'outline'} size="sm" onClick={() => setShowFilters((v) => !v)}>
          <Filter className="size-4" /> Filters{activeFilters ? ` (${activeFilters})` : ''}
        </Button>
        <div className="flex items-center gap-1">
          <Select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1); }} className="h-9 w-40">
            <option value="">Sort: default</option>
            {DEAL_SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
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
            {DEAL_FILTERS.map((f) => (
              <div key={f.key} className="space-y-1">
                <Label className="text-xs">{f.label}</Label>
                {f.kind === 'select' ? (
                  <Select value={filters[f.key] ?? ''} onChange={(e) => setFilter(f.key, e.target.value)}>
                    <option value="">All</option>
                    {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                ) : (
                  <Combobox
                    endpoint={f.kind === 'product' ? '/products' : '/parties'}
                    value={filters[f.key] ?? ''}
                    selectedLabel={filterLabels[f.key]}
                    onChange={(id, item) => setFilter(f.key, id, f.kind === 'product' ? `${item.code} — ${item.name}` : item.name)}
                    mapLabel={(it) => (f.kind === 'product' ? `${it.code} — ${it.name}` : it.name)}
                    placeholder="All"
                  />
                )}
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-xs">Date from</Label>
              <Input type="date" value={filters.dateFrom ?? ''} onChange={(e) => setFilter('dateFrom', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date to</Label>
              <Input type="date" value={filters.dateTo ?? ''} onChange={(e) => setFilter('dateTo', e.target.value)} />
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
        storageKey="deals"
      />

      <Modal
        open={open}
        onClose={closeModal}
        title={editing ? `Edit Deal ${editing.dealNo}` : 'New Deal'}
        footer={
          <>
            <Button variant="outline" onClick={closeModal}>Cancel</Button>
            <Button onClick={submit} disabled={save.isPending}>
              {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {DEAL_FIELDS.map(renderField)}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <span className="text-muted-foreground">Brokerage Total (Qty × buyer + seller)</span>
          <span className="font-semibold tabular-nums">{formatCurrency(brokeragePreview)}</span>
        </div>
        {save.isError && (
          <p className="mt-3 text-sm text-destructive">
            {(save.error as any)?.response?.data?.message ?? 'Save failed.'}
          </p>
        )}
      </Modal>

      <ContractNoteModal open={!!contractRow} onClose={() => setContractRow(null)} deal={contractRow} />

      {/* Import result */}
      <Modal
        open={!!importResult}
        onClose={() => setImportResult(null)}
        title="Import result"
        footer={<Button onClick={() => setImportResult(null)}>Close</Button>}
      >
        {importResult?.imported != null ? (
          <p className="text-sm">
            <span className="font-semibold text-green-600">Imported {importResult.imported} deal(s).</span>
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium text-destructive">{importResult?.message ?? 'Import failed.'}</p>
            {importResult?.errors && importResult.errors.length > 0 && (
              <div className="max-h-72 overflow-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="bg-card"><tr>
                    <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase text-muted-foreground">Row</th>
                    <th className="px-3 py-1.5 text-left text-xs font-semibold uppercase text-muted-foreground">Problem</th>
                  </tr></thead>
                  <tbody>
                    {importResult.errors.map((e, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="px-3 py-1.5 tabular-nums">{e.row}</td>
                        <td className="px-3 py-1.5">{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Nothing was imported — fix the file and try again.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
