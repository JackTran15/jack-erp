import { ApiProperty } from '@nestjs/swagger';

/**
 * Tồn kho của một mẫu mã, cho màn **Chi tiết hàng hoá** của app bán hàng.
 *
 * Uỷ quyền cho `PosCatalogProductService` — nơi DUY NHẤT tính các con số này. Viết lại phép tính
 * dưới `/mobile` là dựng bộ số thứ hai cho cùng một câu hỏi, và hai bên sẽ lệch mà không có gì báo.
 *
 * **Thu hẹp có chủ đích so với `PosProductDetailDto`.** Bản POS còn trả `locations[]`,
 * `sellableQuantity`, `mainShowroomQuantity`, `imageUrl`, `purchasePrice` — app bán hàng không
 * dùng thứ nào, và mọi DTO `/mobile` đều giữ đúng ranh giới đó (có test khoá *"trả ĐÚNG năm
 * trường — không rò giá bán, cân nặng, chất liệu"*). Cho app gọi thẳng đường POS là vứt bỏ chính
 * ranh giới ấy.
 */
export class MobileStorageStockDto {
  @ApiProperty({ format: 'uuid' })
  storageId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Tồn của mặt hàng trong kho này. CÓ THỂ là 0 — xem ghi chú ở dưới.' })
  quantity!: number;
}

/**
 * Một chi nhánh KHÁC chi nhánh đang làm việc, kèm các kho của nó.
 *
 * Chỉ chi nhánh CÒN HÀNG mới có mặt. Khác hẳn `storages` của chi nhánh hiện tại — ở đó kho tồn 0
 * vẫn bày, vì câu hỏi là *"lấy ở đâu trong cửa hàng này"*; ở đây câu hỏi là *"cửa hàng nào còn
 * hàng"*, và liệt kê cả công ty với một dãy số 0 là chôn mất vài cái thật sự có.
 */
export class MobileBranchStockDto {
  @ApiProperty({ format: 'uuid' })
  branchId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Tổng tồn của mặt hàng tại chi nhánh này.' })
  quantity!: number;

  @ApiProperty({ type: [MobileStorageStockDto] })
  storages!: MobileStorageStockDto[];
}

/** Tồn của MỘT biến thể, dưới ba chiều mà màn chi tiết cần. */
export class MobileVariantStockDto {
  @ApiProperty({ format: 'uuid', description: '`items.id`' })
  itemId!: string;

  @ApiProperty({ description: 'Tồn tại chi nhánh ĐANG LÀM VIỆC, cộng qua mọi kho của nó.' })
  quantity!: number;

  @ApiProperty({
    type: [MobileStorageStockDto],
    description:
      'Mọi kho đang hoạt động của chi nhánh hiện tại, **kể cả kho tồn 0** — vắng mặt đọc thành ' +
      '"không có kho đó". Kho chính đứng đầu.',
  })
  storages!: MobileStorageStockDto[];

  @ApiProperty({ type: [MobileBranchStockDto] })
  otherBranches!: MobileBranchStockDto[];
}

export class MobileSalesModelStockDto {
  @ApiProperty({ format: 'uuid', description: '`products.id`' })
  productId!: string;

  @ApiProperty({ type: [MobileVariantStockDto] })
  variants!: MobileVariantStockDto[];
}
