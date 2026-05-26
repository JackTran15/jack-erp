import { IsEnum, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentAccountMethod } from '../enums';

export class ListPaymentAccountsQueryDto {
  /** Filter to a single payment method (cash/bank_transfer/card). */
  @ApiPropertyOptional({ enum: PaymentAccountMethod })
  @IsOptional()
  @IsEnum(PaymentAccountMethod)
  method?: PaymentAccountMethod;
}
