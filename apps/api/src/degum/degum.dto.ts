import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';

/** Payment is due this many days after the vessel's actual clearance. */
export const PAYMENT_DUE_MIN_DAYS = 5;
export const PAYMENT_DUE_MAX_DAYS = 15;

/**
 * Degum shipment details for one deal. Sent whole on every save: an omitted or
 * null field is stored empty. The deal's own fields are never accepted here.
 */
export class SaveDegumDetailDto {
  @ApiPropertyOptional() @IsOptional() @IsString() vesselName?: string | null;
  @ApiPropertyOptional({ description: 'Tentative arrival at port' })
  @IsOptional() @IsDateString() vesselEta?: string | null;
  @ApiPropertyOptional({ description: 'Actual vessel clearance date' })
  @IsOptional() @IsDateString() clearanceDate?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() tank?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() terminal?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() chain?: string | null;
  @ApiPropertyOptional({ description: 'Duty ₹/MT — added to the rate in the final-payment calculation' })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) duty?: number | null;
  @ApiPropertyOptional({ description: `Days after clearance (${PAYMENT_DUE_MIN_DAYS}–${PAYMENT_DUE_MAX_DAYS}) — the payment due date is calculated` })
  @IsOptional() @Type(() => Number) @IsInt() @Min(PAYMENT_DUE_MIN_DAYS) @Max(PAYMENT_DUE_MAX_DAYS) paymentDueDays?: number | null;
}

export class DegumQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() buyerPartyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sellerPartyId?: string;
  @ApiPropertyOptional({ description: 'Tentative arrival from (inclusive)' })
  @IsOptional() @IsDateString() etaFrom?: string;
  @ApiPropertyOptional({ description: 'Tentative arrival to (inclusive)' })
  @IsOptional() @IsDateString() etaTo?: string;
}
