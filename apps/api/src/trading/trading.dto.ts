import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBooleanString, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';

export class TradingDeskQueryDto {
  @ApiPropertyOptional({ description: 'Only this self firm' }) @IsOptional() @IsString() selfPartyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() productId?: string;
  @ApiPropertyOptional({ description: 'true to include purchases with nothing left in hand' })
  @IsOptional() @IsBooleanString() showSoldOut?: string;
}

/** The deal form's "Selling from" options (the Combobox also sends page/limit/search). */
export class SourceQueryDto extends PaginationQueryDto {
  @ApiProperty({ description: 'The self firm that is selling' }) @IsString() sellerPartyId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() productId?: string;
  @ApiPropertyOptional({ description: 'The sale being edited — its own qty is not counted' })
  @IsOptional() @IsString() excludeDealId?: string;
  @ApiPropertyOptional({ description: 'Keep this source listed even when fully sold (edit mode)' })
  @IsOptional() @IsString() currentSourceId?: string;
}
