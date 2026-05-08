import { IsString, IsEnum, IsNumber, IsOptional, IsInt, IsDateString, Min } from 'class-validator';
import { DiscountType } from '../discount-code.entity';

export class CreateDiscountCodeDto {
  @IsString() code: string;
  @IsEnum(DiscountType) discountType: DiscountType;
  @IsNumber() @Min(0) discountValue: number;
  @IsOptional() @IsNumber() @Min(0) minOrderValue?: number;
  @IsOptional() @IsInt() @Min(1) maxUses?: number;
  @IsDateString() validFrom: string;
  @IsDateString() validTo: string;
}
