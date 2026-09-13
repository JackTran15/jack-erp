import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequireBranchScope, RequirePermission } from '../../auth/decorators';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { PermissionGuard } from '../../rbac/permission.guard';
import { EvaluateCartQuery } from '../../promotion/application/queries/evaluate-cart.query';
import { MobileEvaluateCartDto } from '../dto/mobile-evaluate-cart.dto';

/**
 * Định giá một giỏ hàng theo các chương trình khuyến mại đang chạy.
 *
 * **Uỷ quyền thẳng cho `EvaluateCartQuery`** — cùng máy tính giá mà POS web
 * dùng. Đây là điều kiện để app KHÔNG tự nhân phần trăm ở đâu cả: luật khuyến
 * mại (ưu tiên, tranh chấp tài nguyên, `autoApply`, điều kiện theo khách) nằm
 * trọn trong `PromotionResolver`, và một bản sao ở Dart sẽ phân kỳ ngay lần đầu
 * ai đó sửa luật.
 *
 * Ba khác biệt với đường của web (`POST /v2/promotions/evaluate`):
 *
 * 1. **Quyền hẹp hơn.** Đường kia nhận `['promotion.read', 'pos.promotion.evaluate']`;
 *    ở đây chỉ `pos.promotion.evaluate`. Vai bán hàng có sẵn quyền đó trong
 *    `SALES_PERMISSION_KEYS`, và nó cố ý KHÔNG kéo theo quyền đọc trọn danh mục
 *    chương trình.
 * 2. **DTO là một TẬP CON** — xem `MobileEvaluateCartDto` để biết bỏ những gì và
 *    vì sao.
 * 3. **Không `@Version('2')`.** Module này chạy `VERSION_NEUTRAL`; thêm version
 *    là ra `/v1/mobile/...` và phá mọi đường dẫn khai trong `ApiEndpoints` phía
 *    Dart.
 *
 * **`POST` cho một thao tác ĐỌC** — ngoại lệ có khai báo của luật "đọc thì GET"
 * mà `MobileItemCategoryController` đặt ra: giỏ hàng là một body, và nhét nó vào
 * query string thì vỡ giới hạn độ dài URL ngay ở đơn vài chục dòng. Trả **200**
 * chứ không 201: không có gì được tạo ra.
 *
 * **`@RequireBranchScope()` giữ nguyên như đường web, và nó là ràng buộc THẬT.**
 * `EvaluateCartHandler` đọc `actor.branchId!` để tìm chương trình đang chạy —
 * khuyến mại là dữ liệu theo chi nhánh. Thiếu guard này thì thiếu `X-Branch-Id`
 * sẽ âm thầm định giá theo `branchIds[0]`, tức người bán ở cửa hàng B nhận giá
 * của cửa hàng A mà không có gì báo. Với guard, ca đó là một 403 đọc được.
 */
@ApiTags('mobile')
@Controller('mobile/promotions')
@UseGuards(PermissionGuard, BranchScopeGuard)
export class MobilePromotionController {
  constructor(private readonly queryBus: QueryBus) {}

  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('pos.promotion.evaluate')
  @RequireBranchScope()
  @ApiOperation({ summary: 'Định giá giỏ hàng theo khuyến mại — KHÔNG ghi gì' })
  @ApiOkResponse({ description: 'subtotal, promotionDiscount, amountAfterPromotion, appliedPrograms, availablePrograms, skippedPrograms' })
  evaluate(
    @Body() dto: MobileEvaluateCartDto,
    @Actor() actor: ActorContext,
  ) {
    return this.queryBus.execute(new EvaluateCartQuery(dto, actor));
  }
}
