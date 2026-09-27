import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequestUser } from '../common/types/request-user';
import { SourceQueryDto, TradingDeskQueryDto } from './trading.dto';
import { TradingDeskService } from './trading-desk.service';

@ApiTags('Trading Desk')
@ApiBearerAuth()
@Controller('trading-desk')
export class TradingDeskController {
  constructor(private readonly desk: TradingDeskService) {}

  /** Self-firm purchases (with qty in hand) and sales. */
  @Get() @RequirePermissions('deal:read')
  get(@CurrentUser() u: RequestUser, @Query() q: TradingDeskQueryDto) { return this.desk.desk(u, q); }

  /** Purchases a self firm can sell from. */
  @Get('sources') @RequirePermissions('deal:read')
  sources(@CurrentUser() u: RequestUser, @Query() q: SourceQueryDto) { return this.desk.sources(u, q); }
}
