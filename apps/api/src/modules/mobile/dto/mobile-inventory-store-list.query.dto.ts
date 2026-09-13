import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsISO8601,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { MobileInventoryKind } from './mobile-inventory-product-list.query.dto';

/** Chuỗi đơn -> mảng một phần tử, cùng lý do ở DTO danh sách mặt hàng. */
const toArray = () =>
  Transform(({ value }) => (Array.isArray(value) ? value : [value]));

/**
 * Query của `GET /mobile/inventory/stores` và `GET /mobile/inventory/stores/:branchId`.
 *
 * Tách khỏi `MobileInventoryProductListQueryDto` vì tập khoá KHÁC HẲN: thẻ
 * cửa hàng không phân trang, không tìm, không sắp, không lọc trạng thái. Dùng
 * chung một DTO là cho phép `?status=in_stock` đi qua rồi bị lặng lẽ bỏ —
 * `forbidNonWhitelisted` chỉ chặn được khoá mà DTO KHÔNG khai.
 */
export class MobileInventoryStoreListQueryDto {
  /** Cùng nghĩa với `asOf` của danh sách mặt hàng: tồn tính đến hết ngày. */
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

  /** Thu hẹp danh sách thẻ. Vắng = mọi cửa hàng người dùng được phép. */
  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @toArray()
  @IsArray()
  @IsUUID('all', { each: true })
  branchIds?: string[];
}
