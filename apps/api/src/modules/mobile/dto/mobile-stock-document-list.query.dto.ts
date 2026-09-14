import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
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
 * Loại chứng từ kho mà app hỏi tới.
 *
 * Enum này CHỈ khai những giá trị backend phục vụ được, và đó là chủ ý: một
 * giá trị lạ trả 400 ngay thay vì trả một danh sách rỗng khó hiểu.
 *
 * Cố ý KHÔNG có `purchase-return`. "Trả lại hàng mua" **không tồn tại** như một
 * chứng từ ở backend — grep toàn repo chỉ thấy nó là một CỘT trong báo cáo tồn
 * kho, không có bảng, không có màn nhập liệu. App giữ màn đó ở dạng "sắp có".
 *
 * Ba giá trị còn lại KHÔNG cùng một nguồn, dù client chỉ thấy một endpoint:
 *
 * - `goods-receipt` và `stock-in` cùng bảng `goods_receipts`, khác nhau đúng ở
 *   chỗ lọc `purpose` (mua hàng vs mọi thứ còn lại);
 * - `stock-out` là bảng `goods_issues` — endpoint khác, DTO khác, enum trạng
 *   thái khác, và **quyền khác**.
 *
 * Đó chính là lý do endpoint này tồn tại: app chỉ nói loại chứng từ nó cần, còn
 * việc dữ liệu nằm ở đâu là chuyện của server.
 */
export enum MobileStockDocumentKind {
  GOODS_RECEIPT = 'goods-receipt',
  STOCK_IN = 'stock-in',
  STOCK_OUT = 'stock-out',
}

/**
 * Loại chứng từ mà màn BỘ LỌC của app bày ra — nhóm "Trạng thái" ở màn Nhập kho
 * và "Loại chứng từ" ở màn Xuất kho.
 *
 * Enum RIÊNG chứ không phơi `GoodsReceiptPurpose`/`GoodsIssuePurpose` xuống
 * client, đúng lập luận vẫn đang giữ ở `MobileStockDocumentService.listReceipts`:
 * `purpose` là khái niệm nội bộ backend, để nó rò xuống Dart thì mọi lần backend
 * thêm một purpose là một lần app phải biết.
 *
 * Lớp enum này còn giải được một chuyện mà hai enum kia không giải được: cùng
 * một lựa chọn "Điều chuyển" của người dùng là `TRANSFER_IN` với phiếu nhập và
 * `TRANSFER_OUT` với phiếu xuất. App gửi MỘT giá trị, server tự phân giải theo
 * `kind` — cùng cách [MobileStockDocumentKind] giấu chuyện hai bảng.
 *
 * Kebab-case gương theo [MobileStockDocumentKind]. Đừng đổi sang camelCase cho
 * "giống `branchId`": phía Dart có bảng tra riêng khớp đúng các slug này, và
 * backend bật `forbidNonWhitelisted` nên lệch một chữ là 400 cho cả lượt gọi.
 *
 * Hai giá trị KHÔNG dùng được ở mọi `kind`: `sale` và `disposal` chỉ tồn tại ở
 * phiếu xuất. Gửi sai cặp là **400**, không phải một danh sách rỗng khó hiểu —
 * cùng chính sách mà [MobileStockDocumentKind] đang áp cho giá trị lạ.
 */
export enum MobileStockDocumentPurpose {
  /** `TRANSFER_IN` với phiếu nhập, `TRANSFER_OUT` với phiếu xuất. */
  TRANSFER = 'transfer',
  STOCK_TAKE = 'stock-take',
  /** Chỉ `stock-out`. */
  SALE = 'sale',
  /** Chỉ `stock-out`. */
  DISPOSAL = 'disposal',
  OTHER = 'other',
}

export class MobileStockDocumentListQueryDto {
  @ApiProperty({ enum: MobileStockDocumentKind })
  @IsEnum(MobileStockDocumentKind)
  kind!: MobileStockDocumentKind;

  /**
   * Lọc theo loại chứng từ. Bỏ trống = MỌI loại mà `kind` đó vốn chứa.
   *
   * KHÔNG nhận được với `kind=goods-receipt`: màn "Nhập hàng" theo định nghĩa
   * chỉ chứa phiếu mua hàng (`purposes: [PURCHASE]`), nên một tiêu chí lọc ở đó
   * là câu hỏi không có nghĩa. Gửi lên vẫn là **400** chứ không bị bỏ qua — bỏ
   * qua thì app tưởng mình đã lọc và người dùng đọc một danh sách sai.
   *
   * Phép kiểm cặp `kind` × `purpose` nằm ở `MobileStockDocumentService`, chỗ
   * duy nhất biết cả hai — `@IsEnum` ở đây chỉ chặn được giá trị lạ.
   */
  @ApiPropertyOptional({ enum: MobileStockDocumentPurpose })
  @IsOptional()
  @IsEnum(MobileStockDocumentPurpose)
  purpose?: MobileStockDocumentPurpose;

  /**
   * Cửa hàng cần xem. Bỏ trống thì lấy cửa hàng mặc định trong token.
   *
   * Phải đi qua query chứ không qua header `X-Branch-Id`: `@Actor` giải chi
   * nhánh theo thứ tự `jwt > header`, mà token luôn mang sẵn một `branchId`,
   * nên header bị bỏ qua hoàn toàn. Chi tiết ở `MobileStockDocumentService`.
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
   * Đầu kỳ, tính theo ngày NHẬN HÀNG (`receivedAt`).
   *
   * Nhận `YYYY-MM-DD` — và app nên gửi đúng dạng đó chứ đừng kèm giờ: bộ lọc
   * ngày của backend coi một mốc CÓ giờ là mốc chính xác, còn một mốc chỉ có
   * ngày thì tự nở ra trọn ngày. Gửi `2026-09-30T00:00:00` làm `to` sẽ cắt mất
   * mọi phiếu lập trong ngày 30.
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
   * Tìm theo SỐ PHIẾU hoặc TÊN ĐỐI TƯỢNG — một ô gõ, khớp cột nào cũng tính.
   *
   * Phiếu chưa ghi sổ không có số phiếu (`document_number` là NULL cho tới lúc
   * post), nên với chúng chỉ còn tên đối tượng bắt được. Đó là giới hạn của dữ
   * liệu chứ không phải của phép tìm.
   *
   * KHÔNG bỏ dấu — xem ghi chú ở [MobileSupplierListQueryDto.search].
   */
  @ApiPropertyOptional({
    description: 'Tìm theo số phiếu hoặc tên đối tượng',
    example: 'NK0001',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
