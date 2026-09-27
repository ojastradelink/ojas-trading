'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { apiGet, type Paginated } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ComboboxProps {
  value?: string;
  onChange: (id: string, item: any) => void;
  endpoint: string; // e.g. '/parties' or '/products'
  placeholder?: string;
  mapLabel: (item: any) => string;
  /** label of the currently selected value (for edit mode); optional */
  selectedLabel?: string;
  /** extra query params merged into the request (e.g. { isSelf: 'true' }) */
  params?: Record<string, string | number | boolean | undefined>;
}

/**
 * Searchable, server-backed single-select. Queries `${endpoint}?search=&limit=50`
 * as the user types (debounced). Closes on outside click / Escape.
 */
export function Combobox({
  value,
  onChange,
  endpoint,
  placeholder = 'Select…',
  mapLabel,
  selectedLabel,
  params,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [label, setLabel] = useState(selectedLabel ?? '');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setLabel(selectedLabel ?? ''), [selectedLabel]);
  // A value cleared from outside (e.g. a dependent field reset) clears the label too.
  useEffect(() => { if (!value) setLabel(''); }, [value]);

  // debounce the search term
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(t);
  }, [query]);

  // outside click + Escape
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', onDoc);
      document.addEventListener('keydown', onKey);
    }
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const q = useQuery({
    queryKey: ['combo', endpoint, debounced, params],
    queryFn: () => apiGet<Paginated<any>>(endpoint, { search: debounced || undefined, limit: 50, ...params }),
    enabled: open,
  });
  const items = q.data?.items ?? [];

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-1 text-left text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          !label && 'text-muted-foreground',
        )}
      >
        <span className="truncate">{label || placeholder}</span>
        <ChevronDown className="ml-2 size-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-md border border-border bg-background shadow-lg">
          <div className="relative border-b border-border p-2">
            <Search className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="h-8 w-full rounded-md border border-input bg-background pl-8 pr-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <ul className="max-h-60 overflow-auto py-1">
            {q.isLoading && <li className="px-3 py-2 text-sm text-muted-foreground">Loading…</li>}
            {!q.isLoading && items.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted-foreground">No matches.</li>
            )}
            {items.map((it) => {
              const lbl = mapLabel(it);
              const selected = it.id === value;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(it.id, it);
                      setLabel(lbl);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent',
                      selected && 'bg-accent/60',
                    )}
                  >
                    <Check className={cn('size-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />
                    <span className="truncate">{lbl}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
