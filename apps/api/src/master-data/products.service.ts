import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import {
  buildPageMeta,
  PaginationQueryDto,
} from '../common/dto/pagination.dto';
import { RequestUser } from '../common/types/request-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';

export interface Ctx {
  ipAddress?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(user: RequestUser, q: PaginationQueryDto) {
    const where: Prisma.ProductWhereInput = {
      companyId: user.companyId,
      deletedAt: null,
    };
    if (q.search) {
      where.OR = [
        { code: { contains: q.search, mode: 'insensitive' } },
        { name: { contains: q.search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        orderBy: q.sortBy ? { [q.sortBy]: q.sortDir } : { code: 'asc' },
        skip: q.skip,
        take: q.limit,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items, meta: buildPageMeta(total, q.page, q.limit) };
  }

  async get(user: RequestUser, id: string) {
    const row = await this.prisma.product.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
    });
    if (!row) throw new NotFoundException('Product not found');
    return row;
  }

  async create(user: RequestUser, dto: CreateProductDto, ctx: Ctx) {
    const row = await this.prisma.product.create({
      data: {
        companyId: user.companyId,
        code: dto.code,
        name: dto.name,
        unit: dto.unit ?? 'MT',
        brokerage: dto.brokerage ?? 0,
        isDegum: dto.isDegum ?? false,
        notes: dto.notes,
      },
    });
    await this.audit.record({
      companyId: user.companyId,
      actorId: user.id,
      action: 'CREATE',
      entityType: 'Product',
      entityId: row.id,
      summary: `Created product ${row.code} — ${row.name}`,
      ...ctx,
    });
    return row;
  }

  async update(user: RequestUser, id: string, dto: UpdateProductDto, ctx: Ctx) {
    const before = await this.get(user, id);
    const row = await this.prisma.product.update({ where: { id }, data: { ...dto } });
    await this.audit.record({
      companyId: user.companyId,
      actorId: user.id,
      action: 'UPDATE',
      entityType: 'Product',
      entityId: id,
      summary: `Updated product ${row.code}`,
      diff: AuditService.diff(before, row),
      ...ctx,
    });
    return row;
  }

  async remove(user: RequestUser, id: string, ctx: Ctx) {
    await this.get(user, id);
    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.record({
      companyId: user.companyId,
      actorId: user.id,
      action: 'DELETE',
      entityType: 'Product',
      entityId: id,
      summary: `Soft-deleted product`,
      ...ctx,
    });
    return { deleted: true };
  }
}
