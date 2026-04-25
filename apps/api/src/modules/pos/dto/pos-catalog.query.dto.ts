import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PosCatalogQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
