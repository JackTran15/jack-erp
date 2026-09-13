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
import { MobileInvoiceListQueryDto } from '../dto/mobile-invoice-list.query.dto';
import { MobileInvoicePageDto } from '../dto/mobile-invoice.response.dto';
import { MobileCustomerService } from '../services/mobile-customer.service';
import { MobileInvoiceService } from '../services/mobile-invoice.service';
import { toListQuery } from './mobile-invoice.controller';

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
    private readonly invoices: MobileInvoiceService,
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
   * Lịch sử mua hàng của MỘT khách — cùng service/DTO với `GET /mobile/invoices`,
   * chỉ khoá thêm `customer_id`. Nằm dưới tài nguyên khách hàng vì app mở nó
   * từ màn chi tiết khách, và quyền là quyền ĐỌC HOÁ ĐƠN chứ không phải đọc
   * khách: người thấy được khách chưa chắc được xem họ mua gì.
   */
  @Get(':id/invoices')
  @RequirePermission('pos.invoice.read')
  @ApiOperation({ summary: 'Lịch sử mua hàng của một khách, phân trang' })
  invoicesOf(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MobileInvoiceListQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileInvoicePageDto> {
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
