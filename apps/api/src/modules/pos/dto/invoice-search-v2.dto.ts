import {
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  CompareFilterDto,
  DateRangeFilterDto,
  EnumFilterDto,
  StringFilterDto,
} from '../../../common/filters/filter.dto';

export class InvoiceSearchV2Dto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  /** Số hóa đơn */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  code?: StringFilterDto;

  /** Trạng thái */
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  status?: EnumFilterDto;

  /** Loại hóa đơn */
  @IsOptional()
  @ValidateNested()
  @Type(() => EnumFilterDto)
  type?: EnumFilterDto;

  /** Ngày hóa đơn */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  issuedAt?: DateRangeFilterDto;

  /** Ngày tạo đơn */
  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeFilterDto)
  createdAt?: DateRangeFilterDto;

  /** Mã / tên khách hàng — filter by customer UUID */
  @IsOptional()
  @IsUUID()
  customerId?: string;

  /** Số điện thoại */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  customerPhone?: StringFilterDto;

  /** Mã khách hàng */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  customerCode?: StringFilterDto;

  /** Tên khách hàng */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  customerName?: StringFilterDto;

  /** Tổng thanh toán */
  @IsOptional()
  @ValidateNested()
  @Type(() => CompareFilterDto)
  amountDue?: CompareFilterDto;

  /** Ghi chú */
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  note?: StringFilterDto;
}
