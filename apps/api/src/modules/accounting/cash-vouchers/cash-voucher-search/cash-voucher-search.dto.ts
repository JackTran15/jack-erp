import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CompareFilterDto,
  DateRangeFilterDto,
  StringFilterDto,
} from '../../../../common/filters/filter.dto';

export enum CashVoucherDocumentType {
  CASH_RECEIPT = 'cash_receipt',
  CASH_PAYMENT = 'cash_payment',
  GOODS_RECEIPT_PAYMENT = 'goods_receipt_payment',
}

export class CashVoucherDocumentTypeFilterDto {
  @IsEnum(CashVoucherDocumentType)
  value: CashVoucherDocumentType;
}

export class CashVoucherSearchDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsUUID()
  cashAccountId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  voucherDate?: DateRangeFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  documentNumber?: StringFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CashVoucherDocumentTypeFilterDto)
  documentType?: CashVoucherDocumentTypeFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  totalAmount?: CompareFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  counterparty?: StringFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  reason?: StringFilterDto;
}
