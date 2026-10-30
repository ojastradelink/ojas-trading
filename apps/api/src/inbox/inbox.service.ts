import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { buildPageMeta } from '../common/dto/pagination.dto';
import { RequestUser } from '../common/types/request-user';
import { FIRM_NAME } from '../mail/firm';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { Folder, ImapService, MailAddress, MessageDetail } from './imap.service';
import { InboxQueryDto, SendMailDto } from './inbox.dto';

export interface Ctx {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface UploadedMailFile { originalname: string; mimetype: string; size: number; buffer: Buffer }

// Gmail rejects messages over 25 MB; base64 adds about a third.
const MAX_ATTACHMENTS_BYTES = 18 * 1024 * 1024;

const escHtml = (v: unknown) =>
  String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

const who = (a?: MailAddress) => (a ? (a.name ? `${a.name} <${a.address}>` : a.address) : 'unknown sender');

/** Words in a subject that could be a deal number (letters + digits, e.g. DL001). */
const dealTokens = (subject: string) =>
  subject.split(/[\s,;:()[\]{}<>"'“”‘’–—|]+/)
    .map((t) => t.replace(/^[^\w]+|[^\w]+$/g, '').toUpperCase())
    .filter((t) => /[A-Z]/.test(t) && /\d/.test(t) && t.length <= 30);

/** Plain text of an HTML body, for quoting. */
const htmlToText = (html: string) =>
  html.replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/**
 * The Mail section: the firm's mailbox (Inbox + Sent) read over IMAP, with
 * replies and new emails sent through the same SMTP account as contract notes.
 */
@Injectable()
export class InboxService {
  constructor(
    private readonly imap: ImapService,
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  status() {
    return { configured: this.imap.isConfigured, canSend: this.mail.isConfigured, address: this.imap.address };
  }

  async list(user: RequestUser, q: InboxQueryDto) {
    const { items, total } = await this.imap.list(q.folder, q.page, q.limit, q.search);
    const deals = await this.dealsBySubject(user, items.map((m) => m.subject));
    return {
      items: items.map((m) => ({ ...m, deal: deals(m.subject) })),
      meta: buildPageMeta(total, q.page, q.limit),
    };
  }

  async get(user: RequestUser, folder: Folder, uid: number) {
    const msg = await this.imap.get(folder, uid);
    const deals = await this.dealsBySubject(user, [msg.subject]);
    return { ...msg, deal: deals(msg.subject) };
  }

  attachment(folder: Folder, uid: number, index: number) {
    return this.imap.attachment(folder, uid, index);
  }

  async reply(user: RequestUser, folder: Folder, uid: number, dto: SendMailDto, files: UploadedMailFile[], ctx: Ctx) {
    const original = await this.imap.get(folder, uid);
    const base = original.subject.trim();
    const subject = dto.subject?.trim() || (/^re:/i.test(base) ? base : `Re: ${base}`);
    const references = [...original.references, original.messageId].filter((r): r is string => !!r);
    return this.send(user, dto, subject, files, ctx, {
      original,
      inReplyTo: original.messageId ?? undefined,
      references,
    });
  }

  async compose(user: RequestUser, dto: SendMailDto, files: UploadedMailFile[], ctx: Ctx) {
    const subject = dto.subject?.trim();
    if (!subject) throw new BadRequestException('Add a subject.');
    return this.send(user, dto, subject, files, ctx);
  }

  private async send(
    user: RequestUser, dto: SendMailDto, subject: string, files: UploadedMailFile[], ctx: Ctx,
    thread?: { original: MessageDetail; inReplyTo?: string; references: string[] },
  ) {
    const total = files.reduce((s, f) => s + f.size, 0);
    if (total > MAX_ATTACHMENTS_BYTES) {
      throw new BadRequestException(`Attachments add up to ${(total / 1048576).toFixed(1)} MB — keep them under 18 MB.`);
    }
    const cc = (dto.cc ?? []).filter((e) => !dto.to.includes(e));
    const message = dto.message?.trim() ?? '';

    await this.mail.send({
      to: dto.to,
      cc,
      subject,
      html: mailHtml(message, thread?.original),
      text: mailText(message, thread?.original),
      attachments: files.map((f) => ({ filename: f.originalname, content: f.buffer, contentType: f.mimetype })),
      inReplyTo: thread?.inReplyTo,
      references: thread?.references,
    });

    await this.audit.record({
      companyId: user.companyId,
      actorId: user.id,
      action: 'EXPORT',
      entityType: 'Email',
      summary: `${thread ? 'Replied' : 'Emailed'} "${subject}" to ${[...dto.to, ...cc].join(', ')}`,
      diff: { to: dto.to, cc, subject, attachments: files.map((f) => f.originalname) },
      ...ctx,
    });
    return { sent: true, to: dto.to, cc, subject };
  }

  /** Links an email to the live deal whose number appears in its subject. */
  private async dealsBySubject(user: RequestUser, subjects: string[]) {
    const tokens = [...new Set(subjects.flatMap(dealTokens))];
    const rows = tokens.length
      ? await this.prisma.deal.findMany({
          where: { companyId: user.companyId, deletedAt: null, dealNo: { in: tokens } }, // deal numbers are upper-case (DL001)
          select: { id: true, dealNo: true },
        })
      : [];
    const byNo = new Map(rows.map((d) => [d.dealNo.toUpperCase(), d]));
    return (subject: string) => dealTokens(subject).map((t) => byNo.get(t)).find(Boolean) ?? null;
  }
}

function quoteHeader(o: MessageDetail) {
  const when = o.date ? new Date(o.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) : '';
  return `On ${when ? `${when}, ` : ''}${who(o.from[0])} wrote:`;
}

const quotedText = (o: MessageDetail) => o.text.trim() || (o.html ? htmlToText(o.html) : '');

function mailHtml(message: string, original?: MessageDetail): string {
  const quote = original
    ? `<br><div style="color:#555">${escHtml(quoteHeader(original))}</div>
<blockquote style="margin:4px 0 0 4px;border-left:2px solid #ccc;padding-left:10px;color:#555;white-space:pre-line">${escHtml(quotedText(original))}</blockquote>`
    : '';
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111">
${message ? `<p style="white-space:pre-line">${escHtml(message)}</p>` : ''}
<p>Regards,<br><strong>${escHtml(FIRM_NAME)}</strong></p>
${quote}
</div>`;
}

function mailText(message: string, original?: MessageDetail): string {
  const parts = [message, `Regards,\n${FIRM_NAME}`].filter(Boolean);
  if (original) {
    parts.push(`${quoteHeader(original)}\n${quotedText(original).split('\n').map((l) => `> ${l}`).join('\n')}`);
  }
  return parts.join('\n\n') + '\n';
}
