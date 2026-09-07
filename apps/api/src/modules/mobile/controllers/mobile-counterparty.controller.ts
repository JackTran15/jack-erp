import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { MobileCounterpartyListQueryDto } from '../dto/mobile-counterparty-list.query.dto';
import { MobileCounterpartyPageDto } from '../dto/mobile-counterparty.response.dto';
import { MobileCounterpartyService } from '../services/mobile-counterparty.service';

/**
 * Đối tượng của chứng từ kho.
 *
 * `GET` chứ không `POST` như đường tương ứng của web (`/v2/counterparties/search`):
 * đây là thao tác đọc, và mọi đường `/mobile/**` khác đều là `GET` — đổi kiểu ở
 * đúng một endpoint là bắt client mobile nhớ một ngoại lệ.
 */
@ApiTags('mobile')
@Controller('mobile/counterparties')
@UseGuards(PermissionGuard)
export class MobileCounterpartyController {
  constructor(private readonly counterparties: MobileCounterpartyService) {}

  @Get()
  @RequirePermission('inventory.read')
  @ApiOperation({ summary: 'Đối tượng của chứng từ kho: nhà cung cấp và nhân viên' })
  @ApiOkResponse({ type: MobileCounterpartyPageDto })
  list(
    @Query() query: MobileCounterpartyListQueryDto,
    @Actor() actor: ActorContext,
  ): Promise<MobileCounterpartyPageDto> {
    return this.counterparties.list(
      {
        page: query.page ?? 1,
        limit: query.limit ?? 20,
        search: query.search,
        kinds: query.kinds,
      },
      actor,
    );
  }
}
