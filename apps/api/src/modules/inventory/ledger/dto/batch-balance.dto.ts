import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

/**
 * One (mặt hàng, phạm vi) cần biết tồn. `locationId` = tồn tại đúng vị trí đó;
 * bỏ trống thì `storageId` được dùng và tồn là tổng mọi vị trí trong kho — đúng
 * con số người dùng nhìn thấy khi dòng phiếu mới chỉ chọn Kho, chưa chọn Vị trí.
 */
export class BalancePairDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  itemId!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  storageId?: string;
}

export class BatchBalanceRequestDto {
  @ApiProperty({ type: [BalancePairDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(10000)
  @ValidateNested({ each: true })
  @Type(() => BalancePairDto)
  pairs!: BalancePairDto[];
}

export class BatchBalanceRowDto {
  @ApiProperty({ format: 'uuid' })
  itemId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  locationId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  storageId!: string | null;

  @ApiProperty({ description: 'Tồn hiện có; 0 khi chưa có dòng tồn nào.' })
  quantity!: number;
}

export class BatchBalanceResponseDto {
  @ApiProperty({ type: [BatchBalanceRowDto] })
  data!: BatchBalanceRowDto[];
}
