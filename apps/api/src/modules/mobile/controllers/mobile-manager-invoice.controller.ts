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
  MobileManagerInvoiceDateBasis,
  MobileManagerInvoiceListQueryDto,
  MobileManagerInvoiceOrder,
} from '../dto/mobile-manager-invoice-list.query.dto';
import {
  MobileManagerInvoiceDetailResponseDto,
  MobileManagerInvoicePageDto,
} from '../dto/mobile-manager-invoice.response.dto';
import { MobileManagerInvoiceService } from '../services/mobile-manager-invoice.service';

/**
 * Hoá đơn cho app mobile — tab Hoá đơn và màn chi tiết. CHỈ đọc: app không
 * lập hoá đơn (đó là việc của POS).
 *
 * Lịch sử mua của MỘT khách nằm ở `GET /mobile/customers/:id/invoices`
 * (`MobileCustomerController`) — cùng service, cùng DTO, chỉ khác khoá khách
 * đi trên đường dẫn của tài nguyên khách hàng.
 *
 * KHÔNG có `BranchScopeGuard`: lịch sử bán scope theo tổ chức, lọc cửa hàng
 * là tuỳ chọn của người dùng. Lý do đầy đủ ở `MobileManagerInvoiceService`.
 */
@ApiTags('mobile')
@Controller('mobile/manager/invoices')
@UseGuards(PermissionGuard)
export class MobileManagerInvoiceController {
  constructor(private readonly invoices: MobileManagerInvoiceService) {}

  @Get()
  @RequirePermission('pos.invoice.read')
  @ApiOperation({ summary: 'Danh sách hoá đơn đã ghi sổ, phân trang' })
  list(
    @Query() query: MobileManagerInvoiceListQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileManagerInvoicePageDto> {
    return this.invoices.list(toListQuery(query), actor);
  }

  /** `ParseUUIDPipe` — cùng lý do mọi `:id` mobile: 400 thay vì 500 cho id rác. */
  @Get(':id')
  @RequirePermission('pos.invoice.read')
  @ApiOperation({ summary: 'Chi tiết một hoá đơn kèm dòng hàng' })
  findById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ): Promise<MobileManagerInvoiceDetailResponseDto> {
    return this.invoices.findById(id, actor);
  }
}

/**
 * Điền mặc định cho DTO — dùng chung với route lịch sử mua ở
 * `MobileCustomerController`, nên không viết inline trong một handler.
 */
export function toListQuery(query: MobileManagerInvoiceListQueryDto) {
  return {
    page: query.page ?? 1,
    limit: query.limit ?? 20,
    order: query.order ?? MobileManagerInvoiceOrder.DESC,
    dateBasis: query.dateBasis ?? MobileManagerInvoiceDateBasis.CREATED,
    from: query.from,
    to: query.to,
    status: query.status,
    branchIds: query.branchIds,
    search: query.search,
  };
}
