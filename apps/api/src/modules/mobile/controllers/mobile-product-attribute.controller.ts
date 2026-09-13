import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { MobileProductAttributeDto } from '../dto/mobile-product-attribute.response.dto';
import { MobileProductAttributeService } from '../services/mobile-product-attribute.service';

/**
 * Chiều thuộc tính của cả danh mục — nguồn của hai hàng chip lọc Màu sắc /
 * Size ở màn Bán hàng.
 *
 * KHÔNG phân trang: đây là một từ vựng, không phải một danh sách bản ghi. Một
 * tổ chức có vài chiều và vài chục nhãn; phân trang nó là bắt client ghép lại
 * một thứ vốn phải nhìn trọn để chọn.
 *
 * Quyền `inventory.item.read` — quyền HẸP mà cả hai vai bán hàng đều có, cùng
 * quyền mà `/mobile/sales-items` dùng. Đây là dữ liệu danh mục, không phải dữ
 * liệu kho.
 */
@ApiTags('mobile')
@Controller('mobile/product-attributes')
@UseGuards(PermissionGuard)
export class MobileProductAttributeController {
  constructor(private readonly attributes: MobileProductAttributeService) {}

  @Get()
  @RequirePermission('inventory.item.read')
  @ApiOperation({ summary: 'Chiều thuộc tính của cả danh mục (Màu sắc, Size…)' })
  @ApiOkResponse({ type: [MobileProductAttributeDto] })
  list(@Actor() actor: ActorContext): Promise<MobileProductAttributeDto[]> {
    return this.attributes.list(actor);
  }
}
