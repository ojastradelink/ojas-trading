import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PartyType } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsBooleanString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class CreatePartyDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) code?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ enum: PartyType, default: PartyType.BOTH })
  @IsOptional()
  @IsEnum(PartyType)
  type?: PartyType;

  @ApiPropertyOptional({ description: 'Mark as our own firm (Self)' })
  @IsOptional()
  @IsBoolean()
  isSelf?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() contactPerson?: string;
  @ApiPropertyOptional({ type: [String], description: 'Contact numbers' })
  @IsOptional() @IsArray() @IsString({ each: true }) phones?: string[];
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional({ description: 'City / Region' }) @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gstin?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdatePartyDto extends PartialType(CreatePartyDto) {}

export class PartyQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: PartyType })
  @IsOptional()
  @IsEnum(PartyType)
  type?: PartyType;

  @ApiPropertyOptional({ description: 'true to list only self firms' })
  @IsOptional()
  @IsBooleanString()
  isSelf?: string;
}
