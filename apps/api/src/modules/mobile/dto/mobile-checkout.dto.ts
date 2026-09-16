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
 * và có khách → phần còn ghi nợ (`partial_debt`/`debt`, POS đã hỗ trợ); khách
 * lẻ mà thiếu → 400 từ `CheckoutInvoiceService`.
 */
export class MobileCheckoutDto {
  @IsArray() @ArrayMinSize(0) @ValidateNested({ each: true }) @Type(() => MobilePaymentLineDto) payments: MobilePaymentLineDto[];
  @IsOptional() @IsString() @MaxLength(64) salesChannel?: string;
  @IsOptional() @IsDateString() dueDate?: string;
}
