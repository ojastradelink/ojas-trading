import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequestUser } from '../common/types/request-user';
import { DealService } from './deals.service';
import { buildDealWorkbook } from './deals-io';
import { CreateDealDto, DealQueryDto, UpdateDealDto } from './dto/deals.dto';

function ctx(req: Request) {
  return {
    ipAddress: (req.headers['x-forwarded-for'] as string) ?? req.ip,
    userAgent: req.headers['user-agent'],
  };
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function sendWorkbook(res: Response, buf: Buffer, filename: string) {
  res.set({
    'Content-Type': XLSX_MIME,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': String(buf.length),
  });
  res.end(buf);
}

@ApiTags('Deals')
@ApiBearerAuth()
@Controller('deals')
export class DealController {
  constructor(private readonly svc: DealService) {}
  @Get() @RequirePermissions('deal:read')
  list(@CurrentUser() u: RequestUser, @Query() q: DealQueryDto) { return this.svc.list(u, q); }

  @Get('export') @RequirePermissions('deal:read')
  async export(@CurrentUser() u: RequestUser, @Query() q: DealQueryDto, @Res() res: Response) {
    const rows = await this.svc.exportAll(u, q);
    sendWorkbook(res, buildDealWorkbook(rows), 'deals.xlsx');
  }

  @Post('import') @RequirePermissions('deal:create')
  @UseInterceptors(FileInterceptor('file'))
  import(@CurrentUser() u: RequestUser, @UploadedFile() file: any, @Req() r: Request) {
    return this.svc.importFile(u, file?.buffer, ctx(r));
  }

  @Get(':id') @RequirePermissions('deal:read')
  get(@Param('id') id: string, @CurrentUser() u: RequestUser) { return this.svc.get(u, id); }
  @Post() @RequirePermissions('deal:create')
  create(@CurrentUser() u: RequestUser, @Body() dto: CreateDealDto, @Req() r: Request) { return this.svc.create(u, dto, ctx(r)); }
  @Patch(':id') @RequirePermissions('deal:update')
  update(@Param('id') id: string, @CurrentUser() u: RequestUser, @Body() dto: UpdateDealDto, @Req() r: Request) { return this.svc.update(u, id, dto, ctx(r)); }
  @Delete(':id') @RequirePermissions('deal:delete')
  remove(@Param('id') id: string, @CurrentUser() u: RequestUser, @Req() r: Request) { return this.svc.remove(u, id, ctx(r)); }
}
