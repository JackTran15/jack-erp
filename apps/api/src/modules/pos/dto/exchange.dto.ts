import {
  IsUUID,
  IsNumber,
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '@erp/shared-interfaces';

export class ExchangeReturnLineDto {
  @IsUUID()
  originalSaleLineId: string;

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
}

export class ExchangeNewLineDto {
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

export class ExchangeSettlementDto {
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @IsNumber({ maxDecimalPlaces: 2 })
  amount: number;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class ProcessExchangeDto {
  @IsUUID()
  sessionId: string;

  @IsString()
  @MaxLength(2000)
  reason: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExchangeReturnLineDto)
  returnLines: ExchangeReturnLineDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExchangeNewLineDto)
  newLines: ExchangeNewLineDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ExchangeSettlementDto)
  settlement?: ExchangeSettlementDto;

  @IsUUID()
  cashAccountId: string;

  @IsUUID()
  revenueAccountId: string;
}
