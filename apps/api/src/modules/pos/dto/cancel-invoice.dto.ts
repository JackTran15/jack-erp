import { IsString, MinLength } from 'class-validator';

export class CancelInvoiceDto {
  @IsString()
  @MinLength(5)
  reason: string;
}
