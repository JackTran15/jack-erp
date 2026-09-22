import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Body của `POST /v2/partner/orders` — website công ty đặt đơn bằng API key.
 *
 * `ValidationPipe` toàn cục chạy `forbidNonWhitelisted: true`, nên **mọi** field
 * được chấp nhận phải khai ở đây và field lạ là 400. Đó chính là thứ chặn đối
 * tác gửi kèm `unitPrice`: giá do server chốt từ `items.selling_price` lúc nhận
 * đơn (AC-04), đối tác gửi giá là đối tác tự định giá.
 */
export class PartnerOrderCustomerDto {
  @ApiProperty({ description: 'Tên người đặt', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  /** Khoá khớp khách (A-01): chuẩn hoá rồi tìm theo `(organizationId, phone)`. */
  @ApiProperty({
    description:
      'Số điện thoại người đặt — khoá khớp khách. `+84901234567` và ' +
      '`0901234567` được chuẩn hoá về cùng một khách.',
    maxLength: 20,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone: string;

  @ApiPropertyOptional({ description: 'Email người đặt', maxLength: 255 })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;
}

/** Người NHẬN hàng — có thể khác người đặt, nên không suy ra từ `customer`. */
export class PartnerOrderRecipientDto {
  @ApiProperty({ description: 'Tên người nhận hàng', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ description: 'Số điện thoại người nhận hàng', maxLength: 20 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone: string;
}

/**
 * Địa chỉ giao + phí. Mã tỉnh/phường phải có thật trong `geo_*` (AC-02); tên
 * được server tra và CHỐT xuống đơn, đối tác không gửi tên (ADR-05).
 */
export class PartnerOrderShippingDto {
  @ApiProperty({
    description: 'Mã tỉnh/thành trong `geo_provinces`',
    maxLength: 16,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(16)
  provinceCode: string;

  @ApiProperty({ description: 'Mã phường/xã trong `geo_wards`', maxLength: 8 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(8)
  wardCode: string;

  @ApiProperty({ description: 'Số nhà / đường', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  addressLine: string;

  @ApiProperty({
    description: 'Phí giao hàng thu khách, VND',
    minimum: 0,
    example: 30000,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fee: number;
}

/**
 * Một dòng hàng. CHỈ `itemCode` + `quantity` — **không** `unitPrice`: xem doc của
 * {@link PartnerCreateOrderDto}. Đối tác làm việc với MÃ HÀNG (thứ họ thấy trên
 * catalogue và bao bì), không phải UUID nội bộ; `items.code` là UNIQUE theo tổ
 * chức nên đủ làm khoá (T-01-08). So khớp byte-exact như Partner Catalog API.
 */
export class PartnerOrderLineDto {
  @ApiProperty({
    description: '`items.code` (mã SKU) thuộc tổ chức của API key — so khớp đúng từng ký tự',
    maxLength: 50,
    example: 'GELLI-39-NAU',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  itemCode: string;

  @ApiProperty({ description: 'Số lượng đặt', minimum: 1, example: 2 })
  @IsInt()
  @Min(1)
  quantity: number;
}

export class PartnerCreateOrderDto {
  /**
   * Mã đơn phía website — khoá chống trùng theo kênh (AC-06). Gửi lại đúng mã
   * cũ trả về đơn đã tạo (200) thay vì tạo đơn thứ hai.
   */
  @ApiProperty({
    description:
      'Mã đơn phía website. Gửi lại cùng một mã trả về đơn đã tạo (200), ' +
      'không tạo đơn mới.',
    maxLength: 100,
    example: 'WEB-1001',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  externalOrderId: string;

  @ApiProperty({ type: PartnerOrderCustomerDto })
  @ValidateNested()
  @Type(() => PartnerOrderCustomerDto)
  customer: PartnerOrderCustomerDto;

  @ApiProperty({ type: PartnerOrderRecipientDto })
  @ValidateNested()
  @Type(() => PartnerOrderRecipientDto)
  recipient: PartnerOrderRecipientDto;

  @ApiProperty({ type: PartnerOrderShippingDto })
  @ValidateNested()
  @Type(() => PartnerOrderShippingDto)
  shipping: PartnerOrderShippingDto;

  @ApiProperty({ type: [PartnerOrderLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PartnerOrderLineDto)
  lines: PartnerOrderLineDto[];

  @ApiPropertyOptional({ description: 'Ghi chú của khách', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

/** Dòng hàng trả về — mang đơn giá SERVER đã chốt, không phải giá đối tác gửi. */
export class PartnerOrderLineResponseDto {
  @ApiProperty()
  itemId: string;

  @ApiProperty({ description: '`items.code` — đúng mã đã gửi' })
  itemCode: string;

  @ApiProperty()
  itemName: string;

  @ApiProperty()
  quantity: number;

  @ApiProperty({
    description: '`items.selling_price` tại thời điểm nhận đơn, đã chốt',
  })
  unitPrice: number;

  @ApiProperty()
  lineTotal: number;
}

export class PartnerCreateOrderResponseDto {
  @ApiProperty({ description: '`sales_orders.id`' })
  id: string;

  @ApiProperty({ description: 'Mã chứng từ, duy nhất theo tổ chức' })
  documentNumber: string;

  @ApiProperty({ description: "Luôn là `SENT` với đơn mới nhận" })
  status: string;

  @ApiProperty({ description: 'Tiền hàng phải thu; CHƯA gồm phí giao' })
  amountDue: number;

  @ApiProperty({ description: 'Phí giao hàng thu khách' })
  shippingFee: number;

  @ApiProperty({ type: [PartnerOrderLineResponseDto] })
  lines: PartnerOrderLineResponseDto[];
}
