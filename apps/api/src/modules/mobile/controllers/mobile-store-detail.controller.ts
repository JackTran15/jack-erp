import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { MobileBusinessReportQueryDto } from '../dto/mobile-business-report.query.dto';
import { MobileStoreDetailResponseDto } from '../dto/mobile-store-detail.response.dto';
import { MobileStoreDetailService } from '../services/mobile-store-detail.service';

/** Cùng chìa với Tổng quan: màn này là một dòng của Tổng quan mở rộng ra. */
const REVENUE_BY_ITEM_READ = 'reporting.sales.revenue-by-item.read';

/**
 * Chi tiết MỘT cửa hàng của app quản lý — màn mở ra khi chạm một dòng ở
 * Tổng quan. CHỈ đọc. Web không có màn tương đương còn sống.
 *
 * Nằm dưới `mobile/reports/overview/branches/:id` chứ không phải một route
 * phẳng mới: nó là drill-down của Tổng quan, cùng khuôn
 * `revenue/items/:id/branches`. Query tái dùng `MobileBusinessReportQueryDto`
 * (`from`/`to` bắt buộc) — màn không nhận kỳ so sánh lẫn `branchIds` (chi
 * nhánh đã ở đường dẫn), nên DTO Tổng quan là thừa khoá.
 */
@ApiTags('mobile')
@Controller('mobile/reports/overview')
@UseGuards(PermissionGuard)
export class MobileStoreDetailController {
  constructor(private readonly detail: MobileStoreDetailService) {}

  @Get('branches/:id')
  @RequirePermission(REVENUE_BY_ITEM_READ)
  @ApiOperation({
    summary:
      'Chi tiết một cửa hàng trong kỳ: doanh thu theo trạng thái HĐ, tiền thu theo phương thức, khách mới, HĐ còn nợ, tồn kho',
  })
  @ApiOkResponse({ type: MobileStoreDetailResponseDto })
  getBranch(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: MobileBusinessReportQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileStoreDetailResponseDto> {
    return this.detail.getDetail({ id, from: query.from, to: query.to }, actor);
  }
}
