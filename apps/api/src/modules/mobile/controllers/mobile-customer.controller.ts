import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { MobileCustomerListQueryDto } from '../dto/mobile-customer-list.query.dto';
import { MobileCustomerPageDto } from '../dto/mobile-customer.response.dto';
import { MobileCustomerService } from '../services/mobile-customer.service';

/**
 * Khách hàng để gắn vào đơn bán.
 *
 * `GET` chứ không `POST` như đường tương ứng của web
 * (`/v2/counterparties/search`): đây là thao tác đọc, và mọi đường
 * `/mobile/**` khác đều là `GET`.
 *
 * KHÔNG có `POST` tạo khách mới ở đây, dù màn MISA có nút đó: tạo khách chạm
 * tới nhóm khách, hạng thẻ và mã tự sinh — một bề mặt riêng, và nó cần chốt
 * nghiệp vụ trước.
 */
@ApiTags('mobile')
@Controller('mobile/customers')
@UseGuards(PermissionGuard)
export class MobileCustomerController {
  constructor(private readonly customers: MobileCustomerService) {}

  @Get()
  @RequirePermission('customer.read')
  @ApiOperation({ summary: 'Khách hàng để gắn vào đơn bán' })
  @ApiOkResponse({ type: MobileCustomerPageDto })
  list(
    @Query() query: MobileCustomerListQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileCustomerPageDto> {
    return this.customers.list(
      { page: query.page ?? 1, limit: query.limit ?? 20, search: query.search },
      actor,
    );
  }
}
