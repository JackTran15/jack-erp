import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InvoicePaymentMethod } from '../entities/invoice.entity';

export class InvoicePaymentLineDto {
  @IsEnum(InvoicePaymentMethod)
  paymentMethod: InvoicePaymentMethod;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsUUID()
  accountId: string;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class CheckoutInvoiceDto {
  /** Payment lines. Empty array = full debt (requires receivableAccountId + customerId on invoice). */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoicePaymentLineDto)
  payments: InvoicePaymentLineDto[];

  @IsUUID()
  revenueAccountId: string;

  /** Required when totalPaid < amountDue — AR account to debit for the remainder. */
  @IsOptional()
  @IsUUID()
  receivableAccountId?: string;
}
