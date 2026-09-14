import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { MobileTransferOrderListQueryDto } from '../dto/mobile-transfer-order-list.query.dto';
import { MobileTransferOrderPageDto } from '../dto/mobile-transfer-order.response.dto';
import { MobileTransferOrderService } from '../services/mobile-transfer-order.service';

/**
 * Lệnh điều chuyển cho app mobile.
 *
 * Chỉ có MỘT đường, và cố ý: app chỉ cần danh sách lệnh **chờ nhận** để người
 * dùng chọn ở màn "Chứng từ điều chuyển". Việc TẠO lệnh và xác nhận xuất/nhập
 * đi qua `/mobile/stock-documents` — ở đó app nói "phiếu xuất kho, mục đích điều
 * chuyển" và server tự dựng lệnh, thay vì bắt app biết vòng đời hai pha của
 * `transfer_orders`.
 *
 * `GET` với query phẳng, không phải `POST` với body lồng như đường v2 của web:
 * đây là thao tác ĐỌC, và mọi đường `/mobile/**` khác đều là `GET`.
 *
 * Đặt ở `mobile/transfer-orders` chứ không lồng dưới `mobile/stock-documents`:
 * lệnh điều chuyển là một BẢNG KHÁC với vòng đời riêng, không phải một loại
 * chứng từ kho. Gộp đường dẫn là nói dối về mô hình dữ liệu.
 */
@ApiTags('mobile')
@Controller('mobile/transfer-orders')
@UseGuards(PermissionGuard)
export class MobileTransferOrderController {
  constructor(private readonly transferOrders: MobileTransferOrderService) {}

  /**
   * `inventory.transfer.read` — đúng quyền mà đường tương ứng của web
   * (`GET /inventory/transfer-orders/importable`) đòi. KHÔNG dùng
   * `goods_receipt.read`: người xem được phiếu nhập chưa chắc được xem lệnh điều
   * chuyển của cửa hàng khác gửi tới.
   */
  @Get('importable')
  @RequirePermission('inventory.transfer.read')
  @ApiOperation({
    summary: 'Lệnh điều chuyển đang chờ cửa hàng hiện tại nhập, phân trang',
  })
  @ApiOkResponse({ type: MobileTransferOrderPageDto })
  listImportable(
    @Query() query: MobileTransferOrderListQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileTransferOrderPageDto> {
    return this.transferOrders.listImportable(
      {
        branchId: query.branchId,
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        from: query.from,
        to: query.to,
        sourceBranchId: query.sourceBranchId,
        search: query.search,
      },
      actor,
    );
  }
}
