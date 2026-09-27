import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  buildPageMeta,
  PaginationQueryDto,
} from '../common/dto/pagination.dto';
import { RequestUser } from '../common/types/request-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePartyDto, UpdatePartyDto } from './dto/party.dto';

/** Trim, drop blanks and de-duplicate a phone list. */
const cleanPhones = (phones?: string[]) => [...new Set((phones ?? []).map((p) => p.trim()).filter(Boolean))];

export interface Ctx {
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class PartiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: RequestUser, q: PaginationQueryDto, type?: string, isSelf?: string) {
    const where: Prisma.PartyWhereInput = {
      companyId: user.companyId,
      deletedAt: null,
    };
    if (type) where.type = type as any;
    if (isSelf === 'true') where.isSelf = true;
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: 'insensitive' } },
        { code: { contains: q.search, mode: 'insensitive' } },
        { city: { contains: q.search, mode: 'insensitive' } },
        { phones: { has: q.search.trim() } },
        { gstin: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.party.findMany({
        where,
        orderBy: q.sortBy ? { [q.sortBy]: q.sortDir } : { name: 'asc' },
        skip: q.skip,
        take: q.limit,
      }),
      this.prisma.party.count({ where }),
    ]);
    return { items, meta: buildPageMeta(total, q.page, q.limit) };
  }

  async get(user: RequestUser, id: string) {
    const row = await this.prisma.party.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
    });
    if (!row) throw new NotFoundException('Party not found');
    return row;
  }

  async create(user: RequestUser, dto: CreatePartyDto, ctx: Ctx) {
    const row = await this.prisma.party.create({
      data: {
        companyId: user.companyId,
        code: dto.code,
        name: dto.name,
        type: dto.type ?? 'BOTH',
        isSelf: dto.isSelf ?? false,
        contactPerson: dto.contactPerson,
        phones: cleanPhones(dto.phones),
        email: dto.email,
        address: dto.address,
        city: dto.city,
        gstin: dto.gstin,
        notes: dto.notes,
      },
    });
    await this.audit.record({
      companyId: user.companyId,
      actorId: user.id,
      action: 'CREATE',
      entityType: 'Party',
      entityId: row.id,
      summary: `Created ${dto.isSelf ? 'self firm' : 'party'} ${row.name}`,
      ...ctx,
    });
    return this.get(user, row.id);
  }

  async update(user: RequestUser, id: string, dto: UpdatePartyDto, ctx: Ctx) {
    const before = await this.get(user, id);
    const row = await this.prisma.party.update({
      where: { id },
      data: { ...dto, phones: dto.phones ? cleanPhones(dto.phones) : undefined },
    });
    await this.audit.record({
      companyId: user.companyId,
      actorId: user.id,
      action: 'UPDATE',
      entityType: 'Party',
      entityId: id,
      summary: `Updated party ${row.name}`,
      diff: AuditService.diff(before, row),
      ...ctx,
    });
    return this.get(user, id);
  }

  async remove(user: RequestUser, id: string, ctx: Ctx) {
    await this.get(user, id);
    await this.prisma.party.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({
      companyId: user.companyId,
      actorId: user.id,
      action: 'DELETE',
      entityType: 'Party',
      entityId: id,
      summary: 'Soft-deleted party',
      ...ctx,
    });
    return { deleted: true };
  }
}
