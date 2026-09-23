import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiPropertyOptional,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsISO8601, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { AuditInterceptor } from '../../crud/audit.interceptor';
import { PermissionGuard } from '../../rbac/permission.guard';
import { ReturnSalesOrderDto } from '../dto/return-sales-order.dto';
import {
  BRANCH_ID_FILTER_PATTERN,
  UNASSIGNED_BRANCH_FILTER,
} from '../dto/sales-order-list.query.dto';
import { SalesOrderStatus } from '../entities/sales-order.entity';
import { SALES_ORDER_PERMISSIONS, SalesOrderService } from '../sales-order.service';

/**
 * Trạng thái mà đường đọc cấp tổ chức CHO PHÉP lọc.
 *
 * `DRAFT` cố ý vắng mặt: đơn lưu tạm là giỏ riêng của người gửi, và không có
 * phạm vi nào — kể cả toàn chuỗi — làm nó hiện ra. Xin `status=DRAFT` ở đây là
 * 400, không phải một trang rỗng khó hiểu.
 */
const ORG_VISIBLE_STATUSES = {
  SENT: SalesOrderStatus.SENT,
  PROCESSED: SalesOrderStatus.PROCESSED,
  REJECTED: SalesOrderStatus.REJECTED,
  CANCELLED: SalesOrderStatus.CANCELLED,
} as const;

/**
 * Bộ lọc của lưới Admin: đúng bộ khoá của lưới chi nhánh, cộng `unassigned`.
 *
 * KHÔNG `extends SalesOrderListQueryDto`, dù bốn trường đầu trùng: lớp con chỉ
 * SIẾT được `status` bằng cách khai lại nó, và một trường khai lại thì không
 * mang được decorator (TS2612 / `declare`). Thà chép bốn trường còn hơn để
 * `status=DRAFT` lọt qua validate rồi trả về một trang rỗng khó hiểu.
 * `forbidNonWhitelisted` vẫn chặn mọi khoá lạ, như mọi DTO khác.
 */
export class AdminSalesOrderListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ enum: ORG_VISIBLE_STATUSES })
  @IsOptional()
  @IsEnum(ORG_VISIBLE_STATUSES)
  status?: Exclude<SalesOrderStatus, SalesOrderStatus.DRAFT>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  from?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  to?: string;

  /**
   * `true` = chỉ POOL chưa phân (`branch_id IS NULL`), tức màn Điều phối.
   * Bỏ trống = toàn chuỗi, và khi đó route đòi thêm `pos.sales-order.read-all`.
   */
  @ApiPropertyOptional({ description: 'Chỉ lấy đơn chưa phân chi nhánh' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  unassigned?: boolean;

  /**
   * Lọc theo chi nhánh đang giữ đơn: uuid, hoặc `UNASSIGNED` cho pool.
   *
   * Không nhận chuỗi rỗng — xem {@link UNASSIGNED_BRANCH_FILTER}. Bỏ trống mới
   * là "không lọc", và khi đó route vẫn đòi `read-all` như mọi lượt toàn chuỗi:
   * lọc về một chi nhánh KHÔNG phải cách để người chỉ có `dispatch` đọc lén đơn
   * của chi nhánh khác.
   */
  @ApiPropertyOptional({
    description: `uuid chi nhánh, hoặc \`${UNASSIGNED_BRANCH_FILTER}\` cho đơn chưa phân`,
  })
  @IsOptional()
  @Matches(BRANCH_ID_FILTER_PATTERN, {
    message: `branchId phải là uuid hoặc '${UNASSIGNED_BRANCH_FILTER}'`,
  })
  branchId?: string;
}

export class DispatchSalesOrderDto {
  /** Chi nhánh nhận đơn — phải thuộc tổ chức của người bấm. */
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  branchId: string;
}

/**
 * Đường đọc + điều phối CẤP TỔ CHỨC.
 *
 * KHÔNG `BranchScopeGuard`, và đó là cả điểm của controller này (ADR-07):
 * `/mobile/sales-orders` dùng guard ấy cộng một hard-filter theo chi nhánh, app
 * tư vấn viên dựa vào đúng ràng buộc đó, nên nới nó ra là rò đơn giữa các chi
 * nhánh (A-09). Controller cũ không đổi một dòng nào.
 *
 * Đổi lại, mọi route ở đây PHẢI có `@RequirePermission` — không có guard chi
 * nhánh nào đỡ phía sau. Ca 403 ở bước 8 của demo là ca kiểm bắt buộc.
 *
 * `AuthGuard` không liệt kê vì nó đã là `APP_GUARD` toàn cục
 * (`common.module.ts`); khai lại là xác thực token hai lần cho mỗi request.
 */
@ApiTags('admin')
@Controller('admin/sales-orders')
@UseInterceptors(AuditInterceptor)
@UseGuards(PermissionGuard)
export class AdminSalesOrderController {
  constructor(private readonly service: SalesOrderService) {}

  /**
   * Hai phạm vi trên MỘT route, vì chúng là cùng một lưới với một bộ lọc khác.
   *
   * Guard đòi `dispatch` HOẶC `read-all` (mảng = OR, xem `PermissionGuard`);
   * việc "chỉ `dispatch` thì chỉ được xem pool" do
   * {@link SalesOrderService.listForOrganization} ép, vì quyền cần có phụ thuộc
   * một tham số query mà decorator không đọc được.
   */
  @Get()
  @RequirePermission([SALES_ORDER_PERMISSIONS.dispatch, SALES_ORDER_PERMISSIONS.readAll])
  @ApiOperation({
    summary: 'Đơn toàn chuỗi; `unassigned=true` là pool chưa phân',
    description:
      '`unassigned=true` đòi `pos.sales-order.dispatch`. Không `unassigned` ' +
      'đòi `pos.sales-order.read-all` — thiếu nó là 403, không phải một trang rỗng. ' +
      'Mỗi dòng mang kèm `branchId` + `branchName` của chi nhánh đang giữ đơn ' +
      '(`null` cả hai khi đơn còn trong pool); lọc bằng `branchId`.',
  })
  list(@Query() query: AdminSalesOrderListQueryDto, @Actor() actor: ActorContext) {
    return this.service.listForOrganization(query, actor);
  }

  @Post(':id/dispatch')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(SALES_ORDER_PERMISSIONS.dispatch)
  @ApiOperation({
    summary: 'Phân đơn về một chi nhánh',
    description:
      'Chỉ set `branch_id`; trạng thái giữ nguyên `SENT` và KHÔNG có hoá đơn ' +
      'nháp nào sinh ra. Không cần chi nhánh đang mở ca POS (ADR-02).',
  })
  @ApiConflictResponse({
    description:
      '`ORDER_NOT_DISPATCHABLE` (đơn không còn ở `SENT`) hoặc ' +
      '`ORDER_ALREADY_DISPATCHED` (đơn đã có chi nhánh)',
  })
  dispatch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DispatchSalesOrderDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.dispatch(id, dto.branchId, actor);
  }

  /**
   * Trả đơn về pool — đường NGƯỢC của `dispatch`, cùng controller vì cùng phạm
   * vi tổ chức.
   *
   * Quyền là mảng = OR: người điều phối (`dispatch`) trả về đơn của mọi chi
   * nhánh; thu ngân (`approve`) chỉ trả về được đơn CHI NHÁNH MÌNH đang giữ.
   * Phép thu hẹp ấy nằm ở {@link SalesOrderService.returnToPool}, không ở
   * decorator: nó phụ thuộc `branch_id` của chính đơn, thứ guard không đọc được.
   * Không có quyền mới nào ra đời ở đây — cả hai khoá đã được seed cấp.
   */
  @Post(':id/return')
  @HttpCode(HttpStatus.OK)
  @RequirePermission([SALES_ORDER_PERMISSIONS.dispatch, SALES_ORDER_PERMISSIONS.approve])
  @ApiOperation({
    summary: 'Trả đơn về pool chưa phân',
    description:
      'Đặt `branch_id = NULL` và ghi một dòng `RETURN` kèm lý do; trạng thái ' +
      'GIỮ NGUYÊN `SENT` — đơn vẫn chờ xử lý, chỉ là chưa ai giữ (A-05). ' +
      '`reason` bắt buộc.',
  })
  @ApiConflictResponse({
    description:
      '`ORDER_HAS_INVOICE` (đơn đã sinh hoá đơn), `ORDER_NOT_DISPATCHABLE` ' +
      '(đơn không còn ở `SENT`) hoặc `ORDER_NOT_DISPATCHED` (đơn đang ở pool)',
  })
  @ApiForbiddenResponse({ description: '`ORDER_NOT_HELD_BY_BRANCH` — đơn thuộc chi nhánh khác' })
  returnToPool(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReturnSalesOrderDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.returnToPool(id, dto.reason, actor);
  }
}
