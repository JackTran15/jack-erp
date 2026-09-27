import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

/** Giới hạn id mỗi lượt batch (ADR-07) — một trang lưới tối đa 100 dòng. */
export const SALES_ORDER_BATCH_MAX_IDS = 100;

/** Body của các action batch trên `/mobile/sales-orders` (ADR-07), vd `POST process`. */
export class BatchSalesOrderDto {
  @ApiProperty({ type: [String], format: 'uuid', minItems: 1, maxItems: SALES_ORDER_BATCH_MAX_IDS })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(SALES_ORDER_BATCH_MAX_IDS)
  @IsUUID('4', { each: true })
  ids: string[];
}

/** Kết quả của MỘT đơn trong batch — lỗi từng đơn nằm ở đây, không ném (ADR-07). */
export class SalesOrderBatchResultDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty()
  ok: boolean;

  /** Mã lỗi máy đọc (vd `NO_OPEN_SESSION`, `ORDER_NOT_PROCESSABLE`); vắng khi `ok` hoặc lỗi không mang mã. */
  @ApiPropertyOptional({ example: 'ORDER_NOT_PROCESSABLE' })
  code?: string;

  /** Lý do hiển thị (tiếng Việt); vắng khi `ok`. */
  @ApiPropertyOptional()
  message?: string;
}

/** HTTP 200 kể cả khi có đơn lỗi; 4xx chỉ cho lỗi cả request (validate, quyền). */
export class SalesOrderBatchResponseDto {
  @ApiProperty({ type: [SalesOrderBatchResultDto] })
  results: SalesOrderBatchResultDto[];
}
