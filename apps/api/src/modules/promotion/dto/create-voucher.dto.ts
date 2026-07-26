import { IsString, IsNumber, IsOptional, IsUUID, IsDateString, IsEnum, Min } from 'class-validator';
import { PromotionStatus } from '@erp/shared-interfaces';

export class CreateVoucherDto {
  @IsString() code: string;
  @IsString() issuer: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(PromotionStatus) status?: PromotionStatus;
  @IsNumber() @Min(0) faceValue: number;
  @IsOptional() @IsUUID() customerId?: string;
  /** Omit for an unlimited-duration voucher (FR-051). */
  @IsOptional() @IsDateString() validFrom?: string;
  @IsOptional() @IsDateString() validTo?: string;
}
