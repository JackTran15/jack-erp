import { ApiProperty } from '@nestjs/swagger';

/**
 * Một biến thể của mặt hàng trong kỳ — khớp `InventoryVariantEntity` phía
 * Dart. `quantity` là tồn CUỐI kỳ (đến hết `asOf`), ba số còn lại theo kỳ
 * đầu tháng -> `asOf`; bất biến `openingQuantity + periodIn - periodOut ==
 * quantity` giữ được vì cả bốn đọc từ cùng một CTE.
 */
export class MobileInventoryVariantResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Id item' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  unit!: string;

  @ApiProperty({ description: 'Tồn cuối kỳ, có thể ÂM' })
  quantity!: number;

  @ApiProperty({ description: 'Giá trị tồn theo giá vốn sổ cái, đơn vị đồng' })
  stockValue!: number;

  @ApiProperty({ description: 'Tồn đầu kỳ (đầu tháng của asOf)' })
  openingQuantity!: number;

  @ApiProperty({ description: 'Số lượng nhập trong kỳ' })
  periodIn!: number;

  @ApiProperty({ description: 'Số lượng xuất trong kỳ' })
  periodOut!: number;
}

/** Một loại bút toán trong một chiều của luồng — khớp `InventoryFlowLineEntity`. */
export class MobileInventoryFlowLineDto {
  @ApiProperty({ description: 'Nhãn tiếng Việt của loại chứng từ (REFERENCE_TYPE_LABELS)' })
  name!: string;

  @ApiProperty({ description: 'Số lượng, luôn DƯƠNG — chiều nằm ở phía chứa nó' })
  quantity!: number;

  @ApiProperty({ description: 'Giá trị, luôn DƯƠNG, đơn vị đồng' })
  value!: number;
}

/** Một chiều (nhập hoặc xuất) của luồng — khớp `InventoryFlowEntity`. */
export class MobileInventoryFlowSideDto {
  @ApiProperty()
  quantity!: number;

  @ApiProperty()
  value!: number;

  @ApiProperty({
    type: [MobileInventoryFlowLineDto],
    description: 'CHỈ những loại có bút toán trong kỳ ở chiều này; rỗng = không phát sinh',
  })
  lines!: MobileInventoryFlowLineDto[];
}

/**
 * Luồng nhập/xuất của một mặt hàng (hoặc một biến thể) tại MỘT cửa hàng —
 * khớp `InventoryStoreFlowEntity` phía Dart. Danh sách phiếu KHÔNG ở đây: nó
 * phân trang và có bộ lọc riêng, đi đường `/vouchers`.
 */
export class MobileInventoryFlowResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Id chi nhánh' })
  storeId!: string;

  @ApiProperty({ description: 'Tồn đầu kỳ' })
  openingQuantity!: number;

  @ApiProperty({ description: 'Tồn cuối kỳ — bằng số trên thẻ cửa hàng của cùng mặt hàng' })
  closingQuantity!: number;

  @ApiProperty({ type: MobileInventoryFlowSideDto })
  inbound!: MobileInventoryFlowSideDto;

  @ApiProperty({ type: MobileInventoryFlowSideDto })
  outbound!: MobileInventoryFlowSideDto;
}

/**
 * Chứng từ mà app MỞ ĐƯỢC từ một dòng phiếu — chỉ phiếu nhập/xuất kho
 * (`/mobile/stock-documents/:id?kind=`). `kind` là đúng giá trị
 * `MobileStockDocumentKind` mà màn chi tiết của app cần: phiếu nhập
 * `purpose = PURCHASE` là `goods-receipt`, purpose khác là `stock-in`.
 */
export class MobileInventoryVoucherDocumentDto {
  @ApiProperty({ enum: ['goods-receipt', 'stock-in', 'stock-out'] })
  kind!: 'goods-receipt' | 'stock-in' | 'stock-out';

  @ApiProperty({ format: 'uuid' })
  id!: string;
}

/**
 * Một phiếu trên thẻ kho của app — khớp `InventoryVoucherEntity` phía Dart.
 *
 * Một "phiếu" = các bút toán của cùng chứng từ tại cùng KHO gộp lại
 * (`reference_type` + `reference_id` + `storage`). Chứng từ đụng hai kho của
 * cùng cửa hàng ra HAI dòng — đúng thứ màn lọc theo kho cần. Loại không có
 * bảng chứng từ (tồn ban đầu, điều chỉnh khi nhập dữ liệu) không có
 * `reference_id`, nên mọi bút toán cùng loại ở một kho gộp thành một dòng
 * mang nhãn loại làm `code`.
 */
export class MobileInventoryVoucherResponseDto {
  @ApiProperty({ description: 'Khoá dòng: `<reference_type>:<reference_id|none>:<storage_id>`' })
  id!: string;

  @ApiProperty({ enum: ['inbound', 'outbound'], description: 'Chiều theo DẤU của tổng số lượng' })
  direction!: 'inbound' | 'outbound';

  @ApiProperty({ format: 'uuid' })
  warehouseId!: string;

  @ApiProperty()
  warehouseName!: string;

  @ApiProperty({ description: 'Số chứng từ; không có thì là nhãn loại chứng từ' })
  code!: string;

  @ApiProperty({ description: 'ISO-8601 — thời điểm ghi sổ sớm nhất của phiếu' })
  date!: string;

  @ApiProperty({ description: 'Số lượng TUYỆT ĐỐI' })
  quantity!: number;

  @ApiProperty()
  unit!: string;

  @ApiProperty({ description: 'Giá trị TUYỆT ĐỐI, đơn vị đồng' })
  value!: number;

  @ApiProperty({
    nullable: true,
    type: MobileInventoryVoucherDocumentDto,
    description:
      'Chứng từ mở được từ app; NULL với hoá đơn, phiếu chuyển, tồn đầu kỳ… — app hiện toast thay vì mở',
  })
  document!: MobileInventoryVoucherDocumentDto | null;
}

/** Một trang phiếu; hai tổng là của TOÀN tập khớp bộ lọc (cùng lý do trang mặt hàng). */
export class MobileInventoryVoucherPageDto {
  @ApiProperty({ type: [MobileInventoryVoucherResponseDto] })
  data!: MobileInventoryVoucherResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty({ description: 'Tổng số lượng tuyệt đối toàn tập khớp' })
  totalQuantity!: number;

  @ApiProperty({ description: 'Tổng giá trị tuyệt đối toàn tập khớp, đơn vị đồng' })
  totalValue!: number;
}
