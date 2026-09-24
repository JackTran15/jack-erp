import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SalesOrderStatus } from '../entities/sales-order.entity';
import {
  SalesOrderHistory,
  SalesOrderHistoryEntry,
  SalesOrderHistoryKind,
} from '../sales-order-history.service';

/**
 * Hình dạng trả về của `GET .../sales-orders/:id/history` — CHỈ để OpenAPI mô
 * tả đúng (service trả interface). `implements` giữ lớp này khớp với
 * {@link SalesOrderHistoryEntry}: thêm trường ở service mà quên ở đây là lỗi
 * biên dịch.
 */
export class SalesOrderHistoryEntryResponseDto implements SalesOrderHistoryEntry {
  @ApiProperty({ format: 'date-time', description: 'ISO 8601 (UTC)' })
  at: string;

  @ApiProperty({ enum: SalesOrderHistoryKind, enumName: 'SalesOrderHistoryKind' })
  kind: SalesOrderHistoryKind;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Tên người làm; với "Nhận đơn" của đơn web là tên kênh. `null` khi không tra được.',
  })
  actorName: string | null;

  @ApiPropertyOptional({ description: 'Chi nhánh liên quan tới mốc này' })
  branchName?: string;

  @ApiPropertyOptional({ description: 'Chỉ có ở "Phân đơn" khi phân lại từ chi nhánh khác' })
  fromBranchName?: string;

  @ApiPropertyOptional()
  reason?: string;

  @ApiPropertyOptional({ description: 'Chỉ có ở "Thu ngân xử lý"' })
  invoiceCode?: string;

  @ApiProperty({ description: 'Trạng thái hiển thị sau mốc này (tiếng Việt)' })
  statusAfter: string;
}

export class SalesOrderHistoryResponseDto implements SalesOrderHistory {
  @ApiProperty({ format: 'uuid' })
  orderId: string;

  @ApiProperty()
  orderCode: string;

  @ApiProperty({ enum: SalesOrderStatus })
  currentStatus: SalesOrderStatus;

  @ApiProperty({ type: [SalesOrderHistoryEntryResponseDto] })
  entries: SalesOrderHistoryEntryResponseDto[];
}
