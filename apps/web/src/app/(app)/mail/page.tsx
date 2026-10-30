'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, ChevronLeft, ChevronRight, Handshake, Inbox, Loader2, Mail, Paperclip, PenSquare,
  RefreshCw, Reply, ReplyAll, Search, Send, X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { EmailList } from '@/components/email-list';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, apiGet, type Paginated } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

type Folder = 'inbox' | 'sent';
interface Address { name: string; address: string }
interface DealLink { id: string; dealNo: string }
interface MessageSummary {
  uid: number; subject: string; from: Address[]; to: Address[]; cc: Address[];
  date: string | null; seen: boolean; hasAttachments: boolean; deal: DealLink | null;
}
interface MessageDetail extends Omit<MessageSummary, 'hasAttachments'> {
  replyTo: Address[]; messageId: string | null; html: string | null; text: string;
  attachments: { index: number; filename: string; contentType: string; size: number }[];
}
interface MailStatus { configured: boolean; canSend: boolean; address: string }

type ComposeMode = 'reply' | 'replyAll' | 'new';
interface Draft { mode: ComposeMode; to: string[]; cc: string[]; subject: string }

const PAGE_SIZE = 25;
const errorText = (e: unknown) => (e as any)?.response?.data?.message ?? (e as any)?.message ?? 'Something went wrong.';
const label = (a?: Address) => (a ? a.name || a.address : '');
const sizeText = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Today → time, this year → "12 Oct", else the full date. */
function shortDate(v: string | null): string {
  if (!v) return '';
  const d = new Date(v);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return formatDate(d, d.getFullYear() === now.getFullYear() ? 'dd MMM' : 'dd MMM yyyy');
}

/** The email's HTML in a sandboxed frame: no scripts, no access to the app; links open a new tab. */
function MailBody({ msg }: { msg: MessageDetail }) {
  if (!msg.html) {
    return <div className="whitespace-pre-wrap break-words p-4 text-sm">{msg.text || '(no content)'}</div>;
  }
  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">
<style>body{margin:16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;background:#fff;word-wrap:break-word}img{max-width:100%;height:auto}</style>
</head><body>${msg.html}</body></html>`;
  return (
    <iframe
      title={msg.subject || 'Email'}
      className="h-full min-h-[360px] w-full bg-white"
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      srcDoc={doc}
    />
  );
}

/** Reply / reply-all / new email, with attachments. Sent through the firm's mailbox. */
function Composer({
  draft, folder, uid, onCancel, onSent,
}: {
  draft: Draft; folder: Folder; uid: number | null; onCancel: () => void; onSent: (to: string[]) => void;
}) {
  const [to, setTo] = useState(draft.to);
  const [cc, setCc] = useState(draft.cc);
  const [subject, setSubject] = useState(draft.subject);
  const [message, setMessage] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const send = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('to', to.join(','));
      if (cc.length) fd.append('cc', cc.join(','));
      if (subject.trim()) fd.append('subject', subject.trim());
      if (message.trim()) fd.append('message', message.trim());
      for (const f of files) fd.append('files', f, f.name);
      const url = draft.mode === 'new' ? '/inbox/compose' : `/inbox/messages/${folder}/${uid}/reply`;
      // Explicit multipart so axios doesn't JSON-encode the FormData (the instance defaults to JSON).
      await api.post(url, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    },
    onSuccess: () => onSent([...to, ...cc]),
  });

  const title = draft.mode === 'new' ? 'New email' : draft.mode === 'replyAll' ? 'Reply all' : 'Reply';
  return (
    <div className="space-y-3 border-t border-border bg-muted/30 p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
          <PenSquare className="size-4" /> {title}
        </p>
        <Button variant="ghost" size="icon" onClick={onCancel} aria-label="Discard"><X className="size-4" /></Button>
      </div>
      <EmailList label="To" value={to} onChange={setTo} />
      <EmailList label="CC" value={cc} onChange={setCc} />
      <div className="space-y-1">
        <Label className="text-xs">Subject</Label>
        <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Message</Label>
        <Textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} autoFocus />
        <p className="text-xs text-muted-foreground">
          The firm&apos;s signature is added below your message{draft.mode === 'new' ? '' : ', followed by the quoted email'}.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            setFiles((s) => [...s, ...picked.filter((f) => !s.some((x) => x.name === f.name && x.size === f.size))]);
            e.target.value = '';
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
          <Paperclip className="size-4" /> Attach files
        </Button>
        {files.map((f) => (
          <span key={`${f.name}-${f.size}`} className="inline-flex items-center gap-1 rounded bg-background px-2 py-0.5 text-xs ring-1 ring-border">
            {f.name} <span className="text-muted-foreground">({sizeText(f.size)})</span>
            <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setFiles((s) => s.filter((x) => x !== f))} aria-label={`Remove ${f.name}`}>
              <X className="size-3" />
            </button>
          </span>
        ))}
      </div>
      {send.isError && <p className="text-sm text-destructive">{errorText(send.error)}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Discard</Button>
        <Button disabled={!to.length || (draft.mode === 'new' && !subject.trim()) || send.isPending} onClick={() => send.mutate()}>
          {send.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          {send.isPending ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </div>
  );
}

export default function MailPage() {
  const qc = useQueryClient();
  const canSend = useAuth((s) => s.can('mail:send'));
  const [folder, setFolder] = useState<Folder>('inbox');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [uid, setUid] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState('');

  // Search as you type, once typing pauses.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchDraft.trim()); setPage(1); }, 500);
    return () => clearTimeout(t);
  }, [searchDraft]);

  const status = useQuery({ queryKey: ['inbox-status'], queryFn: () => apiGet<MailStatus>('/inbox') });
  const configured = !!status.data?.configured;
  const me = status.data?.address ?? '';

  const list = useQuery({
    queryKey: ['inbox', folder, page, search],
    queryFn: () => apiGet<Paginated<MessageSummary>>('/inbox/messages', { folder, page, limit: PAGE_SIZE, search: search || undefined }),
    enabled: configured,
    refetchInterval: 60_000,
  });

  const message = useQuery({
    queryKey: ['inbox-message', folder, uid],
    queryFn: () => apiGet<MessageDetail>(`/inbox/messages/${folder}/${uid}`),
    enabled: configured && uid != null,
  });

  // Opening an email marks it read on the server; mirror that in the loaded lists.
  useEffect(() => {
    if (!message.data) return;
    qc.setQueriesData<Paginated<MessageSummary>>({ queryKey: ['inbox', folder] }, (old) =>
      old && { ...old, items: old.items.map((m) => (m.uid === message.data!.uid ? { ...m, seen: true } : m)) });
  }, [message.data, folder, qc]);

  function openFolder(f: Folder) { setFolder(f); setPage(1); setUid(null); setDraft(null); }
  function openMessage(id: number) { setUid(id); setDraft(null); setNotice(''); }
  function refresh() {
    qc.invalidateQueries({ queryKey: ['inbox'] });
    if (uid != null) qc.invalidateQueries({ queryKey: ['inbox-message', folder, uid] });
  }

  function startReply(mode: 'reply' | 'replyAll') {
    const m = message.data;
    if (!m) return;
    // In Sent, "reply" means writing to the same people again.
    const primary = folder === 'sent' ? m.to : m.replyTo.length ? m.replyTo : m.from;
    const to = [...new Set(primary.map((a) => a.address))].filter((a) => a !== me || folder === 'sent');
    const cc = mode === 'replyAll'
      ? [...new Set([...m.to, ...m.cc].map((a) => a.address))].filter((a) => a !== me && !to.includes(a))
      : [];
    setDraft({ mode, to, cc, subject: /^re:/i.test(m.subject.trim()) ? m.subject.trim() : `Re: ${m.subject.trim()}` });
    setNotice('');
  }

  async function download(index: number, filename: string) {
    const res = await api.get(`/inbox/messages/${folder}/${uid}/attachments/${index}`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onSent(to: string[]) {
    setDraft(null);
    setNotice(`Sent to ${to.join(', ')}.`);
    qc.invalidateQueries({ queryKey: ['inbox'] });
  }

  const header = (
    <PageHeader
      title="Mail"
      description={me ? `${me} · inbox and sent mail, read and reply here` : 'The firm’s mailbox — read and reply here'}
      actions={configured && (
        <>
          <Button variant="outline" onClick={refresh} disabled={list.isFetching}>
            <RefreshCw className={cn('size-4', list.isFetching && 'animate-spin')} /> Refresh
          </Button>
          {canSend && (
            <Button onClick={() => { setUid(null); setNotice(''); setDraft({ mode: 'new', to: [], cc: [], subject: '' }); }}>
              <PenSquare className="size-4" /> New email
            </Button>
          )}
        </>
      )}
    />
  );

  if (status.isLoading) return <>{header}<p className="text-sm text-muted-foreground">Loading…</p></>;
  if (status.isError || !configured) {
    return (
      <>
        {header}
        <div className="mx-auto max-w-xl rounded-lg border border-dashed border-border bg-card p-6 text-sm">
          <p className="mb-2 flex items-center gap-2 font-semibold"><Mail className="size-4" /> The mailbox is not connected</p>
          {status.isError ? <p className="text-destructive">{errorText(status.error)}</p> : (
            <p className="text-muted-foreground">
              Set <code>IMAP_HOST</code>, <code>IMAP_USER</code> and <code>IMAP_PASS</code> on the API (for Gmail:
              imap.gmail.com and the same App Password used for sending — with a Gmail <code>SMTP_HOST</code> these
              are picked up automatically), then restart it.
            </p>
          )}
        </div>
      </>
    );
  }

  const items = list.data?.items ?? [];
  const meta = list.data?.meta;
  const m = message.data;
  const showingDetail = uid != null || draft != null;

  return (
    <>
      {header}
      <div className="grid gap-4 lg:h-[calc(100vh-12rem)] lg:min-h-[520px] lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)]">
        {/* Message list */}
        <div className={cn('flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card', showingDetail && 'hidden lg:flex')}>
          <div className="space-y-2 border-b border-border p-3">
            <div className="inline-flex rounded-md border border-border bg-background p-0.5 text-sm">
              {([['inbox', 'Inbox', Inbox], ['sent', 'Sent', Send]] as const).map(([f, text, Icon]) => (
                <button
                  key={f}
                  type="button"
                  className={cn('flex items-center gap-1.5 rounded px-3 py-1', folder === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                  onClick={() => openFolder(f)}
                >
                  <Icon className="size-3.5" /> {text}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input placeholder="Search subject, sender, text…" className="pl-8" value={searchDraft} onChange={(e) => setSearchDraft(e.target.value)} />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.isLoading && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
            {list.isError && <p className="p-4 text-sm text-destructive">{errorText(list.error)}</p>}
            {list.isSuccess && !items.length && (
              <p className="p-4 text-sm text-muted-foreground">{search ? 'No emails match.' : 'No emails here.'}</p>
            )}
            <ul>
              {items.map((it) => {
                const who = folder === 'sent' ? `To: ${it.to.map(label).join(', ')}` : label(it.from[0]);
                return (
                  <li key={it.uid}>
                    <button
                      type="button"
                      onClick={() => openMessage(it.uid)}
                      className={cn(
                        'block w-full border-b border-border px-3 py-2.5 text-left text-sm hover:bg-accent',
                        uid === it.uid && 'bg-accent',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        {!it.seen && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                        <span className={cn('min-w-0 flex-1 truncate', !it.seen && 'font-semibold')}>{who || '(unknown)'}</span>
                        {it.hasAttachments && <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />}
                        <span className="shrink-0 text-xs text-muted-foreground">{shortDate(it.date)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className={cn('min-w-0 flex-1 truncate', it.seen ? 'text-muted-foreground' : 'font-medium')}>{it.subject || '(no subject)'}</span>
                        {it.deal && <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">{it.deal.dealNo}</span>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {meta && meta.total > 0 && (
            <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
              <span>{(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} of {meta.total}</span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" disabled={!meta.hasPrev} onClick={() => setPage((p) => p - 1)} aria-label="Newer"><ChevronLeft className="size-4" /></Button>
                <Button variant="ghost" size="icon" disabled={!meta.hasNext} onClick={() => setPage((p) => p + 1)} aria-label="Older"><ChevronRight className="size-4" /></Button>
              </div>
            </div>
          )}
        </div>

        {/* Reading pane */}
        <div className={cn('flex min-h-[420px] flex-col overflow-hidden rounded-lg border border-border bg-card', !showingDetail && 'hidden lg:flex')}>
          {showingDetail && (
            <div className="border-b border-border px-3 py-2 lg:hidden">
              <Button variant="ghost" size="sm" onClick={() => { setUid(null); setDraft(null); }}><ArrowLeft className="size-4" /> Back</Button>
            </div>
          )}
          {notice && <p className="border-b border-border bg-green-50 px-4 py-2 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-400">{notice}</p>}

          {draft?.mode === 'new' ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Composer draft={draft} folder={folder} uid={null} onCancel={() => setDraft(null)} onSent={onSent} />
            </div>
          ) : uid == null ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
              <Mail className="size-8 opacity-40" />
              Select an email to read it.
            </div>
          ) : message.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : message.isError || !m ? (
            <p className="p-4 text-sm text-destructive">{errorText(message.error)}</p>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <div className="space-y-2 border-b border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-base font-semibold">{m.subject || '(no subject)'}</h2>
                  {m.deal && (
                    <Link href={`/deals?search=${encodeURIComponent(m.deal.dealNo)}`} className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20">
                      <Handshake className="size-3.5" /> Deal {m.deal.dealNo}
                    </Link>
                  )}
                </div>
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  <p><span className="font-medium text-foreground">{m.from.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(', ')}</span></p>
                  {m.to.length > 0 && <p>To: {m.to.map((a) => a.address).join(', ')}</p>}
                  {m.cc.length > 0 && <p>CC: {m.cc.map((a) => a.address).join(', ')}</p>}
                  {m.date && <p>{formatDateTime(m.date)}</p>}
                </div>
                {m.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {m.attachments.map((a) => (
                      <button
                        key={a.index}
                        type="button"
                        onClick={() => download(a.index, a.filename)}
                        className="inline-flex items-center gap-1 rounded border border-border bg-background px-2 py-1 text-xs hover:bg-accent"
                      >
                        <Paperclip className="size-3.5" /> {a.filename} <span className="text-muted-foreground">({sizeText(a.size)})</span>
                      </button>
                    ))}
                  </div>
                )}
                {canSend && !draft && (
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" onClick={() => startReply('reply')}><Reply className="size-4" /> Reply</Button>
                    <Button variant="outline" size="sm" onClick={() => startReply('replyAll')}><ReplyAll className="size-4" /> Reply all</Button>
                  </div>
                )}
              </div>
              {draft && (
                <Composer key={`${draft.mode}-${uid}`} draft={draft} folder={folder} uid={uid} onCancel={() => setDraft(null)} onSent={onSent} />
              )}
              <div className="min-h-[360px] flex-1">
                <MailBody msg={m} />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
