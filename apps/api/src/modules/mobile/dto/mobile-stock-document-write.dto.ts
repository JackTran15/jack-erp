import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DocCounterpartyKind } from '@erp/shared-interfaces';
import { GoodsReceiptPaymentMethod } from '../../inventory/goods-receipt/goods-receipt.entity';
import { MobileStockDocumentKind } from './mobile-stock-document-list.query.dto';

/**
 * Một dòng hàng do app gửi lên — BA trường.
 *
 * Cố ý KHÔNG có `locationId` và `uomCode` dù DTO của phiếu nhập bắt buộc cả
 * hai: chúng là chi tiết kho vận mà màn hình không vẽ ra, và server tự giải
 * được. Xem `MobileStockDocumentWriteService`.
 */
export class MobileStockDocumentLineWriteDto {
  @ApiProperty({ format: 'uuid', description: 'Lấy từ `GET /mobile/items` — là `items.id`' })
  @IsUUID()
  itemId!: string;

  @ApiProperty({ minimum: 0.001, description: 'Cho phép phần lẻ: cột `numeric(18,3)`' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  @ApiProperty({ minimum: 0, description: '0 là hợp lệ — phiếu điều chuyển nội bộ không có giá' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/**
 * Tạo một chứng từ kho.
 *
 * MỘT hình dạng cho cả ba loại; service dịch sang DTO của phiếu nhập hoặc phiếu
 * xuất tuỳ [kind]. Ba chỗ hai bên đặt tên khác nhau (`receivedAt`/`occurredAt`,
 * `description`/`notes`, `deliveredBy`/`deliverer`) được giấu ở đây — app không
 * có lý do gì để biết chúng.
 *
 * **Ba trường app KHÔNG gửi, server tự giải:**
 *
 * - `locationId` mỗi dòng — qua `ResolveItemLocationsQuery`, từ [branchId];
 * - `uomCode` mỗi dòng — từ `items.unit`;
 * - `purpose` — ép theo [kind].
 *
 * Cả ba là khái niệm nội bộ backend. Bắt app mang chúng là bắt nó biết ba thứ
 * mà màn hình không hề hiển thị.
 */
export class MobileStockDocumentCreateDto {
  @ApiProperty({ enum: MobileStockDocumentKind })
  @IsEnum(MobileStockDocumentKind)
  kind!: MobileStockDocumentKind;

  @ApiProperty({ format: 'uuid', description: 'Cửa hàng lập phiếu — phải nằm trong quyền của người gọi' })
  @IsUUID()
  branchId!: string;

  @ApiProperty({ description: 'Ngày chứng từ, ISO-8601' })
  @IsISO8601()
  documentDate!: string;

  /**
   * Đối tượng. Hai trường đi CÙNG NHAU: gửi `counterpartyKind` mà thiếu
   * `counterpartyId` là 400 ở tầng dưới.
   *
   * `customer` sẽ bị từ chối — phiếu kho chỉ nhận nhà cung cấp và nhân viên.
   */
  @ApiPropertyOptional({ enum: DocCounterpartyKind })
  @IsOptional()
  @IsEnum(DocCounterpartyKind)
  counterpartyKind?: DocCounterpartyKind;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  counterpartyId?: string;

  /** Nhân viên mua hàng — `users.id`. Chỉ phiếu NHẬP có trường này. */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  purchasingEmployeeId?: string;

  /** Chỉ phiếu NHẬP. Phiếu xuất không có khái niệm thanh toán. */
  @ApiPropertyOptional({ enum: GoodsReceiptPaymentMethod })
  @IsOptional()
  @IsEnum(GoodsReceiptPaymentMethod)
  paymentMethod?: GoodsReceiptPaymentMethod;

  @ApiPropertyOptional({ maxLength: 200, description: 'Người giao' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deliverer?: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Diễn giải' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiProperty({ type: [MobileStockDocumentLineWriteDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MobileStockDocumentLineWriteDto)
  lines!: MobileStockDocumentLineWriteDto[];
}

/**
 * Sửa một chứng từ.
 *
 * KHÔNG kế thừa DTO tạo: [kind] và [branchId] là thứ **không đổi được** — đổi
 * loại chứng từ hay chuyển phiếu sang cửa hàng khác là huỷ-và-lập-lại, không
 * phải sửa. Nhưng cả hai vẫn phải CÓ MẶT vì server cần chúng để biết tra bảng
 * nào và kiểm quyền cửa hàng nào; chúng đi qua query của đường `PATCH`.
 *
 * `lines` bắt buộc và không rỗng: phiếu không dòng hàng bị tầng dưới từ chối,
 * và một `PATCH` thiếu `lines` sẽ lặng lẽ giữ nguyên dòng cũ — trong khi màn
 * hình đang hiện danh sách người dùng vừa sửa.
 */
export class MobileStockDocumentUpdateDto {
  @ApiProperty({ description: 'Ngày chứng từ, ISO-8601' })
  @IsISO8601()
  documentDate!: string;

  @ApiPropertyOptional({ enum: DocCounterpartyKind })
  @IsOptional()
  @IsEnum(DocCounterpartyKind)
  counterpartyKind?: DocCounterpartyKind;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  counterpartyId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  purchasingEmployeeId?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deliverer?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiProperty({ type: [MobileStockDocumentLineWriteDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MobileStockDocumentLineWriteDto)
  lines!: MobileStockDocumentLineWriteDto[];
}
