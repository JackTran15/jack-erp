import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class SalesOrderLineDto {
  @IsUUID()
  itemId: string;

  @IsString()
  @MaxLength(100)
  itemCode: string;

  @IsString()
  @MaxLength(255)
  itemName: string;

  @IsString()
  @MaxLength(50)
  unit: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  manualDiscount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  manualDiscountReason?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  promotionDiscount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  promotionName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/**
 * Body của `POST` và `PATCH /mobile/sales-orders`. Server TỰ tính subtotal /
 * discount / amountDue từ dòng — client không gửi tổng nào.
 */
export class CreateSalesOrderDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesOrderLineDto)
  lines: SalesOrderLineDto[];
}
