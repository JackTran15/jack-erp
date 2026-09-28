import { ArrayMaxSize, IsArray, IsIn, IsNumber, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PromotionDiscountMode, PromotionTargetType } from '@erp/shared-interfaces';

/** Phương thức giảm giá có nhập/xuất Excel — mỗi phương thức một sheet trong file. */
export type ItemDiscountExcelMethod =
  | PromotionDiscountMode.PERCENT
  | PromotionDiscountMode.AMOUNT
  | PromotionDiscountMode.FIXED_PRICE;

export const ITEM_DISCOUNT_EXCEL_METHODS: readonly ItemDiscountExcelMethod[] = [
  PromotionDiscountMode.PERCENT,
  PromotionDiscountMode.AMOUNT,
  PromotionDiscountMode.FIXED_PRICE,
];

/** Loại đích của một dòng Excel — chỉ hàng hóa hoặc sản phẩm, không có nhóm hàng. */
export type ItemDiscountExcelTargetType = PromotionTargetType.ITEM | PromotionTargetType.PRODUCT;

export const ITEM_DISCOUNT_EXCEL_TARGET_TYPES: readonly ItemDiscountExcelTargetType[] = [
  PromotionTargetType.ITEM,
  PromotionTargetType.PRODUCT,
];

export const ITEM_DISCOUNT_EXPORT_MAX_LINES = 2000;

export class ExportItemDiscountLineDto {
  @ApiProperty({ enum: ITEM_DISCOUNT_EXCEL_TARGET_TYPES })
  @IsIn(ITEM_DISCOUNT_EXCEL_TARGET_TYPES)
  targetType: ItemDiscountExcelTargetType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetId: string;

  @ApiPropertyOptional({ description: '% giảm hoặc số tiền giảm, theo `method`; bỏ qua với `FIXED_PRICE`' })
  @IsOptional()
  @IsNumber()
  value?: number;
}

export class ExportItemDiscountLinesDto {
  @ApiProperty({ enum: ITEM_DISCOUNT_EXCEL_METHODS })
  @IsIn(ITEM_DISCOUNT_EXCEL_METHODS)
  method: ItemDiscountExcelMethod;

  @ApiProperty({ type: [ExportItemDiscountLineDto], maxItems: ITEM_DISCOUNT_EXPORT_MAX_LINES })
  @IsArray()
  @ArrayMaxSize(ITEM_DISCOUNT_EXPORT_MAX_LINES)
  @ValidateNested({ each: true })
  @Type(() => ExportItemDiscountLineDto)
  lines: ExportItemDiscountLineDto[];
}

/** Trường form `method` của request multipart nhập khẩu (file đi riêng qua `file`). */
export class ImportItemDiscountLinesDto {
  @ApiProperty({ enum: ITEM_DISCOUNT_EXCEL_METHODS })
  @IsIn(ITEM_DISCOUNT_EXCEL_METHODS)
  method: ItemDiscountExcelMethod;
}

/** Một dòng hợp lệ đã tra được mã; `code`/`name` lấy từ DB. */
export class ImportedItemDiscountLine {
  @ApiProperty({ description: 'Số dòng Excel (hàng tiêu đề = 1)' })
  rowNumber: number;

  @ApiProperty({ enum: ITEM_DISCOUNT_EXCEL_TARGET_TYPES })
  targetType: ItemDiscountExcelTargetType;

  @ApiProperty({ format: 'uuid' })
  targetId: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ description: '% giảm hoặc số tiền giảm, theo `method`; không có với `FIXED_PRICE`' })
  value?: number;

  @ApiPropertyOptional({ description: 'Đơn vị tính; chỉ dòng `ITEM`' })
  unit?: string;

  @ApiPropertyOptional({ description: 'Giá bán; chỉ dòng `ITEM`' })
  sellingPrice?: number;
}

/** Một dòng lỗi: số dòng Excel + lý do tiếng Việt. */
export class ImportItemDiscountRowError {
  @ApiProperty({ description: 'Số dòng Excel (hàng tiêu đề = 1)' })
  rowNumber: number;

  @ApiPropertyOptional({ description: 'Mã SKU trong file (đã trim); trống khi thiếu mã' })
  code?: string;

  @ApiProperty()
  message: string;
}

export class ImportItemDiscountLinesResult {
  @ApiProperty({ type: [ImportedItemDiscountLine] })
  rows: ImportedItemDiscountLine[];

  @ApiProperty({ type: [ImportItemDiscountRowError] })
  errors: ImportItemDiscountRowError[];
}
