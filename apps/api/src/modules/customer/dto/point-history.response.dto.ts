import { ApiProperty } from '@nestjs/swagger';
import { PointType } from '../point-history.entity';

/** Một dòng sổ cái điểm, kèm mã hóa đơn và tên người thực hiện (2026100101 T-01-03). */
export class PointHistoryItemDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ enum: PointType, enumName: 'PointType' }) type: PointType;
  @ApiProperty({ description: 'Số điểm cộng (+) hoặc trừ (−)' }) delta: number;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) invoiceId: string | null;
  @ApiProperty({ nullable: true, type: String }) invoiceCode: string | null;
  @ApiProperty({ nullable: true, type: String }) note: string | null;
  @ApiProperty({ nullable: true, type: String }) createdByName: string | null;
}

export class PointHistoryPageDto {
  @ApiProperty({ type: [PointHistoryItemDto] }) data: PointHistoryItemDto[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
}
