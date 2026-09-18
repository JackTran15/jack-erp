import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { CashVoucherCategoryDirection } from '../../enums';

export class SearchCashVoucherCategoryTreeDto {
  @ApiPropertyOptional({ description: 'Match on category name or code' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: CashVoucherCategoryDirection })
  @IsOptional()
  @IsEnum(CashVoucherCategoryDirection)
  direction?: CashVoucherCategoryDirection;

  @ApiPropertyOptional({ description: 'Only active (true) or only inactive (false) categories' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CashVoucherCategoryTreeNodeDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  description: string | null;

  @ApiProperty({ enum: CashVoucherCategoryDirection })
  direction: CashVoucherCategoryDirection;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  displayOrder: number;

  @ApiProperty({ nullable: true })
  parentGroupId: string | null;

  /** Kept so the admin table's "Ngày tạo" column has a value in tree mode. */
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;

  @ApiProperty({ type: () => [CashVoucherCategoryTreeNodeDto] })
  children: CashVoucherCategoryTreeNodeDto[];
}

export class SearchCashVoucherCategoryTreeResponseDto {
  @ApiProperty({ type: [CashVoucherCategoryTreeNodeDto] })
  data: CashVoucherCategoryTreeNodeDto[];
}
