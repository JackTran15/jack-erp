import { ApiProperty } from '@nestjs/swagger';
import { MobileStockDocumentLineDto } from './mobile-stock-document-detail.response.dto';

/**
 * Một lệnh điều chuyển đang chờ cửa hàng hiện tại nhập.
 *
 * **HAI số chứng từ, và app hiển thị số của PHIẾU XUẤT**: [documentNumber] là mã
 * của lệnh điều chuyển (`LDC…`), còn [exportDocumentNumber] là mã phiếu xuất kho
 * mà cửa hàng nguồn đã lập (`PX…`). Trang web bày ra cái thứ hai vì đó là tờ
 * giấy người nhận hàng đang cầm; app theo đúng vậy, và lùi về cái thứ nhất khi
 * nó vắng.
 *
 * Cố ý KHÔNG trả:
 *
 * - `status` và `importGoodsReceiptId` — vị từ "chờ nhập" đã lọc sẵn ở server,
 *   nên mọi dòng ra tới đây đều cùng một trạng thái; bày thêm một cột luôn giống
 *   nhau là bày một thứ không phân biệt được gì.
 * - `counterpartyName` — app không vẽ đối tượng ở màn chọn chứng từ.
 * - `exportGoodsIssueId` — app điều hướng bằng [id] của lệnh, và đường ghi cũng
 *   chỉ nhận [id]. Trả thêm một định danh không ai gửi lại là mời gọi dùng sai.
 */
export class MobileTransferOrderResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Định danh LỆNH điều chuyển — thứ gửi lại khi lưu phiếu' })
  id!: string;

  @ApiProperty({ description: 'Mã lệnh điều chuyển (`LDC…`)' })
  documentNumber!: string;

  @ApiProperty({
    nullable: true,
    description:
      'Mã phiếu XUẤT KHO của cửa hàng nguồn — thứ app hiển thị. NULL khi phiếu ' +
      'xuất chưa được ghi sổ; khi đó app lùi về `documentNumber`.',
  })
  exportDocumentNumber!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Ngày của lệnh — `requestedDate` nếu có, không thì ngày lập. ISO-8601.',
  })
  documentDate!: string | null;

  @ApiProperty({ format: 'uuid' })
  sourceBranchId!: string;

  @ApiProperty({ description: 'Tên cửa hàng nguồn — server đã tra sẵn, app không phải tra lại' })
  sourceBranchName!: string;

  @ApiProperty({ nullable: true, description: 'Lý do / diễn giải của lệnh' })
  note!: string | null;

  @ApiProperty({ description: 'Tổng thành tiền của phiếu xuất nguồn' })
  totalAmount!: number;

  /**
   * Dòng hàng của lệnh.
   *
   * Dùng CHUNG `MobileStockDocumentLineDto` với chứng từ kho — không phải cho
   * gọn, mà vì đây LÀ cùng một khái niệm: chọn một lệnh xong thì app thay dòng
   * hàng của phiếu bằng đúng danh sách này. Hai hình dạng riêng nghĩa là phía
   * Dart phải có hai parser rồi một phép chuyển đổi giữa chúng, cho một tập
   * trường trùng khít.
   */
  @ApiProperty({ type: [MobileStockDocumentLineDto] })
  lines!: MobileStockDocumentLineDto[];
}

/**
 * Một trang lệnh điều chuyển. `limit` chứ không `pageSize` — gương theo
 * `/mobile/stock-documents` và mọi đường `/mobile/**` khác.
 */
export class MobileTransferOrderPageDto {
  @ApiProperty({ type: [MobileTransferOrderResponseDto] })
  data!: MobileTransferOrderResponseDto[];

  @ApiProperty({ description: 'Tổng số lệnh khớp bộ lọc, không phải số lệnh của trang' })
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
