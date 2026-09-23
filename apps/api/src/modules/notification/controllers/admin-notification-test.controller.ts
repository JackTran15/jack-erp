import { Body, Controller, Get, NotFoundException, Post, Query } from '@nestjs/common';
import { ApiExcludeController, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  DispatchTestDto,
  DispatchTestResultDto,
  RunScheduledDto,
  RunScheduledResultDto,
  SendTestPushDto,
  SendTestPushResultDto,
  TestDeliveryDto,
  TestDeliveryQueryDto,
  TestDeviceDto,
  TestDeviceQueryDto,
  TestTypeDto,
} from '../dto/notification-test.dto';
import { NOTIFICATION_TEST_TOOL_ENABLED } from '../notification-test.config';
import { NotificationTestService } from '../services/notification-test.service';

/**
 * Công cụ TẠM cho trang "Cấu hình → Test thông báo" của backoffice.
 *
 * **Chỉ đòi ĐĂNG NHẬP** — không `PermissionGuard`, cố ý: đây là đồ dùng một mùa,
 * thêm một permission là để lại rác trong `permissions` và trong mọi vai trò đã
 * gán. Cửa duy nhất là hằng [NOTIFICATION_TEST_TOOL_ENABLED] (sửa rồi deploy).
 * Lý do đầy đủ + cách gỡ sạch ở `notification-test.config.ts`.
 *
 * Mọi truy vấn vẫn bó trong tổ chức của người gọi (`actor.organizationId`), nên
 * không có đường nào nhìn hay chạm sang tenant khác.
 *
 * `@ApiExcludeController` để nó không lẫn vào tài liệu API công khai.
 */
@ApiExcludeController()
@Controller('admin/notifications/test')
export class AdminNotificationTestController {
  constructor(private readonly test: NotificationTestService) {}

  /** Tắt công cụ thì mọi đường trả 404 như chưa từng có. */
  private assertEnabled(): void {
    if (!NOTIFICATION_TEST_TOOL_ENABLED) throw new NotFoundException();
  }

  @Get('devices')
  @ApiOperation({ summary: 'Thiết bị đã đăng ký nhận thông báo của tổ chức' })
  @ApiOkResponse({ type: [TestDeviceDto] })
  devices(@Actor() actor: ActorContext, @Query() query: TestDeviceQueryDto): Promise<TestDeviceDto[]> {
    this.assertEnabled();
    return this.test.listDevices(actor, query.includeRevoked === true);
  }

  @Get('types')
  @ApiOperation({ summary: 'Danh mục loại thông báo đang đăng ký' })
  @ApiOkResponse({ type: [TestTypeDto] })
  types(): TestTypeDto[] {
    this.assertEnabled();
    return this.test.listTypes();
  }

  @Get('deliveries')
  @ApiOperation({ summary: 'Nhật ký gửi gần nhất, kèm trạng thái và lỗi cuối' })
  @ApiOkResponse({ type: [TestDeliveryDto] })
  deliveries(@Actor() actor: ActorContext, @Query() query: TestDeliveryQueryDto): Promise<TestDeliveryDto[]> {
    this.assertEnabled();
    return this.test.listDeliveries(actor, query);
  }

  @Post('push')
  @ApiOperation({ summary: 'Gửi push THÔ tới một thiết bị (bỏ qua thiết lập và template)' })
  @ApiOkResponse({ type: SendTestPushResultDto })
  push(@Actor() actor: ActorContext, @Body() dto: SendTestPushDto): Promise<SendTestPushResultDto> {
    this.assertEnabled();
    return this.test.sendRawPush(actor, dto);
  }

  @Post('dispatch')
  @ApiOperation({ summary: 'Bắn thử một loại thông báo qua ĐÚNG pipeline thật' })
  @ApiOkResponse({ type: DispatchTestResultDto })
  dispatch(@Actor() actor: ActorContext, @Body() dto: DispatchTestDto): Promise<DispatchTestResultDto> {
    this.assertEnabled();
    return this.test.dispatchTest(actor, dto);
  }

  @Post('run-scheduled')
  @ApiOperation({ summary: 'Chạy ngay một thông báo theo lịch (08:00 / 09:00)' })
  @ApiOkResponse({ type: RunScheduledResultDto })
  runScheduled(@Actor() actor: ActorContext, @Body() dto: RunScheduledDto): Promise<RunScheduledResultDto> {
    this.assertEnabled();
    return this.test.runScheduled(actor, dto);
  }
}
