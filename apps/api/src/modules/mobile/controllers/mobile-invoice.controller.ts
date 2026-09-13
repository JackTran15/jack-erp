import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
  MobileInvoiceDateBasis,
  MobileInvoiceListQueryDto,
  MobileInvoiceOrder,
} from '../dto/mobile-invoice-list.query.dto';
import {
  MobileInvoiceDetailResponseDto,
  MobileInvoicePageDto,
} from '../dto/mobile-invoice.response.dto';
import { MobileInvoiceService } from '../services/mobile-invoice.service';

/**
 * Hoá đơn cho app mobile — tab Hoá đơn và màn chi tiết. CHỈ đọc: app không
 * lập hoá đơn (đó là việc của POS).
 *
 * Lịch sử mua của MỘT khách nằm ở `GET /mobile/customers/:id/invoices`
 * (`MobileCustomerController`) — cùng service, cùng DTO, chỉ khác khoá khách
 * đi trên đường dẫn của tài nguyên khách hàng.
 *
 * KHÔNG có `BranchScopeGuard`: lịch sử bán scope theo tổ chức, lọc cửa hàng
 * là tuỳ chọn của người dùng. Lý do đầy đủ ở `MobileInvoiceService`.
 */
@ApiTags('mobile')
@Controller('mobile/invoices')
@UseGuards(PermissionGuard)
export class MobileInvoiceController {
  constructor(private readonly invoices: MobileInvoiceService) {}

  @Get()
  @RequirePermission('pos.invoice.read')
  @ApiOperation({ summary: 'Danh sách hoá đơn đã ghi sổ, phân trang' })
  list(
    @Query() query: MobileInvoiceListQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileInvoicePageDto> {
    return this.invoices.list(toListQuery(query), actor);
  }

  /** `ParseUUIDPipe` — cùng lý do mọi `:id` mobile: 400 thay vì 500 cho id rác. */
  @Get(':id')
  @RequirePermission('pos.invoice.read')
  @ApiOperation({ summary: 'Chi tiết một hoá đơn kèm dòng hàng' })
  findById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ): Promise<MobileInvoiceDetailResponseDto> {
    return this.invoices.findById(id, actor);
  }
}

/**
 * Điền mặc định cho DTO — dùng chung với route lịch sử mua ở
 * `MobileCustomerController`, nên không viết inline trong một handler.
 */
export function toListQuery(query: MobileInvoiceListQueryDto) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 20,
    order: query.order ?? MobileInvoiceOrder.DESC,
    dateBasis: query.dateBasis ?? MobileInvoiceDateBasis.CREATED,
    from: query.from,
    to: query.to,
    status: query.status,
    branchIds: query.branchIds,
    search: query.search,
  };
}
