import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  ListNotificationsQueryDto,
  NotificationAppQueryDto,
  NotificationPageDto,
  NotificationSettingsDto,
  ReadAllResultDto,
  RegisterDeviceDto,
  SaveNotificationSettingsDto,
  UnreadCountDto,
} from '../../notification/dto/notification.dto';
import { NotificationInboxService } from '../../notification/services/notification-inbox.service';
import { NotificationSettingsService } from '../../notification/services/notification-settings.service';
import { UserDeviceService } from '../../notification/services/user-device.service';

/**
 * Notifications of the signed-in user — login only, NO `PermissionGuard`:
 * every endpoint reads/writes the caller's OWN rows (pinned to
 * `actor.userId`). Who RECEIVES a notification is decided by the document's
 * read permission at dispatch time, not here.
 */
@ApiTags('mobile')
@Controller('mobile/notifications')
export class MobileNotificationController {
  constructor(
    private readonly inbox: NotificationInboxService,
    private readonly settings: NotificationSettingsService,
    private readonly devices: UserDeviceService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách thông báo của người đang đăng nhập (mới nhất trước)' })
  @ApiOkResponse({ type: NotificationPageDto })
  list(@Actor() actor: ActorContext, @Query() query: ListNotificationsQueryDto): Promise<NotificationPageDto> {
    return this.inbox.list(actor, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Số thông báo chưa đọc (badge)' })
  @ApiOkResponse({ type: UnreadCountDto })
  async unreadCount(@Actor() actor: ActorContext, @Query() query: NotificationAppQueryDto): Promise<UnreadCountDto> {
    return { count: await this.inbox.unreadCount(actor, query.app) };
  }

  @Post('read-all')
  @ApiOperation({ summary: 'Đánh dấu tất cả đã đọc' })
  @ApiOkResponse({ type: ReadAllResultDto })
  async readAll(@Actor() actor: ActorContext, @Query() query: NotificationAppQueryDto): Promise<ReadAllResultDto> {
    return { updated: await this.inbox.markAllRead(actor, query.app) };
  }

  @Get('settings')
  @ApiOperation({ summary: 'Thiết lập thông báo + các loại app này bật được' })
  @ApiOkResponse({ type: NotificationSettingsDto })
  getSettings(@Actor() actor: ActorContext, @Query() query: NotificationAppQueryDto): Promise<NotificationSettingsDto> {
    return this.settings.get(actor, query.app);
  }

  @Put('settings')
  @ApiOperation({ summary: 'Lưu thiết lập thông báo' })
  @ApiOkResponse({ type: NotificationSettingsDto })
  saveSettings(
    @Actor() actor: ActorContext,
    @Query() query: NotificationAppQueryDto,
    @Body() dto: SaveNotificationSettingsDto,
  ): Promise<NotificationSettingsDto> {
    return this.settings.save(actor, query.app, dto);
  }

  @Put('devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đăng ký / cập nhật FCM token của thiết bị (upsert theo installationId + app)' })
  async registerDevice(@Actor() actor: ActorContext, @Body() dto: RegisterDeviceDto): Promise<void> {
    await this.devices.register(actor, dto);
  }

  @Delete('devices/:installationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Huỷ đăng ký thiết bị (gọi lúc đăng xuất, trước /mobile/auth/logout)' })
  async unregisterDevice(
    @Actor() actor: ActorContext,
    @Param('installationId', ParseUUIDPipe) installationId: string,
    @Query() query: NotificationAppQueryDto,
  ): Promise<void> {
    await this.devices.unregister(actor, installationId, query.app ?? 'erp_manager');
  }

  // Declared LAST: `:id/read` must not shadow the static routes above.
  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đánh dấu một thông báo đã đọc' })
  async markRead(@Actor() actor: ActorContext, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.inbox.markRead(actor, id);
  }
}
