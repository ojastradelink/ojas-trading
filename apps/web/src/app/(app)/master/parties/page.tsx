'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { ArrowLeft, Building2, Pencil, Plus, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { apiDelete, apiGet, apiPatch, apiPost, type Paginated } from '@/lib/api';

interface Party {
  id: string; name: string; type: 'BUYER' | 'SELLER' | 'BOTH'; isSelf: boolean;
  contactPerson?: string; phones?: string[]; email?: string; address?: string; city?: string; gstin?: string; notes?: string;
}

const typeColor = (t: string) => (t === 'BUYER' ? '#6366f1' : t === 'SELLER' ? '#8b5cf6' : '#0ea5e9');

export default function PartiesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Party | null>(null); // null = closed
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [err, setErr] = useState('');

  const list = useQuery({
    queryKey: ['parties', page, search],
    queryFn: () => apiGet<Paginated<Party>>('/parties', { page, limit: 25, search: search || undefined }),
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name, type: form.type ?? 'BOTH', isSelf: !!form.isSelf,
        contactPerson: form.contactPerson || undefined,
        phones: ((form.phones ?? []) as string[]).map((p) => p.trim()).filter(Boolean),
        email: form.email || undefined, city: form.city || undefined,
        gstin: form.gstin || undefined, address: form.address || undefined, notes: form.notes || undefined,
      };
      return editing?.id
        ? await apiPatch<Party>(`/parties/${editing.id}`, payload)
        : await apiPost<Party>('/parties', payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parties'] });
      close();
    },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Save failed.'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/parties/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parties'] }),
  });

  function close() { setEditing(null); setCreating(false); setForm({}); setErr(''); }

  function openCreate(asSelf = false) {
    setForm({ type: 'BOTH', isSelf: asSelf, phones: [''] });
    setCreating(true);
  }

  // load full party when editing
  const editQuery = useQuery({
    queryKey: ['party', editing?.id],
    queryFn: () => apiGet<Party>(`/parties/${editing!.id}`),
    enabled: !!editing?.id,
  });
  useEffect(() => {
    if (editQuery.data) {
      const p = editQuery.data;
      setForm({ name: p.name, type: p.type, isSelf: p.isSelf, contactPerson: p.contactPerson, phones: p.phones?.length ? p.phones : [''], email: p.email, city: p.city, gstin: p.gstin, address: p.address, notes: p.notes });
    }
  }, [editQuery.data]);

  const columns: ColumnDef<Party, any>[] = [
    { id: 'name', header: 'Party', accessorKey: 'name', enableSorting: false,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span> },
    { id: 'type', header: 'Type', enableSorting: false,
      cell: ({ row }) => <Badge color={typeColor(row.original.type)}>{row.original.type}</Badge> },
    { id: 'self', header: 'Self', enableSorting: false,
      cell: ({ row }) => row.original.isSelf ? <Badge color="#22c55e">SELF FIRM</Badge> : <span className="text-muted-foreground">—</span> },
    { id: 'city', header: 'City / Region', accessorKey: 'city', enableSorting: false, cell: ({ row }) => row.original.city ?? '—' },
    { id: 'phones', header: 'Phone', enableSorting: false, cell: ({ row }) => row.original.phones?.length ? row.original.phones.join(', ') : '—' },
    { id: 'gstin', header: 'GSTIN', accessorKey: 'gstin', enableSorting: false, cell: ({ row }) => row.original.gstin ?? '—' },
    { id: '_actions', header: '', enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" onClick={() => setEditing(row.original)}><Pencil className="size-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => remove.mutate(row.original.id)}><Trash2 className="size-4 text-destructive" /></Button>
        </div>
      ) },
  ];

  const open = creating || !!editing;
  const phones: string[] = form.phones?.length ? form.phones : [''];
  const setPhones = (next: string[]) => setForm((s) => ({ ...s, phones: next }));

  return (
    <div>
      <Link href="/master" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Master Data
      </Link>
      <PageHeader
        title="Parties"
        description="Buyers, sellers & your own firm"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => openCreate(true)}>
              <Building2 className="size-4" /> Create Self Firm
            </Button>
            <Button size="sm" onClick={() => openCreate(false)}>
              <Plus className="size-4" /> Add Party
            </Button>
          </>
        }
      />

      <div className="mb-3 max-w-xs">
        <Input placeholder="Search parties…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>

      <DataTable
        columns={columns}
        data={list.data?.items ?? []}
        meta={list.data?.meta}
        isLoading={list.isLoading}
        onPageChange={setPage}
        storageKey="parties"
      />

      <Modal
        open={open}
        onClose={close}
        title={creating ? (form.isSelf ? 'Create Self Firm' : 'Add Party') : `Edit ${form.name ?? 'Party'}`}
        footer={
          <>
            <Button variant="outline" onClick={close}>Cancel</Button>
            <Button onClick={() => { setErr(''); save.mutate(); }} disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Party Name *</Label>
            <Input value={form.name ?? ''} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Type (Buyer / Seller)</Label>
            <Select value={form.type ?? 'BOTH'} onChange={(e) => setForm((s) => ({ ...s, type: e.target.value }))}>
              <option value="BOTH">Both</option>
              <option value="BUYER">Buyer</option>
              <option value="SELLER">Seller</option>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>Contact Person</Label><Input value={form.contactPerson ?? ''} onChange={(e) => setForm((s) => ({ ...s, contactPerson: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>City / Region</Label><Input value={form.city ?? ''} onChange={(e) => setForm((s) => ({ ...s, city: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>GSTIN</Label><Input value={form.gstin ?? ''} onChange={(e) => setForm((s) => ({ ...s, gstin: e.target.value }))} /></div>
          <div className="space-y-1.5"><Label>Email</Label><Input value={form.email ?? ''} onChange={(e) => setForm((s) => ({ ...s, email: e.target.value }))} /></div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Phone Numbers</Label>
            {phones.map((ph, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  type="tel"
                  value={ph}
                  placeholder={i === 0 ? 'Primary number' : 'Another number'}
                  onChange={(e) => setPhones(phones.map((x, j) => (j === i ? e.target.value : x)))}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Remove number"
                  disabled={phones.length === 1 && !ph}
                  onClick={() => setPhones(phones.length === 1 ? [''] : phones.filter((_, j) => j !== i))}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setPhones([...phones, ''])}>
              <Plus className="size-4" /> Add phone number
            </Button>
          </div>
          <label className="flex items-center gap-2 sm:col-span-2 text-sm">
            <input type="checkbox" className="size-4" checked={!!form.isSelf} onChange={(e) => setForm((s) => ({ ...s, isSelf: e.target.checked }))} />
            This is our own firm (Self)
          </label>
        </div>

        {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
      </Modal>
    </div>
  );
}
