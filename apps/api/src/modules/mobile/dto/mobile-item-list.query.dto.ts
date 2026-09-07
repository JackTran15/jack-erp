import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class MobileItemListQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  /**
   * Tìm theo mã, tên, hoặc nhãn biến thể.
   *
   * Ba trường chứ không chỉ tên: người lập phiếu gõ mã SKU (`GELLI-39-NAU`)
   * nhiều hơn gõ tên, và nhãn biến thể (`39 · Nâu`) là thứ phân biệt các dòng
   * cùng tên với nhau.
   */
  @ApiPropertyOptional({ example: 'GELLI' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
