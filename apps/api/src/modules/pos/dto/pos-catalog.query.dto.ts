import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

export enum PosCatalogDirection {
  WAREHOUSE = 'warehouse',
  SHOWROOM = 'showroom',
}

export class PosCatalogQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  @IsEnum(PosCatalogDirection)
  direction?: PosCatalogDirection;

  /**
   * Include stock at stop-tracked (is_tracked=false) details. Bán hàng để mặc
   * định false (ẩn hàng ngừng theo dõi); Chuyển kho tạm truyền true để còn lấy
   * được nguồn dọn hàng.
   */
  @IsOptional()
  @Transform(({ value }) =>
    value === true || value === 'true' || value === '1',
  )
  @IsBoolean()
  includeUntracked?: boolean;
}
