import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, Max, MaxLength, Min } from 'class-validator';

/** Đặt số dư điểm mới; server ghi một dòng ADJUST bằng chênh lệch (ADR-01). */
export class SetPointsBalanceDto {
  @ApiProperty({ description: 'Số dư điểm mới (số nguyên ≥ 0)', minimum: 0, maximum: 1_000_000_000 })
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  points: number;

  @ApiProperty({ description: 'Lý do điều chỉnh, lưu vào ghi chú sổ cái điểm', maxLength: 500 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note: string;
}
