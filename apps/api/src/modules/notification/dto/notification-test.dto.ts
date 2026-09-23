import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Bộ công cụ TẠM — xem `notification-test.config.ts`. */

export class TestDeviceQueryDto {
  @ApiPropertyOptional({ default: false, description: 'Kèm cả thiết bị đã thu hồi' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  includeRevoked?: boolean = false;
}

export class TestDeviceDto {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty() userName: string;
  @ApiProperty() userEmail: string;
  @ApiProperty() installationId: string;
  @ApiProperty() app: string;
  @ApiProperty() platform: string;
  @ApiProperty() locale: string;
  @ApiPropertyOptional({ nullable: true }) appVersion: string | null;
  @ApiPropertyOptional({ nullable: true }) environment: string | null;
  @ApiProperty() lastSeenAt: string;
  @ApiPropertyOptional({ nullable: true }) revokedAt: string | null;
  /** 8 ký tự cuối của FCM token. Token đầy đủ KHÔNG BAO GIỜ rời khỏi server. */
  @ApiProperty() tokenTail: string;
}

export class TestTypeDto {
  @ApiProperty() type: string;
  @ApiProperty({ description: 'event | schedule' }) trigger: string;
  @ApiPropertyOptional({ nullable: true, description: 'Topic Kafka (loại theo event)' }) topic: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Giờ chạy HH:mm (loại theo lịch)' }) at: string | null;
  @ApiProperty({ type: [String] }) permissions: string[];
  @ApiProperty({ type: [String] }) targetApps: string[];
  @ApiProperty({ type: [String] }) channels: string[];
  @ApiProperty() priority: string;
  @ApiProperty() defaultEnabled: boolean;
}

export class SendTestPushDto {
  /** Thiết bị nhận, lấy từ GET /devices. **Bắt buộc, ít nhất một.** */
  @ApiProperty({ type: [String], description: 'Id thiết bị lấy từ GET /devices — ít nhất một' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  deviceIds: string[];

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  title: string;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  body: string;

  @ApiPropertyOptional({ description: 'Đích deeplink: invoice | stock_document | store | overview | inventory_store | product | notifications' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  targetType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetId?: string;

  @ApiPropertyOptional({ description: 'stock_document: goods-receipt | stock-in | stock-out…' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  targetSlug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetBranchId?: string;
}

/** Kết quả của MỘT máy. Gửi 3 máy thì 1 máy hỏng không kéo theo 2 máy kia. */
export class SendTestPushDeviceResultDto {
  @ApiProperty() deviceId: string;
  @ApiProperty({ description: '8 ký tự cuối token — để đối chiếu với bảng thiết bị' })
  tokenTail: string;
  @ApiProperty() sent: boolean;
  @ApiPropertyOptional({ nullable: true }) messageId: string | null;
  @ApiPropertyOptional({ nullable: true, description: 'Mã lỗi FCM nguyên văn khi gửi hỏng' })
  error: string | null;
}

export class SendTestPushResultDto {
  @ApiProperty({ description: 'Số máy gửi được' }) sent: number;
  @ApiProperty({ description: 'Số máy hỏng' }) failed: number;
  @ApiProperty({ type: [SendTestPushDeviceResultDto] })
  results: SendTestPushDeviceResultDto[];
}

export class DispatchTestDto {
  @ApiProperty({ example: 'invoice', description: 'Mã loại, lấy từ GET /types' })
  @IsString()
  @MaxLength(64)
  type: string;

  /**
   * Thiết bị nhận, lấy từ GET /devices. **Bắt buộc, ít nhất một.**
   *
   * Người SỞ HỮU các thiết bị này thành người nhận (`ctx.recipientUserIds`) thay
   * cho bước dò theo quyền — để bắn thử luôn rơi đúng máy đang cầm trên tay, chứ
   * không đi tới điện thoại của người khác trong tổ chức.
   *
   * Lưu ý: bước LỌC THEO THIẾT LẬP vẫn chạy, và một người có nhiều thiết bị thì
   * MỌI thiết bị của người đó đều nhận — đây là hành vi thật của pipeline,
   * không phải chỗ để cắt bớt.
   */
  @ApiProperty({ type: [String], description: 'Id thiết bị nhận — ít nhất một' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsUUID('all', { each: true })
  deviceIds: string[];

  @ApiPropertyOptional({ description: 'Chi nhánh của thông báo. Bỏ trống = cấp tổ chức' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({
    description: 'Ghi đè dữ liệu mẫu: code, amount, actor, store, product, more, date',
    example: { code: 'HD-TEST', amount: 1250000 },
  })
  @IsOptional()
  @IsObject()
  data?: Record<string, string | number | null>;

  @ApiPropertyOptional({ description: 'Đích deeplink — để trống thì chạm vào push chỉ mở danh sách' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  targetType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  targetSlug?: string;
}

export class DispatchTestResultDto {
  @ApiProperty({ description: 'created | skipped' }) status: string;
  @ApiProperty({ description: 'Số NGƯỜI nhận suy ra từ danh sách thiết bị đã chọn' })
  targetedUsers: number;
  @ApiPropertyOptional({ nullable: true, description: 'Lý do khi bị bỏ: no-recipient | build-null | should-send' })
  reason: string | null;
  @ApiProperty() notifications: number;
  @ApiProperty() deliveries: number;
}

export class RunScheduledDto {
  @ApiProperty({ example: 'revenue', description: 'Mã loại chạy theo lịch' })
  @IsString()
  @MaxLength(64)
  type: string;
}

/** Một lượt bắn của lượt chạy — đủ để đọc ra vì sao máy không rung. */
export class RunScheduledFiringDto {
  @ApiProperty() eventId: string;
  @ApiProperty({ description: 'created | skipped | failed' }) status: string;
  @ApiPropertyOptional({ nullable: true, description: 'Lý do bỏ, hoặc câu lỗi' }) reason: string | null;
  @ApiProperty() notifications: number;
  @ApiProperty() deliveries: number;
}

export class RunScheduledResultDto {
  @ApiProperty() type: string;
  @ApiProperty({ description: 'Số "lần kích hoạt" mà lượt chạy sinh ra' }) firings: number;
  @ApiProperty({ description: 'Số thông báo MỚI ghi vào hộp thư' }) notifications: number;
  @ApiProperty({ description: 'Số lượt gửi xếp hàng (push/websocket)' }) deliveries: number;
  @ApiProperty({ description: 'Bị bỏ vì không ai đủ điều kiện nhận' }) noRecipient: number;
  @ApiProperty({ description: 'Đã gửi trong ngày rồi nên không gửi lại (eventId trùng)' }) duplicate: number;
  @ApiProperty({ description: 'Ném lỗi lúc dispatch' }) failed: number;
  @ApiProperty({ type: [RunScheduledFiringDto] }) details: RunScheduledFiringDto[];
}

export class TestDeliveryQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  type?: string;
}

export class TestDeliveryDto {
  @ApiProperty() id: string;
  @ApiProperty() createdAt: string;
  @ApiProperty() type: string;
  @ApiProperty() userName: string;
  @ApiProperty() channel: string;
  @ApiProperty() status: string;
  @ApiProperty() attempts: number;
  @ApiPropertyOptional({ nullable: true }) lastError: string | null;
  @ApiPropertyOptional({ nullable: true }) sentAt: string | null;
  @ApiPropertyOptional({ nullable: true }) tokenTail: string | null;
  @ApiProperty({ description: 'Dữ liệu thô của thông báo (biến template)' })
  data: Record<string, unknown>;
}
