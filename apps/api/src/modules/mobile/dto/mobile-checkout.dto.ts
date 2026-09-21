import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator';
import { InvoicePaymentMethod } from '../../pos/entities/invoice.entity';

export class MobilePaymentLineDto {
  @IsEnum(InvoicePaymentMethod) method: InvoicePaymentMethod;
  @IsNumber() @Min(0.01) amount: number;
  /** Tài khoản nhận (chuyển khoản) — `payment_accounts.id`; vắng thì server lấy mặc định theo phương thức. */
  @IsOptional() @IsUUID() paymentAccountId?: string;
}

/**
 * Thu tiền một hoá đơn nháp (T-16-01, AC-4x). Tổng `payments` < `amountDue`
 * và có khách → phần còn ghi nợ (`partial_debt`/`debt`); khách lẻ mà thiếu →
 * 400 `PAYMENT_INVALID` từ checkout saga (T-03-02, trước đây là v1).
 *
 * Ba trường cuối đi thẳng vào `CheckoutInput` của saga, cùng validator với
 * `CheckoutV2Dto` của web — hai mặt tiền nhận cùng một thứ thì phải từ chối
 * cùng một thứ.
 */
export class MobileCheckoutDto {
  @IsArray() @ArrayMinSize(0) @ValidateNested({ each: true }) @Type(() => MobilePaymentLineDto) payments: MobilePaymentLineDto[];
  @IsOptional() @IsString() @MaxLength(64) salesChannel?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  /** Tiền thừa khách không lấy — không nằm trong `payments`, saga ghi thu nhập khác. */
  @IsOptional() @IsNumber() @Min(0) keptChangeAmount?: number;
  /** CTKM thu ngân bật thêm / ưu tiên — saga tự tính số tiền, không nhận từ app. */
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) selectedProgramIds?: string[];
  /** CTKM thu ngân gỡ khỏi hoá đơn này; thắng `selectedProgramIds` khi trùng. */
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) excludedProgramIds?: string[];
}

/**
 * Hỏi saga "hoá đơn nháp này đáng bao nhiêu" trước khi thu (ADR-51). Chỉ lựa
 * chọn CTKM — không có `payments`, vì preview cố ý không chạy guard thanh toán.
 */
export class MobileCheckoutPreviewDto {
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) selectedProgramIds?: string[];
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) excludedProgramIds?: string[];
}
