import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

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
}
