import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import type { StockCheckLineResult, StockCheckOrderResult } from '../stock-availability.service';

/** Tối đa một trang lưới Điều phối (limit của lưới là 100). */
export const STOCK_CHECK_MAX_ORDERS = 100;

export class StockCheckOrderRequestDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  orderId: string;

  /** Vắng = toàn chuỗi (dialog duyệt); có = tồn tại chi nhánh đó (Validate). */
  @ApiPropertyOptional({ format: 'uuid', description: 'Vắng = tồn toàn chuỗi' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

/** Body của `POST /admin/sales-orders/stock-check` (ADR-09). */
export class StockCheckDto {
  @ApiProperty({ type: [StockCheckOrderRequestDto], minItems: 1, maxItems: STOCK_CHECK_MAX_ORDERS })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(STOCK_CHECK_MAX_ORDERS)
  @ValidateNested({ each: true })
  @Type(() => StockCheckOrderRequestDto)
  orders: StockCheckOrderRequestDto[];
}

/**
 * Body của `POST /mobile/sales-orders/stock-check` (ADR-12). Không có `branchId`:
 * chi nhánh luôn là chi nhánh đang thao tác (A-44), và đơn chi nhánh khác bị bỏ qua.
 */
export class BranchStockCheckRequestDto {
  @ApiProperty({ type: [String], format: 'uuid', minItems: 1, maxItems: STOCK_CHECK_MAX_ORDERS })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(STOCK_CHECK_MAX_ORDERS)
  @IsUUID(undefined, { each: true })
  orderIds: string[];
}

/**
 * Hình dạng trả về — CHỈ để OpenAPI mô tả đúng; `implements` giữ nó khớp với
 * kết quả của `StockAvailabilityService.checkOrders`.
 */
export class StockCheckLineResponseDto implements StockCheckLineResult {
  @ApiProperty({ format: 'uuid' }) itemId: string;
  @ApiProperty() itemCode: string;
  @ApiProperty() itemName: string;
  @ApiProperty({ description: 'Tổng SL cần của món trong đơn (dòng trùng món đã gộp)' }) required: number;
  @ApiProperty({ description: 'Tồn thực tế trong phạm vi đối chiếu; có thể âm' }) available: number;
  @ApiProperty({ description: '`max(0, required - available)`; 0 = đủ' }) shortBy: number;
}

export class StockCheckOrderResponseDto implements StockCheckOrderResult {
  @ApiProperty({ format: 'uuid' }) orderId: string;
  @ApiProperty() orderCode: string;
  @ApiProperty({ type: String, nullable: true, description: '`null` = tồn toàn chuỗi' }) branchId: string | null;
  @ApiProperty() sufficient: boolean;
  @ApiProperty() shortLineCount: number;

  @ApiProperty({ type: [StockCheckLineResponseDto], description: 'Dòng đủ trước dòng thiếu' })
  lines: StockCheckLineResponseDto[];
}

export class StockCheckResponseDto {
  @ApiProperty({
    type: [StockCheckOrderResponseDto],
    description: 'Đã xếp: `shortLineCount` tăng dần, rồi mã đơn (A-39). Đơn ngoài tổ chức bị bỏ qua.',
  })
  orders: StockCheckOrderResponseDto[];
}
