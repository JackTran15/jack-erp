import { ApiProperty } from '@nestjs/swagger';

/**
 * Một biến thể của mẫu mã, theo hình dạng bảng "THUỘC TÍNH" của app vẽ ra:
 * nhãn phân loại, giá mua, giá bán — cộng mã và khoá định danh.
 *
 * Cố ý KHÔNG trả `unit`, `weightGram`, `barcode`…: chúng là dữ liệu của MẪU MÃ
 * (lấy ở item đại diện, xem [MobileProductDetailResponseDto]) và lặp lại ở từng
 * biến thể chỉ làm phình response với mẫu mã nhiều size.
 *
 * [color] và [size] là NGOẠI LỆ có khai báo của câu trên, và chúng phục vụ màn
 * SỬA chứ không phải màn chi tiết: form phải dựng lại đúng các chip
 * `Màu sắc`/`Size` người dùng đã gõ, mà [variantLabel] là chuỗi ĐÃ GHÉP nên
 * tách ngược không an toàn — một giá trị chip tự chứa dấu ngăn cách là hỏng.
 * Cũng là lý do hai trường này rời nhau chứ không gộp: khoá biến thể ở
 * `ItemCrudService` là `${color}__${size}`, hai vế độc lập.
 */
export class MobileProductVariantDto {
  @ApiProperty({ format: 'uuid', description: 'id của item biến thể' })
  id!: string;

  @ApiProperty({ description: 'Mã SKU của biến thể' })
  code!: string;

  @ApiProperty({
    nullable: true,
    description:
      'Nhãn phân loại đã ghép sẵn, vd "39 · Nâu". `null` khi biến thể không ' +
      'mang thuộc tính nào — app lùi về `code`.',
  })
  variantLabel!: string | null;

  @ApiProperty({ description: 'Giá mua của riêng biến thể này' })
  purchasePrice!: number;

  @ApiProperty({ description: 'Giá bán của riêng biến thể này' })
  sellingPrice!: number;

  @ApiProperty({
    nullable: true,
    description:
      'Giá trị thuộc tính `Color` của biến thể, vd "Nâu". `null` khi mẫu mã ' +
      'không khai chiều màu sắc',
  })
  color!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Giá trị thuộc tính `Size`, vd "39". `null` như [color]',
  })
  size!: string | null;
}

/**
 * Chi tiết một hàng hoá cho màn chi tiết của app mobile.
 *
 * `id` nhận vào là id HỖN HỢP mà `GET /mobile/products` trả: id của mẫu mã
 * (`products.id`) hoặc id của item lẻ (`items.id`, item không thuộc mẫu mã
 * nào). Server tự phân giải qua cột `type` của CTE `combined` — app không cần
 * biết và không cần gửi thêm gì. Đây là lý do `MobileProductResponseDto` không
 * còn phải trả `type` như docblock cũ của nó từng dự tính.
 *
 * Hai nhóm trường lấy từ HAI nguồn khác nhau, và đó là chủ ý:
 *
 * - `code`, `name`, `isActive`, `purchasePrice`, `sellingPrice` lấy từ CTE
 *   `combined` — CÙNG câu lệnh với danh sách, nên con số ở màn chi tiết khớp
 *   con số ở màn danh sách. Với mẫu mã: giá là TRUNG BÌNH các biến thể,
 *   `isActive` là `bool_and` (MỘT biến thể ngừng kinh doanh là cả mẫu mã hiện
 *   "Ngừng kinh doanh"). Không đổi luật đó ở đây: web lọc theo cùng cột.
 * - `categoryName`, `unit`, `weightGram`, `lengthCm`, `widthCm`, `heightCm`
 *   lấy từ ITEM ĐẠI DIỆN — item có `code` nhỏ nhất của mẫu mã (item lẻ thì là
 *   chính nó). `products` không có các cột này; chúng sống ở từng item và
 *   thực tế giống nhau giữa các biến thể của một mẫu mã.
 *
 * **`purchasePrice` (giá vốn) CỐ Ý có mặt ở đây** dù `MobileProductResponseDto`
 * của danh sách cố ý giấu nó: màn chi tiết vẽ ô "Giá mua" và bảng biến thể có
 * cột "Giá mua". Cùng quyền `inventory.read` nhìn được nó ở web. Đừng "sửa cho
 * khớp danh sách".
 */
export class MobileProductDetailResponseDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Đúng giá trị id mà `GET /mobile/products` trả cho dòng này: id của mẫu ' +
      'mã, hoặc id của item nếu nó không thuộc mẫu mã nào',
  })
  id!: string;

  @ApiProperty({
    description:
      'Mã hàng hoá. Mẫu mã không có mã riêng thì lùi về tên, rồi về mã nhỏ ' +
      'nhất của các biến thể — cùng luật với danh sách',
  })
  code!: string;

  @ApiProperty({ description: 'Tên hàng hoá' })
  name!: string;

  @ApiProperty({
    description:
      'Đang kinh doanh hay không. Mẫu mã: false khi có ÍT NHẤT một biến thể ' +
      'ngừng kinh doanh',
  })
  isActive!: boolean;

  @ApiProperty({
    nullable: true,
    description: 'Tên nhóm hàng hoá. `null` = chưa xếp nhóm',
  })
  categoryName!: string | null;

  /**
   * Định danh nhóm hàng, cặp với [categoryName].
   *
   * Màn chi tiết chỉ cần cái TÊN, nhưng màn SỬA cần cái ID: danh mục thật có
   * HAI nhóm con cùng tên `Nón`, nên tra ngược từ tên là chọn nhầm một trong
   * hai. Thiếu trường này thì mở màn chọn nhóm từ một hàng hoá đang có nhóm sẽ
   * không dòng nào được tô sẵn.
   */
  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Id nhóm hàng hoá — thứ màn Sửa cần. `null` = chưa xếp nhóm',
  })
  categoryId!: string | null;

  @ApiProperty({ description: 'Đơn vị tính cơ bản' })
  unit!: string;

  @ApiProperty({
    description:
      'Giá mua (giá vốn). Mẫu mã: trung bình các biến thể — khớp danh sách',
  })
  purchasePrice!: number;

  @ApiProperty({
    description: 'Giá bán. Mẫu mã: trung bình các biến thể — khớp danh sách',
  })
  sellingPrice!: number;

  @ApiProperty({ nullable: true, description: 'Trọng lượng (g). `null` = chưa nhập' })
  weightGram!: number | null;

  @ApiProperty({ nullable: true, description: 'Chiều dài (cm). `null` = chưa nhập' })
  lengthCm!: number | null;

  @ApiProperty({ nullable: true, description: 'Chiều rộng (cm). `null` = chưa nhập' })
  widthCm!: number | null;

  @ApiProperty({ nullable: true, description: 'Chiều cao (cm). `null` = chưa nhập' })
  heightCm!: number | null;

  /**
   * Mã vạch của item ĐẠI DIỆN, không phải của cả mẫu mã.
   *
   * Một item có thể mang NHIỀU mã vạch (`item_barcodes` không có cờ "chính"),
   * còn form của app có đúng MỘT ô. Trả cái đầu tiên theo `created_at` rồi
   * `code` — thứ tự ổn định, và là cái người dùng nhập trước.
   *
   * Hệ quả phải biết: lưu lại từ app sẽ THAY cả tập mã vạch bằng đúng giá trị
   * trong ô đó. Mất mã vạch thứ hai là có thật, nhưng app không có chỗ nào bày
   * chúng ra để giữ — đổi lại một ô trống ở đây sẽ XOÁ sạch, còn tệ hơn.
   */
  @ApiProperty({
    nullable: true,
    description: 'Mã vạch đầu tiên của item đại diện. `null` = chưa có',
  })
  barcode!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Mô tả. `null` = chưa nhập',
  })
  description!: string | null;

  @ApiProperty({
    description:
      'Có hiện trên màn bán hàng (POS) không. Mẫu mã: `bool_and` các biến thể, ' +
      'cùng luật với [isActive]',
  })
  isPosVisible!: boolean;

  @ApiProperty({
    type: [MobileProductVariantDto],
    description:
      'Các biến thể, xếp theo mã. RỖNG với item lẻ — app ẩn bảng thuộc tính',
  })
  variants!: MobileProductVariantDto[];
}
