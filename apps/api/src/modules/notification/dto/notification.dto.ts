import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { NOTIFICATION_APPS, NOTIFICATION_LOCALES, NotificationApp } from '../core/notification.types';

const PLATFORMS = ['ios', 'android'] as const;

/** `?app=` shared by every inbox/settings endpoint. Default erp_manager. */
export class NotificationAppQueryDto {
  @ApiPropertyOptional({ enum: NOTIFICATION_APPS, default: 'erp_manager' })
  @IsOptional()
  @IsIn(NOTIFICATION_APPS as unknown as string[])
  app?: NotificationApp = 'erp_manager';
}

export class RegisterDeviceDto {
  @ApiProperty({ description: 'UUID the app generates once per install' })
  @IsUUID()
  installationId: string;

  @ApiProperty({ enum: NOTIFICATION_APPS })
  @IsIn(NOTIFICATION_APPS as unknown as string[])
  app: NotificationApp;

  @ApiProperty({ enum: PLATFORMS })
  @IsIn(PLATFORMS as unknown as string[])
  platform: (typeof PLATFORMS)[number];

  @ApiProperty()
  @IsString()
  @MaxLength(4096)
  fcmToken: string;

  @ApiProperty({ enum: NOTIFICATION_LOCALES })
  @IsIn(NOTIFICATION_LOCALES as unknown as string[])
  locale: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  appVersion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  environment?: string;
}

export class ListNotificationsQueryDto extends NotificationAppQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 20;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  unreadOnly?: boolean = false;
}

export class SaveNotificationSettingsDto {
  @ApiPropertyOptional({ nullable: true, description: 'null = whole chain' })
  @IsOptional()
  @IsUUID()
  scopeBranchId?: string | null;

  @ApiProperty({ type: [String], example: ['invoice', 'invoice_cancel'] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  enabledTypes: string[];
}

// ─── Responses ──────────────────────────────────────────────────────────────

export class NotificationTargetDto {
  @ApiProperty({ enum: ['invoice', 'stock_document', 'store', 'overview', 'inventory_store', 'product', 'notifications'] })
  type: string;
  @ApiPropertyOptional() id?: string;
  @ApiPropertyOptional() slug?: string;
  @ApiPropertyOptional() branchId?: string;
}

export class NotificationItemDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'invoice' }) type: string;
  @ApiProperty() createdAt: string;
  @ApiProperty() isRead: boolean;
  @ApiPropertyOptional({ nullable: true }) branchId: string | null;
  @ApiProperty({
    description: 'Raw template variables — clients format and render text',
    example: { actor: 'Nguyễn Văn A', code: '2609220001', amount: 1250000, store: 'Cửa hàng Q1' },
  })
  data: Record<string, string | number | null>;
  @ApiPropertyOptional({ type: NotificationTargetDto, nullable: true }) target: NotificationTargetDto | null;
}

export class NotificationPageDto {
  @ApiProperty({ type: [NotificationItemDto] }) data: NotificationItemDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}

export class UnreadCountDto {
  @ApiProperty() count: number;
}

export class ReadAllResultDto {
  @ApiProperty() updated: number;
}

export class NotificationSettingsDto {
  @ApiPropertyOptional({ nullable: true }) scopeBranchId: string | null;
  @ApiProperty({ type: [String] }) enabledTypes: string[];
  @ApiProperty({ type: [String], description: 'Types this app can enable; others are "coming soon"' })
  availableTypes: string[];
}
