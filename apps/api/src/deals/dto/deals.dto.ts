import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDateString,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

/** Payment terms offered for a deal's due date (days after the trade date). */
export const DUE_DAY_OPTIONS = [7, 10];

// ── Deal — one Buyer ↔ Seller trade we broker ───────────────────────────────
//   Buyer / Seller brokerage are ₹/MT. When left out on create they default to
//   half of the material's brokerage each. The due date is derived from dueDays.
export class CreateDealDto {
  @ApiPropertyOptional() @IsOptional() @IsDateString() date?: string;
  @ApiProperty() @IsString() buyerPartyId!: string;
  @ApiProperty() @IsString() sellerPartyId!: string;
  @ApiProperty({ description: 'Material (product)' }) @IsString() productId!: string;

  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) quantity!: number;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) rate!: number;

  @ApiPropertyOptional({ description: 'Buyer brokerage ₹/MT' })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) buyerBrokerage?: number;
  @ApiPropertyOptional({ description: 'Seller brokerage ₹/MT' })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) sellerBrokerage?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() port?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() paymentCondition?: string | null;
  @ApiPropertyOptional({ description: 'Lifting due date' }) @IsOptional() @IsDateString() liftingDate?: string | null;
  @ApiPropertyOptional({ example: 'October' }) @IsOptional() @IsString() shipmentMonth?: string | null;
  @ApiPropertyOptional({ description: 'Deposit ₹' })
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) deposit?: number | null;
  @ApiPropertyOptional({ enum: DUE_DAY_OPTIONS, description: 'Payment term in days — the due date is calculated from the trade date. null clears it.' })
  @IsOptional() @Type(() => Number) @IsIn(DUE_DAY_OPTIONS) dueDays?: number | null;
  @ApiPropertyOptional({ description: 'When our own firm sells: the purchase deal the quantity comes from' })
  @IsOptional() @IsString() sourceDealId?: string | null;
}
export class UpdateDealDto extends PartialType(CreateDealDto) {}

// ── list query (filters + sorting; sortBy/sortDir/search from PaginationQueryDto) ──
export class DealQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() productId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() buyerPartyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sellerPartyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() shipmentMonth?: string;
  @ApiPropertyOptional({ description: 'Deal date from (inclusive)' })
  @IsOptional() @IsDateString() dateFrom?: string;
  @ApiPropertyOptional({ description: 'Deal date to (inclusive)' })
  @IsOptional() @IsDateString() dateTo?: string;
}

// ── Email a contract note (multipart: PDF in `file` + these fields) ─────────
//   Address lists arrive from FormData as a comma-separated string (or repeated
//   fields); both normalise to a trimmed, de-duplicated array.
const emailList = ({ value }: { value: unknown }) => {
  const raw = (Array.isArray(value) ? value : [value]).flatMap((v) => String(v ?? '').split(/[,;\s]+/));
  return [...new Set(raw.map((v) => String(v).trim().toLowerCase()).filter(Boolean))];
};

export class EmailContractNoteDto {
  @ApiProperty({ type: [String] })
  @Transform(emailList) @ArrayMinSize(1, { message: 'Add at least one recipient.' }) @ArrayMaxSize(20)
  @IsEmail({}, { each: true, message: 'Every recipient must be a valid email address.' })
  to: string[] = []; // default so a missing field reports just "Add at least one recipient."

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @Transform(emailList) @ArrayMaxSize(20)
  @IsEmail({}, { each: true, message: 'Every CC must be a valid email address.' }) cc?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) subject?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(5000) message?: string;
}
