import { Module } from '@nestjs/common';
import { DegumController } from './degum.controller';
import { DegumService } from './degum.service';

@Module({
  controllers: [DegumController],
  providers: [DegumService],
})
export class DegumModule {}
