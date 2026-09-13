import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * LOẠI tồn mà con số nói về — ba lựa chọn của nhóm "Loại tồn" ở màn lọc app.
 *
 * `on_hand` đọc SỔ CÁI; `in_transit`/`incoming` đọc PHIẾU CHUYỂN đang
 * `IN_PROGRESS` (`mobile-inventory-ledger.sql.ts`, `pendingCellsSql`). Với hai
 * loại sau, `asOf` bị bỏ qua và mọi số theo KỲ (tồn đầu, nhập, xuất) là 0 —
 * một phiếu đang đi không có "tính đến ngày".
 */
export enum MobileInventoryKind {
  ON_HAND = 'on_hand',
  IN_TRANSIT = 'in_transit',
  INCOMING = 'incoming',
}

/**
 * Trạng thái tồn. `out_of_stock` là `<= 0`, tức GỒM cả tồn âm — app đặt tên
 * "hết hàng" cho cả hai vì với người bán, âm hay bằng không đều là "không còn
 * gì để bán".
 */
export enum MobileInventoryStatus {
  ALL = 'all',
  IN_STOCK = 'in_stock',
  OUT_OF_STOCK = 'out_of_stock',
}

/**
 * Tiêu chí sắp xếp do SERVER quyết — cùng lý do `MobileProductSort`: server
 * phân trang thì sắp ở client là sai. Có cả chiều vì màn lọc của app có đủ
 * bốn mục (tăng/giảm × số lượng/giá trị).
 */
export enum MobileInventorySort {
  QUANTITY_ASC = 'quantity_asc',
  QUANTITY_DESC = 'quantity_desc',
  VALUE_ASC = 'value_asc',
  VALUE_DESC = 'value_desc',
}

/**
 * Độ mịn của một dòng: `product` gộp mọi biến thể của một mẫu mã thành một
 * dòng (item không thuộc mẫu mã nào tự đứng riêng — cùng luật với
 * `/mobile/products`); `variant` là từng item.
 */
export enum MobileInventoryLevel {
  PRODUCT = 'product',
  VARIANT = 'variant',
}

/** Chuỗi đơn -> mảng một phần tử, để `?branchIds=a` và `?branchIds=a&branchIds=b` cùng hợp lệ. */
const toArray = () =>
  Transform(({ value }) => (Array.isArray(value) ? value : [value]));

/** Query của `GET /mobile/inventory/products`. */
export class MobileInventoryProductListQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  /** Tìm theo mã hoặc tên. KHÔNG bỏ dấu — cùng luật mọi ô tìm mobile. */
  @ApiPropertyOptional({ example: 'Gelli' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  /**
   * Thu hẹp theo cửa hàng. Vắng = MỌI cửa hàng người dùng được phép — không
   * phải toàn tổ chức. Phần tử ngoài quyền là 403, xem `resolveBranchIds`.
   */
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @toArray()
  @IsArray()
  @IsUUID('all', { each: true })
  branchIds?: string[];

  /**
   * Tồn "tính đến ngày" — `YYYY-MM-DD`, bao gồm TRỌN ngày đó. Vắng = hôm nay.
   * Đây là mốc CUỐI của kỳ; app không có ô "từ ngày", kỳ nhập-xuất của thẻ
   * cửa hàng lấy đầu tháng của chính ngày này.
   */
  @ApiPropertyOptional({ example: '2026-09-11' })
  @IsOptional()
  @IsISO8601({ strict: true })
  asOf?: string;

  @ApiPropertyOptional({
    enum: MobileInventoryKind,
    default: MobileInventoryKind.ON_HAND,
  })
  @IsOptional()
  @IsEnum(MobileInventoryKind)
  kind?: MobileInventoryKind = MobileInventoryKind.ON_HAND;

  @ApiPropertyOptional({
    enum: MobileInventoryStatus,
    default: MobileInventoryStatus.ALL,
  })
  @IsOptional()
  @IsEnum(MobileInventoryStatus)
  status?: MobileInventoryStatus = MobileInventoryStatus.ALL;

  @ApiPropertyOptional({
    enum: MobileInventorySort,
    default: MobileInventorySort.QUANTITY_DESC,
  })
  @IsOptional()
  @IsEnum(MobileInventorySort)
  sort?: MobileInventorySort = MobileInventorySort.QUANTITY_DESC;

  @ApiPropertyOptional({
    enum: MobileInventoryLevel,
    default: MobileInventoryLevel.PRODUCT,
  })
  @IsOptional()
  @IsEnum(MobileInventoryLevel)
  level?: MobileInventoryLevel = MobileInventoryLevel.PRODUCT;

  /**
   * Đơn vị tính, so KHÔNG phân biệt hoa/thường: `items.unit` là chuỗi tự do,
   * và dữ liệu thật có cả `Đôi` lẫn `đôi` cho cùng một nghĩa.
   */
  @ApiPropertyOptional({ example: 'Đôi' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  unit?: string;

  /** Nhóm hàng — lọc CẢ cây con, cùng luật với tổng hợp tồn kho của web. */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
