import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { emailList } from '../mail/email-list';
import { Folder, FOLDERS } from './imap.service';

export class InboxQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: FOLDERS, default: 'inbox' })
  @IsOptional() @IsIn(FOLDERS) folder: Folder = 'inbox';
}

// Reply / new email (multipart: files in `files` + these fields).
export class SendMailDto {
  @ApiProperty({ type: [String] })
  @Transform(emailList) @ArrayMinSize(1, { message: 'Add at least one recipient.' }) @ArrayMaxSize(20)
  @IsEmail({}, { each: true, message: 'Every recipient must be a valid email address.' })
  to: string[] = [];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @Transform(emailList) @ArrayMaxSize(20)
  @IsEmail({}, { each: true, message: 'Every CC must be a valid email address.' }) cc?: string[];

  @ApiPropertyOptional({ description: 'Required for a new email; a reply defaults to "Re: <original>"' })
  @IsOptional() @IsString() @MaxLength(200) subject?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20000) message?: string;
}
