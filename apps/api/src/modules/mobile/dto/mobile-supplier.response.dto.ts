import { ApiProperty } from '@nestjs/swagger';

/**
 * Nhà cung cấp theo hình dạng app mobile đọc được.
 *
 * Mười một trường này khớp ĐÚNG `SupplierEntity` phía Dart, nên `SupplierModel`
 * chỉ là phép chép thẳng và entity không phải đổi. Ba lệch được nắn ở đây:
 * `isActive` (bool) -> `status`, quan hệ `group` -> bộ ba
 * `groupId`/`groupCode`/`groupName`, còn `type` vốn đã trùng giá trị.
 *
 * `id` LÀ khoá định danh: `GET`/`PATCH :id` tra theo nó, và app điều hướng
 * bằng nó. Trước đây trường này cố ý bị giấu và `code` gánh vai đó — nhưng form
 * cho phép SỬA mã, nên khoá định danh lại là thứ đổi được: mỗi lần đổi mã là
 * một lần đường dẫn cũ chết. `id` là uuid bất biến nên hết hẳn lớp vấn đề đó.
 *
 * Vẫn cố ý KHÔNG trả `email`, `notes`, `maxDebt`, thông tin ngân hàng, liên hệ
 * và CMND — app không hiển thị chúng, và `maxDebt` còn là dữ liệu nhạy cảm về
 * công nợ.
 */
export class MobileSupplierResponseDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Khoá định danh bản ghi. BẤT BIẾN, khác `code` vốn sửa được',
  })
  id!: string;

  @ApiProperty({ description: 'Mã nhà cung cấp, duy nhất trong tổ chức' })
  code!: string;

  @ApiProperty({ description: 'Tên nhà cung cấp' })
  name!: string;

  @ApiProperty({ enum: ['active', 'inactive'], description: 'Còn theo dõi hay đã ngừng' })
  status!: 'active' | 'inactive';

  @ApiProperty({ enum: ['organization', 'individual'], description: 'Pháp nhân hay cá nhân' })
  type!: string;

  @ApiProperty({ nullable: true, description: 'null = chưa từng nhập' })
  address!: string | null;

  @ApiProperty({ nullable: true, description: 'null = chưa từng nhập' })
  phone!: string | null;

  @ApiProperty({ nullable: true, description: 'null = chưa từng nhập' })
  taxCode!: string | null;

  /**
   * Khoá GHI của nhóm — thứ mà `PATCH`/`POST` nhận lại qua `groupId`.
   *
   * Đọc từ CỘT `group_id`, không từ quan hệ `group`: cột luôn có, còn quan hệ
   * chỉ có khi lượt truy vấn nạp kèm nó. Nhờ vậy một đường quên `relations`
   * vẫn trả đúng `groupId`, và app vẫn tô đúng dòng trong picker.
   */
  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Khoá của nhóm NCC; null = chưa xếp nhóm',
  })
  groupId!: string | null;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Mã nhóm NCC; null = chưa xếp nhóm',
  })
  groupCode!: string | null;

  /**
   * Giữ [groupCode] lẫn [groupName] dù cả hai đều tra được từ danh mục: nhãn
   * app hiện là `MÃ - TÊN VIẾT HOA`, nên thiếu chúng là form Sửa phải nạp trọn
   * danh mục nhóm chỉ để dựng một chuỗi.
   */
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Tên nhóm NCC; null = chưa xếp nhóm',
  })
  groupName!: string | null;
}

/** Một trang nhà cung cấp. `limit` chứ không phải `pageSize` — gương theo v2 search. */
export class MobileSupplierPageDto {
  @ApiProperty({ type: [MobileSupplierResponseDto] })
  data!: MobileSupplierResponseDto[];

  @ApiProperty({ description: 'Tổng số bản ghi khớp, không phải số bản ghi của trang' })
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
