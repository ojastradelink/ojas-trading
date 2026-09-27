import { Module } from '@nestjs/common';
import { DealController } from './deals.controller';
import { TradingModule } from '../trading/trading.module';
import { DealService } from './deals.service';

@Module({
  imports: [TradingModule],
  controllers: [DealController],
  providers: [DealService],
})
export class DealsModule {}
