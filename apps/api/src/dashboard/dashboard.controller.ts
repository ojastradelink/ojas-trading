import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequestUser } from '../common/types/request-user';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** Everything the dashboard needs in a single request. */
  @Get('overview')
  @RequirePermissions('dashboard:read')
  overview(@CurrentUser() user: RequestUser) {
    return this.dashboard.overview(user.companyId);
  }

  @Get('summary')
  @RequirePermissions('dashboard:read')
  summary(@CurrentUser() user: RequestUser) {
    return this.dashboard.summary(user.companyId);
  }

  @Get('brokerage-by-material')
  @RequirePermissions('dashboard:read')
  brokerageByMaterial(@CurrentUser() user: RequestUser) {
    return this.dashboard.brokerageByMaterial(user.companyId);
  }

  @Get('monthly-brokerage')
  @RequirePermissions('dashboard:read')
  monthlyBrokerage(@CurrentUser() user: RequestUser) {
    return this.dashboard.monthlyBrokerage(user.companyId);
  }

  @Get('recent-deals')
  @RequirePermissions('dashboard:read')
  recentDeals(@CurrentUser() user: RequestUser) {
    return this.dashboard.recentDeals(user.companyId);
  }

  @Get('recent-activity')
  @RequirePermissions('dashboard:read')
  recent(@CurrentUser() user: RequestUser) {
    return this.dashboard.recentActivity(user.companyId);
  }
}
