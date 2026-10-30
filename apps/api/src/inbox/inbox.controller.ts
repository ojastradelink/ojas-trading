import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequestUser } from '../common/types/request-user';
import { Folder, FOLDERS } from './imap.service';
import { InboxQueryDto, SendMailDto } from './inbox.dto';
import { InboxService, UploadedMailFile } from './inbox.service';

function ctx(req: Request) {
  return {
    ipAddress: (req.headers['x-forwarded-for'] as string) ?? req.ip,
    userAgent: req.headers['user-agent'],
  };
}

function folderOf(v: string): Folder {
  if (!(FOLDERS as readonly string[]).includes(v)) throw new BadRequestException(`Unknown folder "${v}".`);
  return v as Folder;
}

const UPLOAD = FilesInterceptor('files', 10, { limits: { fileSize: 10 * 1024 * 1024 } });

@ApiTags('Mail')
@ApiBearerAuth()
@Controller('inbox')
export class InboxController {
  constructor(private readonly svc: InboxService) {}

  /** Whether the mailbox is set up, and its address. */
  @Get() @RequirePermissions('mail:read')
  status() { return this.svc.status(); }

  @Get('messages') @RequirePermissions('mail:read') @Header('Cache-Control', 'no-store')
  list(@CurrentUser() u: RequestUser, @Query() q: InboxQueryDto) { return this.svc.list(u, q); }

  @Get('messages/:folder/:uid') @RequirePermissions('mail:read') @Header('Cache-Control', 'no-store')
  get(@Param('folder') folder: string, @Param('uid', ParseIntPipe) uid: number, @CurrentUser() u: RequestUser) {
    return this.svc.get(u, folderOf(folder), uid);
  }

  /** Streams one attachment (bypasses the response envelope). */
  @Get('messages/:folder/:uid/attachments/:index') @RequirePermissions('mail:read')
  async attachment(
    @Param('folder') folder: string, @Param('uid', ParseIntPipe) uid: number,
    @Param('index', ParseIntPipe) index: number, @Res() res: Response,
  ) {
    const file = await this.svc.attachment(folderOf(folder), uid, index);
    const name = (file.filename || `attachment-${index + 1}`).replace(/["\r\n]/g, '');
    res.set({
      'Content-Type': file.contentType || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Content-Length': String(file.content.length),
      'Cache-Control': 'no-store',
    });
    res.end(file.content);
  }

  @Post('messages/:folder/:uid/reply') @RequirePermissions('mail:send') @UseInterceptors(UPLOAD)
  reply(
    @Param('folder') folder: string, @Param('uid', ParseIntPipe) uid: number, @CurrentUser() u: RequestUser,
    @Body() dto: SendMailDto, @UploadedFiles() files: UploadedMailFile[] | undefined, @Req() r: Request,
  ) {
    return this.svc.reply(u, folderOf(folder), uid, dto, files ?? [], ctx(r));
  }

  @Post('compose') @RequirePermissions('mail:send') @UseInterceptors(UPLOAD)
  compose(
    @CurrentUser() u: RequestUser, @Body() dto: SendMailDto,
    @UploadedFiles() files: UploadedMailFile[] | undefined, @Req() r: Request,
  ) {
    return this.svc.compose(u, dto, files ?? [], ctx(r));
  }
}
