import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { RequestUser } from '../common/types/request-user';
import { PrismaService } from '../prisma/prisma.service';
import {
  UpdateCompanyDto,
  UpdateNumberSequenceDto,
  UpsertSettingDto,
} from './dto/settings.dto';

export interface Ctx {
  ipAddress?: string | null;
  userAgent?: string | null;
}

// Document-numbering keys the platform uses (with sensible defaults).
const SEQUENCE_KEYS: { key: string; label: string; prefix: string }[] = [
  { key: 'DEAL', label: 'Deals', prefix: 'DL' },
];

// Generic JSON setting sections + their default shape.
export const SETTING_DEFAULTS: Record<string, Record<string, any>> = {
  tax: { defaultGstPct: 5, igstPct: 18, tdsPct: 0.1, tcsPct: 1, brokerageDefaultPerMt: 50 },
  templates: {
    paymentDue: {
      subject: 'Payment due — {dealNo}',
      body: 'Dear {party}, payment of ₹{amount} for {dealNo} is due on {dueDate}.',
    },
    deliveryDue: {
      subject: 'Delivery scheduled — {dealNo}',
      body: 'Dear {party}, delivery for {dealNo} ({material}) is due on {dueDate}.',
    },
  },
  branding: { displayName: 'Ojas Trading', primaryColor: '#1e293b', logoUrl: '' },
  notifications: { email: true, whatsapp: false, sms: false },
};

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async logChange(user: RequestUser, summary: string, ctx: Ctx, diff?: Record<string, unknown>) {
    await this.audit.record({
      companyId: user.companyId,
      actorId: user.id,
      action: 'SETTINGS_CHANGE',
      entityType: 'Setting',
      summary,
      diff,
      ...ctx,
    });
  }

  // ── Company ────────────────────────────────────────────────────────────────
  async getCompany(user: RequestUser) {
    const c = await this.prisma.company.findUnique({ where: { id: user.companyId } });
    if (!c) throw new NotFoundException('Company not found');
    return c;
  }

  async updateCompany(user: RequestUser, dto: UpdateCompanyDto, ctx: Ctx) {
    const before = await this.getCompany(user);
    const row = await this.prisma.company.update({ where: { id: user.companyId }, data: { ...dto } });
    await this.logChange(user, 'Updated company settings', ctx, AuditService.diff(before, row));
    return row;
  }

  // ── Document numbering ───────────────────────────────────────────────────────
  async listNumberSequences(user: RequestUser) {
    const existing = await this.prisma.numberSequence.findMany({
      where: { companyId: user.companyId },
    });
    const byKey = new Map(existing.map((s) => [s.key, s]));
    return SEQUENCE_KEYS.map((k) => {
      const s = byKey.get(k.key);
      return {
        key: k.key,
        label: k.label,
        prefix: s?.prefix ?? k.prefix,
        padding: s?.padding ?? 3,
        nextValue: s?.nextValue ?? 1,
        resetYearly: s?.resetYearly ?? false,
        yearLabel: s?.yearLabel ?? null,
        configured: !!s,
        // a live preview of the next number
        preview: `${s?.prefix ?? k.prefix}${s?.resetYearly ?? false ? '-' + (s?.yearLabel ?? 'YY-YY') : ''}-${String(s?.nextValue ?? 1).padStart(s?.padding ?? 3, '0')}`,
      };
    });
  }

  async updateNumberSequence(
    user: RequestUser,
    key: string,
    dto: UpdateNumberSequenceDto,
    ctx: Ctx,
  ) {
    const def = SEQUENCE_KEYS.find((k) => k.key === key);
    if (!def) throw new NotFoundException(`Unknown sequence "${key}"`);
    const row = await this.prisma.numberSequence.upsert({
      where: { companyId_key: { companyId: user.companyId, key } },
      update: { ...dto },
      create: {
        companyId: user.companyId,
        key,
        prefix: dto.prefix ?? def.prefix,
        padding: dto.padding ?? 3,
        nextValue: dto.nextValue ?? 1,
        resetYearly: dto.resetYearly ?? false,
      },
    });
    await this.logChange(user, `Updated numbering for ${def.label}`, ctx);
    return row;
  }

  // ── Generic JSON setting sections (tax / templates / branding / notifications) ─
  async getSetting(user: RequestUser, key: string) {
    const s = await this.prisma.setting.findUnique({
      where: { companyId_key: { companyId: user.companyId, key } },
    });
    return s?.value ?? SETTING_DEFAULTS[key] ?? {};
  }

  async getAllSettings(user: RequestUser) {
    const rows = await this.prisma.setting.findMany({ where: { companyId: user.companyId } });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    const out: Record<string, any> = {};
    for (const key of Object.keys(SETTING_DEFAULTS)) {
      out[key] = byKey.get(key) ?? SETTING_DEFAULTS[key];
    }
    return out;
  }

  async putSetting(user: RequestUser, key: string, dto: UpsertSettingDto, ctx: Ctx) {
    const s = await this.prisma.setting.upsert({
      where: { companyId_key: { companyId: user.companyId, key } },
      update: { value: dto.value as Prisma.InputJsonValue },
      create: { companyId: user.companyId, key, value: dto.value as Prisma.InputJsonValue },
    });
    await this.logChange(user, `Updated ${key} settings`, ctx);
    return s.value;
  }
}
