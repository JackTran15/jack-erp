import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Actor, ActorContext } from '../../common/decorators/actor-context.decorator';
import { RequireBranchScope, RequirePermission } from '../auth/decorators';
import { AuditInterceptor } from '../crud/audit.interceptor';
import { BranchScopeGuard } from '../rbac/branch-scope.guard';
import { PermissionGuard } from '../rbac/permission.guard';
import { CancelSalesOrderDto } from './dto/cancel-sales-order.dto';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { RejectSalesOrderDto } from './dto/reject-sales-order.dto';
import { SalesOrderListQueryDto } from './dto/sales-order-list.query.dto';
import { SalesOrderPointsDto } from './dto/sales-order-points.dto';
import { SalespeopleQueryDto } from './dto/salespeople.query.dto';
import { SALES_ORDER_PERMISSIONS, SalesOrderService } from './sales-order.service';

/**
 * Đơn hàng tư vấn → thu ngân, chỉ dùng từ app mobile.
 *
 * `@RequireBranchScope()` là bắt buộc: thiếu nó `@Actor()` âm thầm rơi về
 * `branchIds[0]`, và một tư vấn được phân hai cửa hàng sẽ ghi đơn vào nhầm chi
 * nhánh mà không có lỗi nào.
 */
@ApiTags('mobile')
@Controller('mobile/sales-orders')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class SalesOrderController {
  constructor(private readonly service: SalesOrderService) {}

  @Get()
  @RequirePermission(SALES_ORDER_PERMISSIONS.read)
  list(@Query() query: SalesOrderListQueryDto, @Actor() actor: ActorContext) {
    return this.service.list(query, actor);
  }

  /** Khai TRƯỚC `:id` — không thì `salespeople` bị `ParseUUIDPipe` của route kia bắt. */
  @Get('salespeople')
  @RequirePermission(SALES_ORDER_PERMISSIONS.create)
  salespeople(@Query() query: SalespeopleQueryDto, @Actor() actor: ActorContext) {
    return this.service.salespeople(query, actor);
  }

  @Get(':id')
  @RequirePermission(SALES_ORDER_PERMISSIONS.read)
  getById(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.getById(id, actor);
  }

  @Post()
  @RequirePermission(SALES_ORDER_PERMISSIONS.create)
  create(@Body() dto: CreateSalesOrderDto, @Actor() actor: ActorContext) {
    return this.service.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermission(SALES_ORDER_PERMISSIONS.create)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateSalesOrderDto, @Actor() actor: ActorContext) {
    return this.service.update(id, dto, actor);
  }

  /**
   * Sửa số điểm DỰ KIẾN — quyền của CẢ HAI vai.
   *
   * Mảng `@RequirePermission` nghĩa là HOẶC (tiền lệ: `promotion-v2.controller`).
   * Tư vấn ghi con số lúc lập đơn; thu ngân sửa nó khi *Nhận xử lý* bị chặn vì
   * số dư không còn đủ.
   */
  @Patch(':id/points')
  @RequirePermission([SALES_ORDER_PERMISSIONS.create, SALES_ORDER_PERMISSIONS.approve])
  setPoints(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SalesOrderPointsDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.setPoints(id, dto.points, actor);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(SALES_ORDER_PERMISSIONS.approve)
  approve(@Param('id', ParseUUIDPipe) id: string, @Actor() actor: ActorContext) {
    return this.service.approve(id, actor);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(SALES_ORDER_PERMISSIONS.reject)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectSalesOrderDto, @Actor() actor: ActorContext) {
    return this.service.reject(id, dto.reason, actor);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(SALES_ORDER_PERMISSIONS.cancel)
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelSalesOrderDto, @Actor() actor: ActorContext) {
    return this.service.cancel(id, dto.reason, actor);
  }
}
