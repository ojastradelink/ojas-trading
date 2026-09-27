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
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';
import { RequestUser } from '../common/types/request-user';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { ProductsService } from './products.service';

@ApiTags('Master Data — Products')
@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  private ctx(req: Request) {
    return {
      ipAddress: (req.headers['x-forwarded-for'] as string) ?? req.ip,
      userAgent: req.headers['user-agent'],
    };
  }

  @Get()
  @RequirePermissions('product:read')
  list(@CurrentUser() user: RequestUser, @Query() q: PaginationQueryDto) {
    return this.products.list(user, q);
  }

  @Get(':id')
  @RequirePermissions('product:read')
  get(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.products.get(user, id);
  }

  @Post()
  @RequirePermissions('product:create')
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateProductDto,
    @Req() req: Request,
  ) {
    return this.products.create(user, dto, this.ctx(req));
  }

  @Patch(':id')
  @RequirePermissions('product:update')
  update(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateProductDto,
    @Req() req: Request,
  ) {
    return this.products.update(user, id, dto, this.ctx(req));
  }

  @Delete(':id')
  @RequirePermissions('product:delete')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.products.remove(user, id, this.ctx(req));
  }
}
