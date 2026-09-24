import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
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
  ApiOkResponse,
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
import { SalesOrderHistoryResponseDto } from '../dto/sales-order-history.dto';
import { StockCheckDto, StockCheckResponseDto } from '../dto/stock-check.dto';
import {
  BRANCH_ID_FILTER_PATTERN,
  UNASSIGNED_BRANCH_FILTER,
} from '../dto/sales-order-list.query.dto';
import { SalesOrderStatus } from '../entities/sales-order.entity';
import {
  AdminSalesOrderLineView,
  AdminSalesOrderView,
  OrgSalesOrderView,
  SALES_ORDER_PERMISSIONS,
  SalesOrderService,
} from '../sales-order.service';
import { SalesOrderHistoryService } from '../sales-order-history.service';
import { StockAvailabilityService } from '../stock-availability.service';

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
   * `true` = chỉ đơn ĐÃ duyệt (`confirmed_at IS NOT NULL`), `false` = chỉ đơn
   * CHƯA duyệt. Bỏ trống = không lọc.
   */
  @ApiPropertyOptional({ description: 'Lọc theo trạng thái duyệt: true = Đã duyệt, false = Chờ duyệt' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  confirmed?: boolean;

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
 * Hình dạng trả về của đường `/admin/sales-orders` — CHỈ để OpenAPI mô tả đúng
 * (service trả interface, không trả instance). `implements` giữ lớp này khớp
 * với {@link AdminSalesOrderView}: thêm trường ở service mà quên ở đây là lỗi
 * biên dịch. `/mobile/sales-orders` không dùng lớp nào ở đây (ADR-07).
 */
export class AdminSalesOrderLineResponseDto implements AdminSalesOrderLineView {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) itemId: string;
  @ApiProperty() code: string;
  @ApiProperty() name: string;
  @ApiProperty() unit: string;
  @ApiProperty() quantity: number;
  @ApiProperty() unitPrice: number;
  @ApiProperty() manualDiscount: number;
  @ApiProperty({ type: String, nullable: true }) manualDiscountReason: string | null;
  @ApiProperty() promotionDiscount: number;
  @ApiProperty({ type: String, nullable: true }) promotionName: string | null;
  @ApiProperty({ type: String, nullable: true }) note: string | null;
  @ApiProperty() lineTotal: number;
  @ApiProperty({ type: String, nullable: true }) thumbnailUrl: string | null;

  @ApiProperty({
    type: Number,
    nullable: true,
    description:
      'Tồn toàn chuỗi của mặt hàng CHỤP lúc nhận đơn (ADR-10); `null` với đơn không qua đường đối tác hoặc đơn cũ.',
  })
  chainStockAtIntake: number | null;
}

export class AdminSalesOrderResponseDto implements AdminSalesOrderView {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() code: string;
  @ApiProperty({ enum: SalesOrderStatus }) status: SalesOrderStatus;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt: Date;
  @ApiProperty({ type: String, nullable: true }) salespersonId: string | null;
  @ApiProperty({ type: String, nullable: true }) salespersonName: string | null;
  @ApiProperty() salesChannel: string;
  @ApiProperty({ type: String, nullable: true }) customerId: string | null;
  @ApiProperty({ type: String, nullable: true }) customerName: string | null;
  @ApiProperty({ type: String, nullable: true }) customerPhone: string | null;
  @ApiProperty() subtotal: number;
  @ApiProperty() discount: number;
  @ApiProperty() amountDue: number;
  @ApiProperty() shippingFee: number;
  @ApiProperty({ type: String, nullable: true }) recipientName: string | null;
  @ApiProperty({ type: String, nullable: true }) recipientPhone: string | null;
  @ApiProperty({ type: String, nullable: true }) shipProvinceName: string | null;
  @ApiProperty({ type: String, nullable: true }) shipWardName: string | null;
  @ApiProperty({ type: String, nullable: true }) shipAddressLine: string | null;
  @ApiProperty({ type: String, nullable: true }) externalOrderId: string | null;
  @ApiProperty({ type: String, nullable: true }) salesChannelId: string | null;
  @ApiProperty({ type: String, nullable: true }) note: string | null;
  @ApiProperty({ type: String, nullable: true }) rejectReason: string | null;
  @ApiProperty({ type: String, nullable: true }) cancelReason: string | null;
  @ApiProperty() pointsRedeemed: number;
  @ApiProperty({ type: [String] }) selectedProgramIds: string[];
  @ApiProperty({ type: [String] }) excludedProgramIds: string[];
  @ApiProperty({ type: String, nullable: true }) invoiceId: string | null;
  @ApiProperty({ type: String, nullable: true }) invoiceCode: string | null;
  @ApiProperty({ type: Boolean, nullable: true }) invoiceIsDraft: boolean | null;

  @ApiProperty({
    description:
      'Nhãn "Thiếu hàng": tồn toàn chuỗi lúc nhận đơn không đủ cho ít nhất một mặt hàng (ADR-10). ' +
      'Snapshot — không tính lại khi tồn đổi (A-35).',
  })
  stockShort: boolean;

  @ApiProperty({
    type: String,
    format: 'date-time',
    nullable: true,
    description: 'Lúc chi nhánh duyệt đơn (ADR-12); `null` = "Chờ duyệt". Trả về pool xoá duyệt.',
  })
  confirmedAt: Date | null;

  @ApiProperty({ type: [AdminSalesOrderLineResponseDto] })
  lines: AdminSalesOrderLineResponseDto[];
}

export class OrgSalesOrderResponseDto extends AdminSalesOrderResponseDto implements OrgSalesOrderView {
  @ApiProperty({ type: String, nullable: true, description: '`null` = đơn còn trong pool' })
  branchId: string | null;

  @ApiProperty({ type: String, nullable: true })
  branchName: string | null;
}

export class AdminSalesOrderListResponseDto {
  @ApiProperty({ type: [OrgSalesOrderResponseDto] }) data: OrgSalesOrderResponseDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
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
   * Tiêm theo thuộc tính, không qua constructor: giữ nguyên chữ ký
   * `new AdminSalesOrderController(service)` mà các spec quyền đang dựng.
   */
  @Inject(StockAvailabilityService)
  private readonly stockAvailability: StockAvailabilityService;

  @Inject(SalesOrderHistoryService)
  private readonly history: SalesOrderHistoryService;

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
  @ApiOkResponse({ type: AdminSalesOrderListResponseDto })
  list(@Query() query: AdminSalesOrderListQueryDto, @Actor() actor: ActorContext) {
    return this.service.listForOrganization(query, actor);
  }

  /**
   * Lịch sử xử lý của MỘT đơn bất kỳ trong tổ chức (ADR-14): cùng cặp quyền
   * OR với lưới `GET /`, không thu hẹp theo chi nhánh.
   */
  @Get(':id/history')
  @RequirePermission([SALES_ORDER_PERMISSIONS.dispatch, SALES_ORDER_PERMISSIONS.readAll])
  @ApiOperation({ summary: 'Dòng thời gian xử lý của một đơn' })
  @ApiOkResponse({ type: SalesOrderHistoryResponseDto })
  historyOf(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ): Promise<SalesOrderHistoryResponseDto> {
    return this.history.timeline(id, actor.organizationId);
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
  @ApiOkResponse({ type: AdminSalesOrderResponseDto })
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
  @ApiOkResponse({ type: AdminSalesOrderResponseDto })
  returnToPool(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReturnSalesOrderDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.returnToPool(id, dto.reason, actor);
  }

  /**
   * Đối chiếu tồn sống cho nhiều đơn (ADR-09) — cho Validate (chi nhánh của
   * từng đơn). Dialog duyệt đã sang `POST /mobile/sales-orders/stock-check`
   * (ADR-12). POST vì body là danh sách; nó KHÔNG ghi gì.
   */
  @Post('stock-check')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(SALES_ORDER_PERMISSIONS.dispatch)
  @ApiOperation({
    summary: 'Đối chiếu đủ/thiếu tồn cho nhiều đơn',
    description:
      '`branchId` vắng = tồn toàn chuỗi, có = tồn tại chi nhánh đó. Đơn trả về đã ' +
      'xếp đủ → thiếu (`shortLineCount` tăng dần, rồi mã đơn); trong đơn dòng đủ ' +
      'trước dòng thiếu. Đơn ngoài tổ chức bị bỏ qua, không báo lỗi. Tối đa 100 đơn.',
  })
  @ApiOkResponse({ type: StockCheckResponseDto })
  async stockCheck(@Body() dto: StockCheckDto, @Actor() actor: ActorContext): Promise<StockCheckResponseDto> {
    return { orders: await this.stockAvailability.checkOrders(actor.organizationId, dto.orders) };
  }
}
