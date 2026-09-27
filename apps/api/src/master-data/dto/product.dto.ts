import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'CDSBO' })
  @IsString()
  @MaxLength(32)
  code!: string;

  @ApiProperty({ example: 'Crude Degummed SBO' })
  @IsString()
  @MaxLength(160)
  name!: string;

  @ApiPropertyOptional({ default: 'MT' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ description: 'Total brokerage ₹/MT — split equally between buyer & seller on a new deal' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  brokerage?: number;

  @ApiPropertyOptional({ description: 'Degum material — its deals are tracked in the Degum section' })
  @IsOptional()
  @IsBoolean()
  isDegum?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

