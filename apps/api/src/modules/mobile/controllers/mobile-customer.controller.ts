import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import {
  MobileCustomerListQueryDto,
  MobileCustomerOrder,
  MobileCustomerSort,
} from '../dto/mobile-customer-list.query.dto';
import {
  MobileCustomerCreateDto,
  MobileCustomerUpdateDto,
} from '../dto/mobile-customer-write.dto';
import {
  MobileCustomerPageDto,
  MobileCustomerResponseDto,
} from '../dto/mobile-customer.response.dto';
import { MobileManagerInvoiceListQueryDto } from '../dto/mobile-manager-invoice-list.query.dto';
import { MobileManagerInvoicePageDto } from '../dto/mobile-manager-invoice.response.dto';
import { CustomerSummaryService } from '../../customer/services/customer-summary.service';
import { MobileCustomerService } from '../services/mobile-customer.service';
import { MobileManagerInvoiceService } from '../services/mobile-manager-invoice.service';
import { toListQuery } from './mobile-manager-invoice.controller';

/**
 * Danh mục khách hàng cho app mobile: đọc danh sách/chi tiết, tạo, sửa, xoá.
 *
 * KHÔNG có `BranchScopeGuard`, khác `CustomerController` của web: khách hàng
 * scope theo tổ chức, lý do đầy đủ ở `MobileCustomerService`.
 */
@ApiTags('mobile')
@Controller('mobile/customers')
@UseGuards(PermissionGuard)
export class MobileCustomerController {
  constructor(
    private readonly customers: MobileCustomerService,
    private readonly invoices: MobileManagerInvoiceService,
    private readonly summaries: CustomerSummaryService,
  ) {}

  @Get()
  @RequirePermission('customer.read')
  @ApiOperation({ summary: 'Danh sách khách hàng kèm doanh thu, phân trang' })
  list(
    @Query() query: MobileCustomerListQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileCustomerPageDto> {
    return this.customers.list(
      {
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        sort: query.sort ?? MobileCustomerSort.NAME,
        order: query.order ?? MobileCustomerOrder.ASC,
        status: query.status,
        search: query.search,
      },
      actor,
    );
  }

  @Post()
  @RequirePermission('customer.write')
  @ApiOperation({ summary: 'Tạo khách hàng; để trống mã thì hệ thống tự cấp' })
  create(
    @Body() dto: MobileCustomerCreateDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileCustomerResponseDto> {
    return this.customers.create(dto, actor);
  }

  /**
   * `ParseUUIDPipe` KHÔNG phải trang trí: thiếu nó thì một path segment không
   * phải uuid đi thẳng xuống Postgres và ném `22P02` — người dùng nhận 500 cho
   * một đầu vào lẽ ra là 400.
   */
  @Get(':id')
  @RequirePermission('customer.read')
  @ApiOperation({ summary: 'Chi tiết một khách hàng theo id' })
  findById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ): Promise<MobileCustomerResponseDto> {
    return this.customers.findById(id, actor);
  }

  /**
   * Tổng quan một khách: chi tiêu, công nợ, và THẺ THÀNH VIÊN (hạng + số dư điểm).
   *
   * Uỷ quyền thẳng `CustomerSummaryService` — cùng service mà web gọi ở
   * `GET /customers/:id/summary`, **không dựng DTO thứ hai**. Ba con số màn
   * *Sử dụng điểm* cần (hạng thẻ, doanh thu, điểm tích luỹ) đã nằm trọn trong
   * hình dạng nó trả về.
   *
   * Vì sao vẫn cần một đường ở đây thay vì để app gọi đường của web: MỌI đường
   * trong `ApiEndpoints` phía Dart đều dưới `/mobile` (đếm được 47/47), và bề
   * mặt đó là thứ giữ cho app không phụ thuộc vào route của web.
   *
   * `membership` là `null` khi khách chưa có thẻ — ca hợp lệ, KHÔNG phải 0 điểm.
   */
  @Get(':id/summary')
  @RequirePermission('customer.read')
  @ApiOperation({ summary: 'Tổng quan một khách: chi tiêu, công nợ, thẻ thành viên' })
  summaryOf(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.summaries.getSummary(id, actor);
  }

  /**
   * Lịch sử mua hàng của MỘT khách — cùng service/DTO với `GET /mobile/manager/invoices`,
   * chỉ khoá thêm `customer_id`. Nằm dưới tài nguyên khách hàng vì app mở nó
   * từ màn chi tiết khách, và quyền là quyền ĐỌC HOÁ ĐƠN chứ không phải đọc
   * khách: người thấy được khách chưa chắc được xem họ mua gì.
   */
  @Get(':id/invoices')
  @RequirePermission('pos.invoice.read')
  @ApiOperation({ summary: 'Lịch sử mua hàng của một khách, phân trang' })
  invoicesOf(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MobileManagerInvoiceListQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileManagerInvoicePageDto> {
    return this.invoices.list({ ...toListQuery(query), customerId: id }, actor);
  }

  @Patch(':id')
  @RequirePermission('customer.write')
  @ApiOperation({ summary: 'Sửa một phần khách hàng theo id' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MobileCustomerUpdateDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileCustomerResponseDto> {
    return this.customers.update(id, dto, actor);
  }

  /** Xoá CỨNG — hệ quả và lý do ở `MobileCustomerService.remove`. */
  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('customer.write')
  @ApiOperation({ summary: 'Xoá khách hàng; 409 khi còn công nợ/tín dụng' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ): Promise<void> {
    return this.customers.remove(id, actor);
  }
}
