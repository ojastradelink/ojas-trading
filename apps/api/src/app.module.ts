import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import configuration from './config/configuration';
import { DashboardModule } from './dashboard/dashboard.module';
import { DealsModule } from './deals/deals.module';
import { DegumModule } from './degum/degum.module';
import { TradingModule } from './trading/trading.module';
import { HealthController } from './health/health.controller';
import { MasterDataModule } from './master-data/master-data.module';
import { NumberingModule } from './numbering/numbering.module';
import { PrismaModule } from './prisma/prisma.module';
import { SettingsModule } from './settings/settings.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', '../.env', '../../.env'],
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    PrismaModule,
    NumberingModule,
    AuditModule,
    AuthModule,
    UsersModule,
    MasterDataModule,
    DealsModule,
    DegumModule,
    TradingModule,
    DashboardModule,
    SettingsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Order matters: authenticate -> rate-limit -> authorize
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
