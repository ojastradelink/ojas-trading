import { Body, Controller, Get, Param, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequestUser } from '../common/types/request-user';
import { DegumQueryDto, SaveDegumDetailDto } from './degum.dto';
import { DegumService } from './degum.service';

function ctx(req: Request) {
  return {
    ipAddress: (req.headers['x-forwarded-for'] as string) ?? req.ip,
    userAgent: req.headers['user-agent'],
  };
}

@ApiTags('Degum')
@ApiBearerAuth()
@Controller('degum')
export class DegumController {
  constructor(private readonly svc: DegumService) {}

  /** Deals on a degum material, each with its shipment details. */
  @Get() @RequirePermissions('degum:read')
  list(@CurrentUser() u: RequestUser, @Query() q: DegumQueryDto) { return this.svc.list(u, q); }

  @Get(':dealId') @RequirePermissions('degum:read')
  get(@Param('dealId') dealId: string, @CurrentUser() u: RequestUser) { return this.svc.get(u, dealId); }

  /** Save the shipment details of one deal (never changes the deal itself). */
  @Put(':dealId') @RequirePermissions('degum:update')
  save(@Param('dealId') dealId: string, @CurrentUser() u: RequestUser, @Body() dto: SaveDegumDetailDto, @Req() r: Request) {
    return this.svc.save(u, dealId, dto, ctx(r));
  }
}
