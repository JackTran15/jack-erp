import { IsOptional, IsObject } from 'class-validator';

export class FilterQueryDto {
  @IsOptional()
  @IsObject()
  filters?: Record<string, string | string[] | number | boolean>;
}
