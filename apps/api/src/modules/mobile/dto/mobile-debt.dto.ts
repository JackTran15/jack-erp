import { Transform, Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { CustomersWithDebtSort } from '../../accounting/cash-vouchers/shared/dto/query-customers-with-debt.dto';

/** Danh sách khách còn nợ cho màn Thu nợ (T-17-01): tìm tên / SĐT / mã, sắp xếp. */
export class MobileDebtorsQueryDto {
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsEnum(CustomersWithDebtSort) sort?: CustomersWithDebtSort;
  @IsOptional() @Transform(({ value }) => parseInt(value, 10)) @IsInt() @Min(1) page?: number;
  @IsOptional() @Transform(({ value }) => parseInt(value, 10)) @IsInt() @Min(1) @Max(200) pageSize?: number;
}

export enum MobileDebtPaymentMethod {
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
}

export class MobileDebtAllocationDto {
  @IsUUID() invoiceDebtId: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
}

/**
 * Thu nợ một khách trên nhiều hoá đơn (AC-3x). Tiền mặt vào két của ca đang mở
 * (saga phiếu thu); chuyển khoản vào tài khoản nhận (`paymentAccountId` từ
 * `GET payment-accounts`, saga phiếu thu ngân hàng).
 */
export class MobileCollectDebtDto {
  @IsUUID() customerId: string;
  @IsEnum(MobileDebtPaymentMethod) paymentMethod: MobileDebtPaymentMethod;
  @IsOptional() @IsUUID() paymentAccountId?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => MobileDebtAllocationDto) allocations: MobileDebtAllocationDto[];
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
