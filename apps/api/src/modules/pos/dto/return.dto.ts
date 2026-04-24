import {
  IsUUID,
  IsNumber,
  IsString,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReturnLineDto {
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

export class ProcessReturnDto {
  @IsUUID()
  sessionId: string;

  @IsString()
  @MaxLength(2000)
  reason: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnLineDto)
  lines: ReturnLineDto[];

  @IsUUID()
  cashAccountId: string;

  @IsUUID()
  revenueAccountId: string;
}
