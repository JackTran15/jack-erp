import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Lý do huỷ — MISA để trống được, nên không bắt buộc. */
export class CancelSalesOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
