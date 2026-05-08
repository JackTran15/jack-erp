import { IsEnum, IsString } from 'class-validator';
import { InvoicePromotionType } from '../invoice-promotion.entity';

export class ApplyPromotionDto {
  @IsEnum(InvoicePromotionType) type: InvoicePromotionType;
  @IsString() code: string; // the discount code, voucher code, or promotion id
}
