import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsBoolean, IsUUID } from 'class-validator';

/** Bulk toggle item.is_active — "Ngừng theo dõi" / "Sử dụng lại". */
export class SetItemsStatusDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  ids: string[];

  @ApiProperty({ description: 'true = đang theo dõi, false = ngừng theo dõi' })
  @IsBoolean()
  isActive: boolean;
}
