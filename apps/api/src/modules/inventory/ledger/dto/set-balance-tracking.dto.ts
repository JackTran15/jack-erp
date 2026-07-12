import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsUUID,
  ValidateNested,
} from 'class-validator';

/** One (item × location) pair whose location-level tracking is being toggled. */
export class BalanceTrackingEntryDto {
  @ApiProperty({ format: 'uuid', description: 'Hàng hoá (item)' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ format: 'uuid', description: 'Vị trí (location)' })
  @IsUUID()
  locationId: string;
}

/**
 * Bulk toggle stock_balances.is_tracked — "Ngừng theo dõi" / bật lại theo dõi ở
 * cấp vị trí (item × location). KHÔNG đụng item.is_active.
 */
export class SetBalanceTrackingDto {
  @ApiProperty({ type: [BalanceTrackingEntryDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => BalanceTrackingEntryDto)
  entries: BalanceTrackingEntryDto[];

  @ApiProperty({ description: 'true = đang theo dõi, false = ngừng theo dõi' })
  @IsBoolean()
  isTracked: boolean;
}
