import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { PreferredShelfResponseDto } from './preferred-shelf.response.dto';

export class ResolveItemSourcePairDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  itemId!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Kho form đang đề xuất (kho dòng trên / kho mặc định). Được giữ lại nếu ' +
      'mã hàng có vị trí đang theo dõi trong kho đó; ngược lại dùng làm kho fallback.',
  })
  @IsOptional()
  @IsUUID()
  preferredStorageId?: string;
}

export class ResolveItemSourceRequestDto {
  @ApiProperty({ type: [ResolveItemSourcePairDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10000)
  @ValidateNested({ each: true })
  @Type(() => ResolveItemSourcePairDto)
  pairs!: ResolveItemSourcePairDto[];

  @ApiPropertyOptional({
    default: false,
    description:
      'Xếp kho showroom (is_main_storage) xuống cuối danh sách ứng viên — ' +
      'dùng cho kho nguồn của phiếu chuyển kho, vốn ưu tiên xuất từ kho lưu trữ.',
  })
  @IsOptional()
  @IsBoolean()
  deprioritizeMainStorage?: boolean;
}

export class ResolvedStorageDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ nullable: true })
  code!: string | null;

  @ApiProperty()
  name!: string;
}

export class ResolveItemSourceRowDto {
  @ApiProperty({ format: 'uuid' })
  itemId!: string;

  @ApiProperty({ type: ResolvedStorageDto, nullable: true })
  storage!: ResolvedStorageDto | null;

  @ApiProperty({ type: PreferredShelfResponseDto, nullable: true })
  shelf!: PreferredShelfResponseDto | null;
}

export class ResolveItemSourceResponseDto {
  @ApiProperty({ type: [ResolveItemSourceRowDto] })
  data!: ResolveItemSourceRowDto[];
}
