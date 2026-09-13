import { ApiProperty } from '@nestjs/swagger';

/**
 * Một dòng của báo cáo tồn kho theo mặt hàng — khớp `InventoryProductEntity`
 * phía Dart.
 *
 * `id` là khoá HỖN HỢP như `/mobile/products`: với `level=product` là id của
 * mẫu mã (hoặc id của item nếu nó không thuộc mẫu mã nào), với
 * `level=variant` là id của item. Màn drill-down sau này đưa thẳng `id` này
 * vào `GET /mobile/inventory/products/:id/variants` mà không cần mang `level`.
 *
 * Cố ý KHÔNG trả `openingQty`/`inQty`/`outQty`: màn danh sách chỉ vẽ số tồn
 * và giá trị; ba số kia thuộc màn biến thể (lượt sau) và tính theo KỲ, một
 * trục mà màn này không có.
 */
export class MobileInventoryProductResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Mã hàng hoá (SKU)' })
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Đơn vị tính; mẫu mã lấy của item đại diện' })
  unit!: string;

  @ApiProperty({ description: 'Số lượng tồn tính đến hết ngày `asOf`, có thể ÂM' })
  quantity!: number;

  @ApiProperty({ description: 'Giá trị tồn theo giá vốn sổ cái, đơn vị đồng' })
  stockValue!: number;

  @ApiProperty({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'Nhóm hàng của item (mẫu mã: của item đại diện). NULL = chưa xếp nhóm.',
  })
  groupId!: string | null;
}

/**
 * Một trang mặt hàng. Hai tổng là của TOÀN tập khớp bộ lọc, không phải của
 * trang — thanh "Tổng" của app đứng trên một danh sách cuộn vô tận, cộng các
 * trang đã nạp là cho ra một con số đổi theo lượt cuộn.
 */
export class MobileInventoryProductPageDto {
  @ApiProperty({ type: [MobileInventoryProductResponseDto] })
  data!: MobileInventoryProductResponseDto[];

  @ApiProperty({ description: 'Tổng số dòng khớp, không phải số dòng của trang' })
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty({ description: 'Tổng số lượng toàn tập khớp' })
  totalQuantity!: number;

  @ApiProperty({ description: 'Tổng giá trị toàn tập khớp, đơn vị đồng' })
  totalValue!: number;
}

/**
 * Một kho của cửa hàng — khớp `InventoryWarehouseEntity` phía Dart. `id` đi
 * kèm dù app hiện chưa đọc: màn lọc chứng từ theo kho (lượt sau) sẽ cần, và
 * thêm sau là đổi hợp đồng một lần nữa.
 */
export class MobileInventoryStorageDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Số lượng tồn của kho tính đến hết ngày `asOf`' })
  quantity!: number;
}

/**
 * Thẻ tồn kho của một cửa hàng — khớp `InventoryStoreEntity` phía Dart.
 *
 * `periodIn`/`periodOut` là SỐ LƯỢNG nhập/xuất trong kỳ, kỳ = từ đầu tháng
 * của `asOf` đến hết `asOf`. Số lượng chứ không phải tiền: thẻ của app đặt
 * hai con số này cạnh số tồn, cùng đơn vị mới so được với nhau.
 *
 * `storages` liệt kê MỌI kho đang hoạt động của cửa hàng, kể cả kho tồn 0 —
 * một kho trống là thông tin, không phải thứ cần giấu.
 */
export class MobileInventoryStoreResponseDto {
  @ApiProperty({ format: 'uuid', description: 'Id chi nhánh' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'Tổng tồn mọi kho của cửa hàng, có thể ÂM' })
  quantity!: number;

  @ApiProperty({ description: 'Giá trị tồn theo giá vốn sổ cái, đơn vị đồng' })
  stockValue!: number;

  @ApiProperty({ description: 'Số lượng nhập trong kỳ (đầu tháng của asOf -> asOf)' })
  periodIn!: number;

  @ApiProperty({ description: 'Số lượng xuất trong kỳ' })
  periodOut!: number;

  @ApiProperty({ type: [MobileInventoryStorageDto] })
  storages!: MobileInventoryStorageDto[];
}
