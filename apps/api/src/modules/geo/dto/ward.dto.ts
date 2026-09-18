import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

function parseQueryBool(value: unknown): unknown {
  if (value === true || value === 'true' || value === '1') return true;
  if (value === false || value === 'false' || value === '0') return false;
  return value;
}

export class WardSearchQueryDto {
  @ApiPropertyOptional({
    maxLength: 100,
    description:
      'Tìm theo tên, không phân biệt dấu và hoa/thường ("phuc xa" khớp "Phường Phúc Xá"). ' +
      '% và _ là ký tự thường.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    maxLength: 16,
    example: '2026_01',
    description:
      'Lọc đúng một tỉnh. Mã 2026_xx → phường hiện hành; mã 1995_xx → phường cũ của tỉnh đó ' +
      '(khi có provinceCode thì includeLegacy không còn tác dụng).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  provinceCode?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Chỉ dùng khi không có provinceCode: false → chỉ phường hiện hành (isCurrent = true); ' +
      'true → cả phường cũ (cấu trúc trước sáp nhập).',
  })
  @IsOptional()
  // "yes"/"abc" không được im lặng thành false — để nguyên cho @IsBoolean trả 400.
  @Transform(({ value }) => parseQueryBool(value))
  @IsBoolean()
  includeLegacy?: boolean = false;

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
}

export class WardFindQueryDto {
  @ApiPropertyOptional({
    maxLength: 16,
    description:
      'Bỏ trống → tra phường hiện hành có mã này (mã phường duy nhất trong một thời kỳ). ' +
      'Truyền 1995_xx để tra phường cũ.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  provinceCode?: string;
}

export class WardDto {
  @ApiProperty({ example: '4', description: 'Mã phường — chỉ duy nhất trong cặp (provinceCode, code)' })
  code!: string;

  @ApiProperty({ example: 'Phường Ba Đình' })
  name!: string;

  @ApiProperty({ example: '2026_01' })
  provinceCode!: string;

  @ApiProperty({
    nullable: true,
    example: 'Hà Nội',
    description: 'Tên tỉnh hiện hành; null với phường cũ (mã 1995_xx không còn là tỉnh)',
  })
  provinceName!: string | null;

  @ApiProperty({ nullable: true, description: 'Mã quận/huyện, chỉ có ở phường cũ' })
  districtCode!: string | null;

  @ApiProperty({ description: 'true khi provinceCode là một tỉnh hiện hành' })
  isCurrent!: boolean;
}

export class WardSearchResponseDto {
  @ApiProperty({ type: [WardDto] })
  data!: WardDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
