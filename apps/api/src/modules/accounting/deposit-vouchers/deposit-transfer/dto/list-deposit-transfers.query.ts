import { Transform } from 'class-transformer';
import { IsEnum, IsISO8601, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { DepositTransferStatus } from '@erp/shared-interfaces';

export enum DepositTransferDirection {
  OUT = 'OUT',
  IN = 'IN',
}

export class ListDepositTransfersQuery {
  @IsOptional()
  @IsEnum(DepositTransferStatus)
  status?: DepositTransferStatus;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  /** OUT = this branch is the source; IN = this branch is the destination. */
  @IsOptional()
  @IsEnum(DepositTransferDirection)
  direction?: DepositTransferDirection;

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
