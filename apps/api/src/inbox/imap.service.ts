import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FetchMessageObject, ImapFlow, MessageAddressObject, MessageStructureObject } from 'imapflow';
import { AddressObject, Attachment, ParsedMail, simpleParser } from 'mailparser';
import { AppConfig } from '../config/configuration';

export const FOLDERS = ['inbox', 'sent'] as const;
export type Folder = (typeof FOLDERS)[number];

export interface MailAddress { name: string; address: string }

export interface MessageSummary {
  uid: number;
  subject: string;
  from: MailAddress[];
  to: MailAddress[];
  cc: MailAddress[];
  date: string | null;
  seen: boolean;
  hasAttachments: boolean;
}

export interface MessageDetail extends Omit<MessageSummary, 'hasAttachments'> {
  replyTo: MailAddress[];
  messageId: string | null;
  references: string[];
  html: string | null;
  text: string;
  attachments: { index: number; filename: string; contentType: string; size: number }[];
}

// Inline images smaller than this are embedded into the HTML as data: URIs.
const INLINE_IMAGE_MAX = 1024 * 1024;

const addr = (list?: MessageAddressObject[]): MailAddress[] =>
  (list ?? []).filter((a) => a.address).map((a) => ({ name: a.name ?? '', address: a.address!.toLowerCase() }));

const parsedAddr = (v?: AddressObject | AddressObject[]): MailAddress[] =>
  (Array.isArray(v) ? v : v ? [v] : [])
    .flatMap((o) => o.value)
    .filter((a) => a.address)
    .map((a) => ({ name: a.name ?? '', address: a.address!.toLowerCase() }));

const hasAttachment = (node?: MessageStructureObject): boolean =>
  !!node && (node.disposition === 'attachment' || (node.childNodes ?? []).some(hasAttachment));

const isoDate = (d?: Date | string) => {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
};

/**
 * The firm's mailbox over IMAP (Gmail or any IMAP server). Every call opens a
 * short-lived connection, so there is nothing to keep alive or re-sync — the
 * mailbox itself stays the only copy of the mail.
 */
@Injectable()
export class ImapService {
  private readonly logger = new Logger(ImapService.name);

  constructor(private readonly config: ConfigService) {}

  private get settings(): AppConfig['mail']['imap'] {
    return this.config.get<AppConfig['mail']>('mail')!.imap;
  }

  get isConfigured(): boolean {
    const s = this.settings;
    return !!(s?.host && s.user && s.pass);
  }

  /** The mailbox's own address — left out of "reply all". */
  get address(): string {
    return this.isConfigured ? this.settings.user.toLowerCase() : '';
  }

  private async connect(): Promise<ImapFlow> {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('Mailbox is not configured. Set IMAP_HOST, IMAP_USER and IMAP_PASS.');
    }
    const s = this.settings;
    const client = new ImapFlow({
      host: s.host, port: s.port, secure: s.secure,
      auth: { user: s.user, pass: s.pass },
      logger: false,
    });
    // An unhandled 'error' event would crash the process.
    client.on('error', (err: Error) => this.logger.warn(`IMAP: ${err.message}`));
    try {
      await client.connect();
    } catch (err: any) {
      this.logger.error(`IMAP connect failed: ${err?.responseText ?? err?.message ?? err}`);
      throw new ServiceUnavailableException(
        err?.authenticationFailed
          ? 'Mailbox login failed. Check IMAP_USER / IMAP_PASS (for Gmail, an App Password).'
          : `Mailbox could not be reached: ${err?.message ?? 'IMAP error'}`,
      );
    }
    return client;
  }

  /** Opens `folder` (resolved by its special-use flag, so Gmail's "[Gmail]/Sent Mail" works too) and runs `fn`. */
  private async withFolder<T>(folder: Folder, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
    const client = await this.connect();
    try {
      const path = await this.folderPath(client, folder);
      const lock = await client.getMailboxLock(path);
      try {
        return await fn(client);
      } finally {
        lock.release();
      }
    } finally {
      await client.logout().catch(() => client.close());
    }
  }

  private async folderPath(client: ImapFlow, folder: Folder): Promise<string> {
    if (folder === 'inbox') return 'INBOX';
    const boxes = await client.list();
    const sent = boxes.find((b) => b.specialUse === '\\Sent') ?? boxes.find((b) => /^sent( (mail|items|messages))?$/i.test(b.name));
    if (!sent) throw new NotFoundException('This mailbox has no Sent folder.');
    return sent.path;
  }

  /** Newest first. `search` matches subject, sender, recipient or body. */
  async list(folder: Folder, page: number, limit: number, search?: string) {
    return this.withFolder(folder, async (client) => {
      const term = search?.trim();
      const found = await client.search(
        term ? { or: [{ subject: term }, { from: term }, { to: term }, { body: term }] } : { all: true },
        { uid: true },
      );
      const uids = (found || []).sort((a, b) => b - a);
      const pageUids = uids.slice((page - 1) * limit, page * limit);
      const items: MessageSummary[] = [];
      if (pageUids.length) {
        const rows: FetchMessageObject[] = await client.fetchAll(
          pageUids.join(','),
          { uid: true, flags: true, envelope: true, bodyStructure: true, internalDate: true },
          { uid: true },
        );
        rows.sort((a, b) => b.uid - a.uid);
        for (const m of rows) {
          items.push({
            uid: m.uid,
            subject: m.envelope?.subject ?? '',
            from: addr(m.envelope?.from),
            to: addr(m.envelope?.to),
            cc: addr(m.envelope?.cc),
            date: isoDate(m.envelope?.date ?? m.internalDate),
            seen: !!m.flags?.has('\\Seen'),
            hasAttachments: hasAttachment(m.bodyStructure),
          });
        }
      }
      return { items, total: uids.length };
    });
  }

  private async parse(client: ImapFlow, uid: number): Promise<{ mail: ParsedMail; seen: boolean }> {
    const m = await client.fetchOne(String(uid), { uid: true, flags: true, source: true }, { uid: true });
    if (!m || !m.source) throw new NotFoundException('Email not found — it may have been moved or deleted.');
    return { mail: await simpleParser(m.source), seen: !!m.flags?.has('\\Seen') };
  }

  /** One message, parsed. Opening it marks it read, as in Gmail. */
  async get(folder: Folder, uid: number): Promise<MessageDetail> {
    return this.withFolder(folder, async (client) => {
      const { mail, seen } = await this.parse(client, uid);
      if (!seen) await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
      return toDetail(uid, mail);
    });
  }

  async attachment(folder: Folder, uid: number, index: number): Promise<Attachment> {
    return this.withFolder(folder, async (client) => {
      const { mail } = await this.parse(client, uid);
      const file = mail.attachments[index];
      if (!file) throw new NotFoundException('Attachment not found.');
      return file;
    });
  }
}

function toDetail(uid: number, mail: ParsedMail): MessageDetail {
  let html = typeof mail.html === 'string' ? mail.html : null;
  // Embedded (cid:) images would not load in the browser — inline the small ones.
  if (html) {
    for (const a of mail.attachments) {
      if (a.cid && a.size <= INLINE_IMAGE_MAX && a.contentType.startsWith('image/')) {
        html = html.split(`cid:${a.cid}`).join(`data:${a.contentType};base64,${a.content.toString('base64')}`);
      }
    }
  }
  const refs = mail.references;
  return {
    uid,
    subject: mail.subject ?? '',
    from: parsedAddr(mail.from),
    to: parsedAddr(mail.to),
    cc: parsedAddr(mail.cc),
    replyTo: parsedAddr(mail.replyTo),
    date: isoDate(mail.date),
    seen: true,
    messageId: mail.messageId ?? null,
    references: Array.isArray(refs) ? refs : refs ? [refs] : [],
    html,
    text: mail.text ?? '',
    attachments: mail.attachments
      .map((a, index) => ({ index, a }))
      .filter(({ a }) => !(a.related && a.cid)) // inline images are part of the body
      .map(({ index, a }) => ({
        index,
        filename: a.filename || `attachment-${index + 1}`,
        contentType: a.contentType,
        size: a.size,
      })),
  };
}
