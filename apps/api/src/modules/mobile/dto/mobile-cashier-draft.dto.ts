import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';

/** Một dòng hàng của hoá đơn nháp — đúng hình dạng giỏ của app (T-15-01). */
export class MobileDraftLineDto {
  @IsUUID() itemId: string;
  @IsString() itemCode: string;
  @IsString() itemName: string;
  @IsString() unit: string;
  @IsNumber() @Min(0) quantity: number;
  @IsNumber() @Min(0) unitPrice: number;
  /**
   * Giảm dòng theo TIỀN — CHỈ giảm tay. Khuyến mại do checkout saga tính lại lúc
   * thu (ADR-50); gộp KM vào đây thì saga trừ KM hai lần (A-87).
   */
  @IsOptional() @IsNumber() @Min(0) lineDiscount?: number;
  @IsOptional() @IsString() @MaxLength(255) lineDiscountReason?: string;
  @IsOptional() @IsString() note?: string;
}

/**
 * PATCH hoá đơn nháp từ giỏ thu ngân. Mọi trường tuỳ chọn: chỉ trường có mặt
 * mới đổi; `lines` có mặt là THAY TRỌN danh sách dòng (như `items` của POS).
 * `salesChannel` ghi lên ĐƠN HÀNG gốc (hoá đơn không có cột kênh; A-65).
 */
export class MobileUpdateDraftDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() salespersonId?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() @MaxLength(64) salesChannel?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MobileDraftLineDto) lines?: MobileDraftLineDto[];
}

/**
 * Giỏ thu ngân tự dựng trên màn Bán hàng (không qua đơn tư vấn): lập hoá đơn NHÁP
 * từ dòng giỏ để *Thu tiền* đi cùng đường `drafts/:id/checkout` (Loc rà 2026-09-14:
 * "Nếu là Thu ngân thì Thu tiền luôn, không cần gửi đơn hàng").
 */
export class MobileCreateDraftDto {
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() salespersonId?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsString() @MaxLength(64) salesChannel?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => MobileDraftLineDto) lines: MobileDraftLineDto[];
}

/** Body cho `POST /mobile/cashier/drafts/:invoiceId/points` — đổi điểm vào nháp. */
export class MobileRedeemPointsDto {
  /** SỐ ĐIỂM, không phải số tiền. Máy chủ quy ra tiền bằng `POINT_REDEMPTION_VALUE_VND`. */
  @IsInt() @Min(1) points: number;
}
