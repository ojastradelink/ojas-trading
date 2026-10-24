import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, SendMailOptions, Transporter } from 'nodemailer';
import { AppConfig } from '../config/configuration';

export interface MailMessage {
  to: string[];
  cc?: string[];
  replyTo?: string | null;
  subject: string;
  html: string;
  text?: string;
  attachments?: SendMailOptions['attachments'];
}

/**
 * Outgoing mail over plain SMTP (the firm's own mailbox — Gmail, Zoho, etc.).
 * The transport is built lazily so the API boots fine without SMTP settings;
 * sending then fails with a clear 503 instead.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transport: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  private get settings(): AppConfig['mail'] {
    return this.config.get<AppConfig['mail']>('mail')!;
  }

  get isConfigured(): boolean {
    const m = this.settings;
    return !!(m?.host && m.from);
  }

  private getTransport(): Transporter {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('Email is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM.');
    }
    if (!this.transport) {
      const m = this.settings;
      this.transport = createTransport({
        host: m.host,
        port: m.port,
        secure: m.secure,
        auth: m.user ? { user: m.user, pass: m.pass } : undefined,
      });
    }
    return this.transport;
  }

  async send(msg: MailMessage): Promise<void> {
    const transport = this.getTransport();
    try {
      await transport.sendMail({
        from: this.settings.from,
        to: msg.to,
        cc: msg.cc?.length ? msg.cc : undefined,
        replyTo: msg.replyTo || undefined,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        attachments: msg.attachments,
      });
    } catch (err: any) {
      this.logger.error(`SMTP send failed: ${err?.message ?? err}`);
      throw new ServiceUnavailableException(`Email could not be sent: ${err?.message ?? 'SMTP error'}`);
    }
  }
}
