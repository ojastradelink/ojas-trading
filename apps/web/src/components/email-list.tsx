'use client';

import { X } from 'lucide-react';
import { type KeyboardEvent, useState } from 'react';
import { Label } from '@/components/ui/label';

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Address chips: Enter, comma or blur adds what was typed; × removes. */
export function EmailList({ label, value, onChange }: { label: string; value: string[]; onChange: (v: string[]) => void }) {
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
