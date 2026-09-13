import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectSalesOrderDto {
  /** Cùng ngưỡng 5 ký tự với `CancelInvoiceDto.reason`. */
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason: string;
}
