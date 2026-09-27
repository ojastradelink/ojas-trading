import { Module } from '@nestjs/common';
import { StockService } from './stock.service';
import { TradingDeskController } from './trading.controller';
import { TradingDeskService } from './trading-desk.service';

@Module({
  controllers: [TradingDeskController],
  providers: [TradingDeskService, StockService],
  exports: [StockService],
})
export class TradingModule {}
