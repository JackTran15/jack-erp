import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { InvoicePaymentMethod } from '../../pos/entities/invoice.entity';

/** Danh sách hoá đơn đủ điều kiện đổi trả (T-18-01): kỳ + một ô tìm (số HĐ / tên / SĐT). */
export class MobileReturnableQueryDto {
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @Transform(({ value }) => parseInt(value, 10)) @IsInt() @Min(1) page?: number;
  @IsOptional() @Transform(({ value }) => parseInt(value, 10)) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class MobileReturnLineDto {
  @IsUUID() originalInvoiceItemId: string;
  @IsNumber() @Min(0.01) quantity: number;
}

export class MobileExtraLineDto {
  @IsUUID() itemId: string;
  @IsString() itemCode: string;
  @IsString() itemName: string;
  @IsString() unit: string;
  @IsNumber() @Min(0.01) quantity: number;
  @IsNumber() @Min(0) unitPrice: number;
  @IsOptional() @IsNumber() @Min(0) lineDiscount?: number;
  /**
   * Lý do giảm giá TAY của dòng — `invoice_items.line_discount_reason`, cùng chỗ POS web ghi. App bắt buộc nhập khi có
   * `lineDiscount` (như `LineDiscountDialog` của web); thiếu trường này thì lý do rơi mất khi lưu phiếu.
   */
  @IsOptional() @IsString() @MaxLength(255) lineDiscountReason?: string;
  /** Ghi chú của RIÊNG dòng này — `invoice_items.note`, cùng chỗ mà dòng giỏ bán ghi vào. */
  @IsOptional() @IsString() @MaxLength(255) note?: string;
}

export enum MobileRefundMethod {
  CASH = 'cash',
  BANK = 'bank',
}

export class MobileExtraPaymentDto {
  @IsEnum(InvoicePaymentMethod) method: InvoicePaymentMethod;
  @IsNumber() @Min(0.01) amount: number;
  @IsOptional() @IsUUID() paymentAccountId?: string;
}

/**
 * Đổi trả một lượt (AC-72..76): dòng trả (theo dòng của HĐ gốc) + dòng mua thêm
 * (tuỳ chọn) + cách trả tiền cho khách; mua thêm nhiều hơn trả thì khách trả
 * thêm bằng `payments` (khách có tên thiếu → ghi nợ như checkout thường).
 */
export class MobileExchangeDto {
  @IsUUID() originalInvoiceId: string;
  @IsOptional() @IsString() @MaxLength(255) reason?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => MobileReturnLineDto) returnLines: MobileReturnLineDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MobileExtraLineDto) newLines?: MobileExtraLineDto[];
  @IsEnum(MobileRefundMethod) refundMethod: MobileRefundMethod;
  /** `payment_accounts.id` nhận/chi chuyển khoản — bắt buộc khi `refundMethod = bank`. */
  @IsOptional() @IsUUID() paymentAccountId?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => MobileExtraPaymentDto) payments?: MobileExtraPaymentDto[];
}
