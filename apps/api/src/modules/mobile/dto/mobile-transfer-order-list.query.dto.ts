import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Lệnh điều chuyển mà cửa hàng đang chọn CÓ THỂ NHẬP — màn "Chọn chứng từ" của
 * app đọc đường này.
 *
 * "Có thể nhập" là một vị từ của backend, không phải của app: lệnh đã xuất ở cửa
 * hàng nguồn (`exportGoodsIssueId` khác null) nhưng chưa được nhập ở đích
 * (`importGoodsReceiptId` là null), và cửa hàng ĐÍCH đúng là cửa hàng đang chọn.
 * Xem `TransferOrderService.buildImportableWhere`.
 *
 * KHÔNG có tham số `destinationBranchId`: cửa hàng đích luôn là cửa hàng của
 * người gọi (`actor.branchId`) — nhận một lệnh về kho của người khác là vô nghĩa.
 * [branchId] ở đây chỉ để CHỌN cửa hàng đang làm việc, y hệt
 * `MobileStockDocumentListQueryDto.branchId`.
 */
export class MobileTransferOrderListQueryDto {
  /**
   * Cửa hàng đang làm việc — cũng là cửa hàng ĐÍCH của những lệnh trả về. Bỏ
   * trống thì lấy cửa hàng mặc định trong token.
   *
   * Phải đi qua query chứ không qua header `X-Branch-Id`: `@Actor` giải chi
   * nhánh theo thứ tự `jwt > header`, mà token luôn mang sẵn một `branchId`.
   * Cùng ràng buộc đã ghi ở `MobileStockDocumentListQueryDto`.
   */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  /**
   * Đầu kỳ, tính theo NGÀY LẬP lệnh (`createdAt`) — không phải `requestedDate`.
   *
   * Nhận `YYYY-MM-DD`. Cùng ràng buộc định dạng đã ghi ở
   * `MobileStockDocumentListQueryDto.from`.
   */
  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Cuối kỳ, BAO GỒM cả ngày này. Xem ghi chú ở [from]. */
  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @IsISO8601()
  to?: string;

  /**
   * Thu hẹp về MỘT cửa hàng nguồn — màn "Mục đích nhập kho" của app cho người
   * dùng chọn "Điều chuyển từ cửa hàng" trước, rồi chỉ bày ra chứng từ của cửa
   * hàng đó.
   *
   * Lọc ở tầng này chứ không đẩy xuống `listImportable`: vị từ đó không nhận
   * tham số nguồn, và nó vốn đã trả trọn danh sách nên lọc thêm trong bộ nhớ
   * không tốn một lượt truy vấn nào.
   */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sourceBranchId?: string;

  /**
   * Tìm theo SỐ CHỨNG TỪ hoặc TÊN CỬA HÀNG NGUỒN — một ô gõ, khớp chỗ nào cũng
   * tính, cùng khuôn `search` của mọi đường `/mobile/**`.
   *
   * Số chứng từ khớp cả số phiếu XUẤT của cửa hàng nguồn (thứ app hiển thị) lẫn
   * số của chính lệnh điều chuyển — người dùng đọc được cái nào thì gõ cái đó.
   *
   * KHÔNG bỏ dấu, y như các đường tìm kiếm khác.
   */
  @ApiPropertyOptional({ description: 'Tìm theo số chứng từ hoặc tên cửa hàng nguồn' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
