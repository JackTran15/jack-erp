import {
  IsUUID,
  IsNumber,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@erp/shared-interfaces';

export class CheckoutLineDto {
  @IsUUID()
  itemId: string;

  @IsUUID()
  locationId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  taxAmount: number;
}

export class CheckoutPaymentDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class CheckoutDto {
  @IsUUID()
  sessionId: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutLineDto)
  lines: CheckoutLineDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutPaymentDto)
  payments: CheckoutPaymentDto[];

  @IsUUID()
  cashAccountId: string;

  @IsUUID()
  revenueAccountId: string;
}
