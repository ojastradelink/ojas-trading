'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { looksDegum } from '@/lib/degum-config';
import { DataTable } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { apiDelete, apiGet, apiPatch, apiPost, type Paginated } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/format';

interface Product {
  id: string; code: string; name: string; unit: string;
  brokerage: string; isDegum: boolean; updatedAt: string;
}

export default function ProductsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({ unit: 'MT' });
  const [err, setErr] = useState('');

  const list = useQuery({ queryKey: ['products'], queryFn: () => apiGet<Paginated<Product>>('/products', { limit: 200 }) });

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        code: form.code,
        name: form.name,
        unit: form.unit || 'MT',
        brokerage: form.brokerage ? Number(form.brokerage) : 0,
        isDegum: form.isDegum === 'true',
      };
      return editId ? apiPatch(`/products/${editId}`, payload) : apiPost('/products', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      close();
    },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Save failed.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/products/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['products'] }),
  });

  function close() { setOpen(false); setEditId(null); setForm({ unit: 'MT' }); setErr(''); }
  function openCreate() { setForm({ unit: 'MT' }); setEditId(null); setOpen(true); }
  function openEdit(p: Product) {
    setForm({ code: p.code, name: p.name, unit: p.unit, brokerage: String(Number(p.brokerage)), isDegum: String(p.isDegum) });
    setEditId(p.id);
    setOpen(true);
  }

  const columns: ColumnDef<Product, any>[] = [
    { id: 'code', header: 'Code', accessorKey: 'code', enableSorting: false, cell: ({ row }) => <span className="font-medium">{row.original.code}</span> },
    { id: 'name', header: 'Name', accessorKey: 'name', enableSorting: false },
    { id: 'unit', header: 'Unit', accessorKey: 'unit', enableSorting: false },
    { id: 'brokerage', header: 'Brokerage Total (₹/MT)', enableSorting: false, cell: ({ row }) => formatCurrency(row.original.brokerage) },
    { id: 'split', header: 'Buyer / Seller (₹/MT)', enableSorting: false,
      cell: ({ row }) => {
        const half = formatCurrency(Number(row.original.brokerage) / 2);
        return <span className="text-muted-foreground">{half} / {half}</span>;
      } },
    { id: 'isDegum', header: 'Degum', enableSorting: false,
      cell: ({ row }) => row.original.isDegum ? <Badge color="#0ea5e9">DEGUM</Badge> : <span className="text-muted-foreground">—</span> },
    { id: 'updatedAt', header: 'Last Updated', enableSorting: false, cell: ({ row }) => formatDate(row.original.updatedAt) },
    { id: '_actions', header: '', enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)}><Pencil className="size-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => remove.mutate(row.original.id)}><Trash2 className="size-4 text-destructive" /></Button>
        </div>
      ) },
  ];

  const half = form.brokerage ? Number(form.brokerage) / 2 : 0;

  return (
    <div>
      <Link href="/master" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Master Data
      </Link>
      <PageHeader
        title="Products & Brokerage"
        description="Each material's brokerage is split equally between buyer and seller when you create a deal"
        actions={<Button size="sm" onClick={openCreate}><Plus className="size-4" /> Add Product</Button>}
      />

      <DataTable columns={columns} data={list.data?.items ?? []} isLoading={list.isLoading} storageKey="products" />

      <Modal
        open={open}
        onClose={close}
        title={editId ? `Edit ${form.code ?? 'Product'}` : 'Add Product'}
        footer={
          <>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button onClick={() => { setErr(''); save.mutate(); }} disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[
            { k: 'code', l: 'Code *' },
            { k: 'name', l: 'Name *' },
            { k: 'unit', l: 'Unit' },
            { k: 'brokerage', l: 'Brokerage Total (₹/MT)', t: 'number' },
          ].map((f) => (
            <div key={f.k} className="space-y-1.5">
              <Label>{f.l}</Label>
              <Input
                type={f.t === 'number' ? 'number' : 'text'}
                min={f.t === 'number' ? 0 : undefined}
                value={form[f.k] ?? ''}
                onChange={(e) => setForm((s) => {
                  const next = { ...s, [f.k]: e.target.value };
                  // New product: tick Degum for a degum code / name until the user sets it themselves.
                  if (!editId && !s.__degumTouched && (f.k === 'code' || f.k === 'name')) next.isDegum = String(looksDegum(next.code, next.name));
                  return next;
                })}
              />
            </div>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" checked={form.isDegum === 'true'} onChange={(e) => setForm((s) => ({ ...s, isDegum: String(e.target.checked), __degumTouched: 'true' }))} />
          Degum material — its deals are tracked in the Degum section (vessel, clearance, payment)
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          New deals fill {formatCurrency(half)}/MT for the buyer and {formatCurrency(half)}/MT for the seller. Existing deals are not changed.
        </p>
        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
      </Modal>
    </div>
  );
}
