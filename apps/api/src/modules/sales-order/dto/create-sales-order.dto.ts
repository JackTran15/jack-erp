import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
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

  /**
   * `employee_profiles.id` được ghi công bán. Vắng = hồ sơ của người gọi.
   * Phải là nhân viên đang hoạt động, được phân vào chi nhánh của request.
   */
  @IsOptional()
  @IsUUID()
  salespersonId?: string;

  /**
   * Điểm tích luỹ khách DỰ KIẾN dùng. `0` hoặc vắng = không dùng.
   *
   * Chỉ được GHI LẠI ở bước này, KHÔNG trừ: đơn chưa có hoá đơn. Thu ngân chốt
   * lúc *Nhận xử lý* — xem `SalesOrderEntity.pointsRedeemed`.
   */
  @IsOptional()
  @IsInt()
  @Min(0)
  pointsRedeemed?: number;

  /**
   * `true` = LƯU TẠM: đơn ở `DRAFT`, chỉ người gửi thấy, thu ngân không thấy.
   * `PATCH` một đơn `DRAFT` với `isDraft: false` (hoặc vắng) là GỬI nó.
   */
  @IsOptional()
  @IsBoolean()
  isDraft?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalesOrderLineDto)
  lines: SalesOrderLineDto[];
}
