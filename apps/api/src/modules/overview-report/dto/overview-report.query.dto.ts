import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import {
  MobileRevenueReportQueryDto,
  MobileRevenueTimelineQueryDto,
} from '../../mobile/dto/mobile-revenue-report.query.dto';

/** Chuỗi đơn -> mảng một phần tử — cùng luật `branchIds` của DTO mobile. */
const toArray = () =>
  Transform(({ value }) => (Array.isArray(value) ? value : [value]));

/**
 * Kỳ + cửa hàng của Tổng quan web: dùng NGUYÊN DTO của báo cáo doanh thu
 * mobile (`from`/`to` bắt buộc, `branchIds` vắng = mọi chi nhánh PHÂN CÔNG),
 * để hai màn Tổng quan có đúng một luật phạm vi.
 */
export class OverviewRangeQueryDto extends MobileRevenueReportQueryDto {}

/** Chuỗi thời gian — mức gộp là `MobileRevenueTimeUnit`, khoá mốc do `TIME_BUCKET_SQL` sinh. */
export class OverviewTimelineQueryDto extends MobileRevenueTimelineQueryDto {}

/** "Lợi nhuận hàng hoá": chuỗi thời gian + ba bộ lọc nhiều giá trị (vắng = tất cả). */
export class OverviewProductProfitQueryDto extends MobileRevenueTimelineQueryDto {
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @toArray()
  @IsArray()
  @IsUUID('all', { each: true })
  categoryIds?: string[];

  /** Mẫu mã (`products.id`). */
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @toArray()
  @IsArray()
  @IsUUID('all', { each: true })
  productIds?: string[];

  /** Hàng hoá (`items.id`). */
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @toArray()
  @IsArray()
  @IsUUID('all', { each: true })
  itemIds?: string[];
}

/** Trục gộp của "Tỉ trọng doanh thu hàng hoá". */
export enum OverviewShareDimension {
  PRODUCT_GROUP = 'product_group',
  VARIANT = 'variant',
  PRODUCT = 'product',
}

export enum OverviewTopProductsSortBy {
  REVENUE = 'revenue',
  QUANTITY = 'quantity',
}

/** Bộ lọc chung của hai báo cáo hàng hoá row 3 trái — một nhóm hàng, một mẫu mã. */
class OverviewProductFilterQueryDto extends MobileRevenueReportQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /** Mẫu mã (`products.id`). */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  productId?: string;
}

export class OverviewProductShareQueryDto extends OverviewProductFilterQueryDto {
  @ApiProperty({ enum: OverviewShareDimension })
  @IsEnum(OverviewShareDimension)
  dimension!: OverviewShareDimension;
}

export class OverviewTopProductsQueryDto extends OverviewProductFilterQueryDto {
  @ApiProperty({ enum: OverviewTopProductsSortBy })
  @IsEnum(OverviewTopProductsSortBy)
  sortBy!: OverviewTopProductsSortBy;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}
