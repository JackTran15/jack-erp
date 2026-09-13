import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { MobileInvoiceListQueryDto } from '../dto/mobile-invoice-list.query.dto';
import { MobileInvoiceService } from '../services/mobile-invoice.service';

/**
 * Hoá đơn của người đang đăng nhập — nguồn của màn **Danh sách hoá đơn**.
 *
 * Ba khác biệt với `POST /v2/invoices/search`, và khác biệt thứ ba là lý do
 * đường này tồn tại:
 *
 * 1. **`GET` chứ không `POST`.** Đây là một lượt ĐỌC; đường kia trả 201 cho nó
 *    vì nó nằm trong khuôn CQRS-search của web.
 * 2. **Bốn tham số thay vì hai mươi.** Màn của app chỉ có hàng lọc kỳ.
 * 3. **Phạm vi "của mình" ép ở SERVER** (ADR-24). Đường web không lọc theo nhân
 *    viên bán trừ khi client gửi bộ lọc — tức "chỉ hoá đơn của mình" ở đó là
 *    một lời hứa của client, mà client thì sửa được. Ở đây service tra
 *    `employee_profiles` từ token và gán; DTO **không phơi** trường đó ra.
 *
 * KHÔNG `@Version()` — module mobile chạy `VERSION_NEUTRAL`; thêm vào là ra
 * `/v1/mobile/...` và phá mọi đường dẫn khai trong `ApiEndpoints` phía Dart.
 */
@ApiTags('mobile')
@Controller('mobile/invoices')
@UseGuards(PermissionGuard)
export class MobileInvoiceController {
  constructor(private readonly service: MobileInvoiceService) {}

  @Get()
  @RequirePermission('pos.invoice.read')
  @ApiOperation({ summary: 'Hoá đơn mà người đang đăng nhập được ghi công bán' })
  @ApiOkResponse({ description: '{ data, total, page, limit, totals: { totalAmount } }' })
  list(
    @Query() query: MobileInvoiceListQueryDto,
    @Actor() actor: ActorContext,
  ) {
    return this.service.list(query, actor);
  }

  /**
   * Một hoá đơn của người đang đăng nhập.
   *
   * `ParseUUIDPipe` chặn id rác ngay ở cổng: thiếu nó thì một chuỗi bất kỳ đi
   * xuống tận TypeORM và ra lỗi 500 `invalid input syntax for type uuid` —
   * một lỗi máy chủ cho một lỗi của client.
   *
   * Hoá đơn của người khác trả **404**, không phải 403 — xem doc của service.
   */
  @Get(':id')
  @RequirePermission('pos.invoice.read')
  @ApiOperation({ summary: 'Một hoá đơn, kèm dòng hàng và các khoản đã thu' })
  @ApiOkResponse({ description: 'Hoá đơn đầy đủ; 404 nếu không phải hoá đơn của người gọi' })
  getById(
    @Param('id', ParseUUIDPipe) id: string,
    @Actor() actor: ActorContext,
  ) {
    return this.service.getById(id, actor);
  }
}
