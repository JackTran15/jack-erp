import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { MobileActivityBatchDto } from '../dto/mobile-activity.dto';
import { MobileActivityService } from '../services/mobile-activity.service';

/**
 * Activity log của app mobile — chỉ cần ĐĂNG NHẬP, không có `PermissionGuard`:
 * mọi người dùng đều sinh activity, và chặn theo quyền là mất đúng log của
 * người đang gặp chuyện (vd bị từ chối quyền).
 *
 * Không chống trùng khi gửi lại (không Redis) — xem `MobileActivityService`.
 */
@ApiTags('mobile')
@Controller('mobile/activities')
export class MobileActivityController {
  constructor(private readonly activities: MobileActivityService) {}

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Ghi nhận hoạt động người dùng của app mobile' })
  async record(
    @Actor() actor: ActorContext,
    @Body() dto: MobileActivityBatchDto,
  ): Promise<void> {
    await this.activities.record(actor, dto);
  }
}
