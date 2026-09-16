import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

/** Mở ca từ mobile: két của chi nhánh trong `X-Branch-Id` + tiền quỹ đầu ca (đồng). */
export class MobileOpenShiftDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  cashAccountId: string;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  openingCashAmount: number;
}

/** Đóng ca: tiền bàn giao (đồng) + ghi chú tuỳ chọn. Người nhận bàn giao KHÔNG lưu (A-57). */
export class MobileCloseShiftDto {
  @ApiProperty({ example: 1155000 })
  @IsInt()
  @Min(0)
  actualCash: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
