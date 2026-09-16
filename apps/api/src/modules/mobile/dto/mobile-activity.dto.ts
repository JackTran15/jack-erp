import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Trần số activity mỗi request — app gửi tối đa đúng số này một lượt. */
export const MOBILE_ACTIVITY_MAX_BATCH = 100;

/** Độ dài tối đa của mọi chuỗi mã (screen, target...) và của `value`. */
const CODE_MAX = 100;
const VALUE_MAX = 200;
const ID_MAX = 64;

/**
 * Một activity app gửi lên. CHỈ những field app tự biết — `user_id`,
 * `received_at`... do server gắn (xem `MobileActivityService`).
 *
 * Mọi field chuỗi-mã (`type`, `screen`...) KHÔNG `@IsIn(...)`: catalog thuộc về
 * app mobile, server không giữ bản nào để so. Chặn ở đây là
 * đánh rơi cả batch vì một chuỗi gõ sai.
 */
export class MobileActivityItemDto {
  @ApiProperty() @IsString() @MaxLength(ID_MAX) activityId: string;
  @ApiProperty({ example: '2026-09-16T08:12:03.412Z' }) @IsISO8601() ts: string;
  @ApiProperty() @IsString() @MaxLength(ID_MAX) sessionId: string;
  @ApiProperty() @IsInt() @Min(0) seq: number;
  @ApiProperty() @IsString() @MaxLength(CODE_MAX) type: string;
  @ApiProperty() @IsString() @MaxLength(CODE_MAX) screen: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(CODE_MAX) component?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(CODE_MAX) action?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(CODE_MAX) target?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(VALUE_MAX) value?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(ID_MAX) flowId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(ID_MAX) parentFlowId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(CODE_MAX) entityType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(ID_MAX) entityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(CODE_MAX) errorCode?: string;

  /** Vài giá trị bổ sung nhỏ gọn. Vượt trần kích thước thì service bỏ đi. */
  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;
}

export class MobileActivityBatchDto {
  @ApiProperty({ example: '1.0.3+42' }) @IsString() @MaxLength(32) appVersion: string;
  @ApiProperty({ example: 'ios' }) @IsString() @MaxLength(16) platform: string;
  @ApiProperty({ example: 1 }) @IsInt() @Min(0) catalogVersion: number;

  @ApiProperty({ type: [MobileActivityItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MOBILE_ACTIVITY_MAX_BATCH)
  @ValidateNested({ each: true })
  @Type(() => MobileActivityItemDto)
  activities: MobileActivityItemDto[];
}
