import { ApiProperty } from '@nestjs/swagger';

/**
 * Một giá trị của chiều thuộc tính.
 *
 * **HAI trường, và chúng KHÁC nhau** — đây là chỗ dễ nhầm nhất của cả đường
 * này. `label` là thứ người dùng đọc (`Đen`, `Nâu`); `codeSuffix` là thứ được
 * ghép vào MÃ biến thể khi `VariantGenerationService` sinh mã (`ABA2777-D-38`).
 *
 * App lọc danh mục bằng cách so hậu tố của MÃ, nên nó cần `codeSuffix`; chip
 * thì bày `label`. Lấy nhầm một cái cho cả hai việc là một bộ lọc luôn rỗng mà
 * không báo lỗi gì.
 *
 * `codeSuffix` NULL là hợp lệ: cột cho phép null, và một chiều thuộc tính không
 * tham gia sinh mã thì không có hậu tố. App tự bỏ các giá trị đó khỏi chip lọc.
 */
export class MobileProductAttributeValueDto {
  @ApiProperty({ description: 'Nhãn hiển thị — `product_attribute_options.value_label`' })
  label!: string;

  @ApiProperty({
    nullable: true,
    description: 'Hậu tố ghép vào mã biến thể — `product_attribute_options.code_suffix`',
  })
  codeSuffix!: string | null;
}

/** Một chiều thuộc tính của cả DANH MỤC — vd `Màu sắc`, `Size`. */
export class MobileProductAttributeDto {
  @ApiProperty({ description: 'Tên chiều — vd `Màu sắc`, `Size`' })
  name!: string;

  @ApiProperty({ type: [MobileProductAttributeValueDto] })
  values!: MobileProductAttributeValueDto[];
}
