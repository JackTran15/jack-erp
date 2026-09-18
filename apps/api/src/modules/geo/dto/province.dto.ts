import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ProvinceListQueryDto {
  @ApiPropertyOptional({
    maxLength: 100,
    description:
      'Tìm theo tên, không phân biệt dấu và hoa/thường ("ha noi" khớp "Hà Nội"). ' +
      'Ký tự % và _ là ký tự thường, không phải wildcard.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class ProvinceMergedFromDto {
  @ApiProperty({ description: 'Mã tỉnh thời kỳ trước (1995_xx) đã gộp vào tỉnh này' })
  code!: string;

  @ApiProperty()
  name!: string;
}

export class ProvinceDto {
  @ApiProperty({ example: '2026_01' })
  code!: string;

  @ApiProperty({ example: 'Hà Nội' })
  name!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty({ example: '2026-01-01', description: 'Ngày hiệu lực, YYYY-MM-DD' })
  effectiveFrom!: string;

  @ApiProperty({
    type: [ProvinceMergedFromDto],
    description: 'Các tỉnh cũ đã sáp nhập vào; dùng để ánh xạ địa chỉ ghi theo mã 1995_xx',
  })
  mergedFrom!: ProvinceMergedFromDto[];
}

export class ProvinceListResponseDto {
  @ApiProperty({ type: [ProvinceDto] })
  data!: ProvinceDto[];
}
