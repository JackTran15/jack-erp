import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Cờ BA TRẠNG THÁI: `undefined` = không lọc, `true`/`false` = lọc.
 *
 * KHÁC `inStockOnly` của `MobileSalesItemListQueryDto`, vốn ép mọi giá trị lạ
 * về `false` — cờ đó chỉ có hai trạng thái nên làm vậy là đúng. Ở đây "không
 * lọc" là một trạng thái RIÊNG, nên nuốt giá trị lạ thành `false` sẽ lặng lẽ
 * đổi "Tất cả" thành "Ngừng kinh doanh".
 *
 * Giá trị không đọc được thì trả NGUYÊN VĂN để `@IsBoolean` bắt và ném 400,
 * chứ không trả `undefined`: `?isActive=xyz` là lỗi ở client, và im lặng trả
 * về toàn bộ danh sách là giấu nó đi.
 */
const parseTriStateBool = ({ value }: { value: unknown }): unknown => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;

  const normalized = String(value).toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;

  return value;
};

/**
 * Tiêu chí sắp xếp do SERVER quyết, không phải client.
 *
 * App có một thanh "Sắp xếp theo" với đúng ba lựa chọn này. Khi server phân
 * trang thì sắp lại ở client là SAI: một mặt hàng ở trang 2 có thể phải đứng
 * trước cả trang 1.
 *
 * CHỈ có tiêu chí, KHÔNG có chiều — màn hình không có nút đảo chiều, và thêm
 * một trục nữa vào đây là thêm một tổ hợp không ai bấm tới. Ngày nào app có
 * nút đảo chiều thì mở rộng ở đây trước.
 */
export enum MobileProductSort {
  NAME = 'name',
  CODE = 'code',
  SELLING_PRICE = 'sellingPrice',
}

export class MobileProductListQueryDto {
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

  @ApiPropertyOptional({
    enum: MobileProductSort,
    default: MobileProductSort.NAME,
  })
  @IsOptional()
  @IsEnum(MobileProductSort)
  sort?: MobileProductSort = MobileProductSort.NAME;

  /**
   * Tìm theo mã hoặc tên của MẪU MÃ đã gộp.
   *
   * Chỉ hai cột đó, dù CTE còn phơi ra `barcode`: mã vạch là đường của máy quét
   * (app có nút quét riêng), gộp nó vào ô gõ tay thì một chuỗi số dài lọt vào
   * đây sẽ khớp những dòng người dùng không hiểu vì sao lại hiện.
   *
   * KHÔNG bỏ dấu — xem ghi chú ở [MobileSupplierListQueryDto.search].
   */
  @ApiPropertyOptional({ description: 'Tìm theo mã hoặc tên', example: 'ABA' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  /**
   * Chỉ giữ hàng thuộc MỘT nhóm hàng hoá (`items.category_id`).
   *
   * Nhóm lấy từ `GET /mobile/item-categories/tree`. Bỏ trống = *Tất cả nhóm*.
   *
   * **Lọc theo ĐÚNG nhóm đó, KHÔNG gồm nhóm con** — cùng luật với
   * `MobileSalesItemListQueryDto.categoryId`, và cố ý khác
   * `MobileInventoryProductListQueryDto.categoryId` (bên đó gồm cả cây con).
   * Hai màn hỏi hai câu khác nhau: màn tồn kho hỏi "kho còn gì dưới nhánh
   * này", còn màn danh mục hỏi "những hàng nào ĐƯỢC XẾP vào nhóm này".
   *
   * Mặt hàng thật luôn gắn vào nhóm LÁ, nên khác biệt chỉ lộ ra khi người dùng
   * chọn một nhóm cha.
   */
  @ApiPropertyOptional({ format: 'uuid', description: 'Lọc theo nhóm hàng hoá' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /**
   * Lọc theo trạng thái kinh doanh. Bỏ trống = *Tất cả*.
   *
   * **Mặc định KHÔNG lọc, và đó là chủ ý** — [MobileProductService.list] đã ghi
   * lý do: đây là màn quản lý danh mục, một mặt hàng biến mất khỏi danh sách
   * thì người dùng không còn đường nào tìm lại nó. Web cũng gửi
   * `includeInactive: true`.
   *
   * **Cạm bẫy của `true`:** nhánh mẫu mã của CTE tính `bool_and(i.is_active)`,
   * nên một mẫu mã mười biến thể chỉ cần MỘT biến thể ngừng kinh doanh là cả
   * mẫu mã rơi khỏi `isActive = true`. Đây là cùng cột mà web lọc, nên hai bên
   * vẫn khớp nhau — đừng "sửa cho hợp lý" bằng `bool_or`.
   */
  @ApiPropertyOptional({
    description: 'true = đang kinh doanh, false = ngừng, bỏ trống = tất cả',
  })
  @IsOptional()
  @Transform(parseTriStateBool)
  @IsBoolean()
  isActive?: boolean;
}
