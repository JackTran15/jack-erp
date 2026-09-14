import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Chuỗi rỗng / toàn khoảng trắng -> `undefined` TRƯỚC khi validate.
 *
 * Form của app gửi `""` cho mọi ô người dùng không nhập, mà `@IsOptional` chỉ
 * bỏ qua `null`/`undefined` — không nắn thì một ô mã vạch để trống sẽ vấp
 * `@MaxLength` hay tệ hơn là được ghi xuống DB thành chuỗi rỗng.
 *
 * Dùng `undefined` chứ không `null` như `MobileCustomerCreateDto`: bên dưới,
 * `ItemCrudService.normalizePayload` cũng quy `""` về `undefined`, và `undefined`
 * là thứ TypeORM bỏ qua khi patch. Gửi `null` là XOÁ giá trị đang có — khác
 * nghĩa hẳn ở chế độ Sửa.
 */
const blankToUndefined = () =>
  Transform(({ value }) =>
    typeof value === 'string' && value.trim() === '' ? undefined : value,
  );

/**
 * Một biến thể do người dùng khai ở màn "Khai báo thuộc tính" của app.
 *
 * [color] và [size] là KHOÁ, không phải dữ liệu hiển thị: `ItemCrudService` dò
 * bản ghi đúng bằng `${color}__${size}`. Gửi nhãn đã ghép (`"Nâu/39"`) vào một
 * trong hai là không khớp tổ hợp nào, và hệ quả không phải lỗi — nó lặng lẽ
 * tạo biến thể với giá mặc định.
 *
 * Mọi trường đều tuỳ chọn: người dùng được phép chỉ điền giá cho vài dòng, số
 * còn lại thừa hưởng giá chung của hàng hoá.
 *
 * `sellPrice` chứ không `sellingPrice` — đó là tên mà `createProductWithVariants`
 * đọc (`v?.sellPrice`), và ở cấp biến thể nó lệch tên với trường cùng nghĩa ở
 * cấp hàng hoá. Lệch này có thật ở backend; đừng "sửa cho đồng bộ" ở đây, vì
 * đổi tên là biến thể mất giá mà không có gì báo.
 */
export class MobileProductVariantInputDto {
  @ApiPropertyOptional({ maxLength: 100, description: 'Giá trị chiều Màu sắc' })
  @blankToUndefined()
  @IsOptional()
  @IsString({ message: 'Màu sắc phải là chuỗi.' })
  @MaxLength(100, { message: 'Màu sắc tối đa 100 ký tự.' })
  color?: string;

  @ApiPropertyOptional({ maxLength: 100, description: 'Giá trị chiều Size' })
  @blankToUndefined()
  @IsOptional()
  @IsString({ message: 'Size phải là chuỗi.' })
  @MaxLength(100, { message: 'Size tối đa 100 ký tự.' })
  size?: string;

  @ApiPropertyOptional({ maxLength: 50, description: 'Mã SKU riêng của biến thể' })
  @blankToUndefined()
  @IsOptional()
  @IsString({ message: 'Mã SKU phải là chuỗi.' })
  @MaxLength(50, { message: 'Mã SKU tối đa 50 ký tự.' })
  sku?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @blankToUndefined()
  @IsOptional()
  @IsString({ message: 'Mã vạch phải là chuỗi.' })
  @MaxLength(100, { message: 'Mã vạch tối đa 100 ký tự.' })
  barcode?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Giá mua phải là số.' })
  @Min(0, { message: 'Giá mua không được âm.' })
  purchasePrice?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Giá bán của biến thể' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Giá bán phải là số.' })
  @Min(0, { message: 'Giá bán không được âm.' })
  sellPrice?: number;
}

/**
 * Một đơn vị chuyển đổi — gương đúng `CreateItemUnitInput` của backoffice, vì
 * cả hai đổ vào cùng một hàm `ItemCrudService.saveUnits`.
 */
export class MobileProductUnitInputDto {
  @ApiProperty({ maxLength: 50, description: 'Tên đơn vị, vd "Thùng"' })
  @IsString({ message: 'Tên đơn vị phải là chuỗi.' })
  @IsNotEmpty({ message: 'Tên đơn vị không được để trống.' })
  @MaxLength(50, { message: 'Tên đơn vị tối đa 50 ký tự.' })
  unitName!: string;

  @ApiPropertyOptional({
    minimum: 0,
    description: 'Tỉ lệ quy đổi về đơn vị cơ bản',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Tỉ lệ quy đổi phải là số.' })
  @Min(0, { message: 'Tỉ lệ quy đổi không được âm.' })
  ratio?: number;

  @ApiPropertyOptional({ maxLength: 255 })
  @blankToUndefined()
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi.' })
  @MaxLength(255, { message: 'Mô tả tối đa 255 ký tự.' })
  description?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Giá mua phải là số.' })
  @Min(0, { message: 'Giá mua không được âm.' })
  purchasePrice?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Giá bán phải là số.' })
  @Min(0, { message: 'Giá bán không được âm.' })
  sellPrice?: number;

  @ApiPropertyOptional({ description: 'Là đơn vị bán mặc định' })
  @IsOptional()
  @IsBoolean({ message: 'Đơn vị bán mặc định phải là true/false.' })
  isDefaultSell?: boolean;

  @ApiPropertyOptional({ description: 'Là đơn vị nhập mặc định' })
  @IsOptional()
  @IsBoolean({ message: 'Đơn vị nhập mặc định phải là true/false.' })
  isDefaultBuy?: boolean;
}

/**
 * Body tạo hàng hoá từ app. Message tiếng Việt vì app hiện thẳng `message` của
 * server lên toast — cùng lý do `MobileSupplierCreateDto` đã ghi.
 *
 * **Tập trường là ĐÓNG và bám đúng form của app.** Whitelist đang bật
 * (`forbidNonWhitelisted`), nên một khoá lạ là 400 cho CẢ lượt gọi. Cố ý KHÔNG
 * nhận: `brandId`, `itemType`, `providers`, `threshold`, `composition`,
 * `manufactureYear`, `isGoldSilver`, `oddSize`, các cỡ đóng gói `package*` —
 * form của app không có ô nào cho chúng. Đừng nới "cho rộng": mỗi trường mở
 * thêm là một đường ghi mà không màn hình nào kiểm được.
 *
 * **Ảnh KHÔNG có ở đây** vì backend chưa có chỗ lưu — `imageUrl` trả `null` ở
 * mọi endpoint, và web cũng đang giữ ảnh trong trình duyệt. Nút chọn ảnh của
 * app vẫn báo "sắp có".
 *
 * ### Hai đường ghi, quyết bởi `colors`/`sizes`
 *
 * Có ÍT NHẤT một trong hai mảng -> `ItemCrudService` tạo một MẪU MÃ cùng ma
 * trận biến thể; không có -> tạo một item lẻ. Đây là hợp đồng của chính service
 * đó, không phải luật riêng của mobile — xem `createProductWithVariants`.
 *
 * Hệ quả ở app: gõ chip `Màu sắc`/`Size` là đổi hẳn loại bản ghi được tạo.
 */
export class MobileProductCreateDto {
  @ApiProperty({ maxLength: 200, description: 'Tên hàng hoá' })
  @IsString({ message: 'Tên hàng hoá phải là chuỗi.' })
  @IsNotEmpty({ message: 'Tên hàng hoá không được để trống.' })
  @MaxLength(200, { message: 'Tên hàng hoá tối đa 200 ký tự.' })
  name!: string;

  /**
   * Mã hàng hoá (SKU). **Tuỳ chọn** — form của app ghi rõ "để trống thì máy tự
   * sinh mã", và `MobileProductService` sinh giúp trước khi ghi.
   *
   * Khác `CreateItemDto.code` của backoffice, nơi mã là bắt buộc vì web tự
   * sinh sẵn ở phía trình duyệt.
   */
  @ApiPropertyOptional({
    maxLength: 50,
    description: 'Mã hàng hoá; để trống thì hệ thống tự sinh từ tên',
  })
  @blankToUndefined()
  @IsOptional()
  @IsString({ message: 'Mã hàng hoá phải là chuỗi.' })
  @MaxLength(50, { message: 'Mã hàng hoá tối đa 50 ký tự.' })
  code?: string;

  @ApiProperty({ maxLength: 50, description: 'Đơn vị tính cơ bản' })
  @IsString({ message: 'Đơn vị tính phải là chuỗi.' })
  @IsNotEmpty({ message: 'Đơn vị tính không được để trống.' })
  @MaxLength(50, { message: 'Đơn vị tính tối đa 50 ký tự.' })
  unit!: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Id nhóm hàng hoá' })
  @blankToUndefined()
  @IsOptional()
  @IsUUID('4', { message: 'Nhóm hàng hoá không hợp lệ.' })
  categoryId?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @blankToUndefined()
  @IsOptional()
  @IsString({ message: 'Mã vạch phải là chuỗi.' })
  @MaxLength(100, { message: 'Mã vạch tối đa 100 ký tự.' })
  barcode?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @blankToUndefined()
  @IsOptional()
  @IsString({ message: 'Mô tả phải là chuỗi.' })
  @MaxLength(2000, { message: 'Mô tả tối đa 2000 ký tự.' })
  description?: string;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Giá mua phải là số.' })
  @Min(0, { message: 'Giá mua không được âm.' })
  purchasePrice?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Giá bán phải là số.' })
  @Min(0, { message: 'Giá bán không được âm.' })
  sellingPrice?: number;

  @ApiPropertyOptional({ default: true, description: 'Đang kinh doanh' })
  @IsOptional()
  @IsBoolean({ message: 'Trạng thái kinh doanh phải là true/false.' })
  isActive?: boolean;

  @ApiPropertyOptional({ default: true, description: 'Hiện trên màn bán hàng' })
  @IsOptional()
  @IsBoolean({ message: 'Hiển thị trên POS phải là true/false.' })
  isPosVisible?: boolean;

  @ApiPropertyOptional({ minimum: 0, description: 'Trọng lượng (gram)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Trọng lượng phải là số.' })
  @Min(0, { message: 'Trọng lượng không được âm.' })
  weightGram?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Chiều dài phải là số.' })
  @Min(0, { message: 'Chiều dài không được âm.' })
  lengthCm?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Chiều rộng phải là số.' })
  @Min(0, { message: 'Chiều rộng không được âm.' })
  widthCm?: number;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Chiều cao phải là số.' })
  @Min(0, { message: 'Chiều cao không được âm.' })
  heightCm?: number;

  /**
   * Tồn kho ban đầu. CHỈ có ở chế độ Thêm — [MobileProductUpdateDto] gỡ hẳn
   * trường này, vì sửa một hàng hoá không phải dịp để nhập lại tồn đầu kỳ.
   *
   * `@IsInt` chứ không `@IsNumber`: ô này đếm số lượng, và một tồn đầu `2.5`
   * đôi giày là dữ liệu sai chứ không phải một lựa chọn.
   */
  @ApiPropertyOptional({ minimum: 0, description: 'Tồn kho ban đầu' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Tồn kho ban đầu phải là số nguyên.' })
  @Min(0, { message: 'Tồn kho ban đầu không được âm.' })
  initialStock?: number;

  @ApiPropertyOptional({
    type: [String],
    maxItems: 50,
    description: 'Các giá trị chiều Màu sắc; có giá trị = tạo mẫu mã có biến thể',
  })
  @IsOptional()
  @IsArray({ message: 'Màu sắc phải là danh sách.' })
  @ArrayMaxSize(50, { message: 'Tối đa 50 màu sắc.' })
  @IsString({ each: true, message: 'Mỗi màu sắc phải là chuỗi.' })
  @MaxLength(100, { each: true, message: 'Mỗi màu sắc tối đa 100 ký tự.' })
  colors?: string[];

  @ApiPropertyOptional({
    type: [String],
    maxItems: 50,
    description: 'Các giá trị chiều Size',
  })
  @IsOptional()
  @IsArray({ message: 'Size phải là danh sách.' })
  @ArrayMaxSize(50, { message: 'Tối đa 50 size.' })
  @IsString({ each: true, message: 'Mỗi size phải là chuỗi.' })
  @MaxLength(100, { each: true, message: 'Mỗi size tối đa 100 ký tự.' })
  sizes?: string[];

  /**
   * Giá / SKU / mã vạch riêng của từng biến thể.
   *
   * `ArrayMaxSize(500)` khớp đúng ngưỡng mà `generate-variants` của backoffice
   * dùng cho số tổ hợp — 50 màu × 50 size là 2500 tổ hợp, và gửi trọn chúng qua
   * một request là thứ phải chặn ở đây chứ không ở DB.
   */
  @ApiPropertyOptional({ type: [MobileProductVariantInputDto], maxItems: 500 })
  @IsOptional()
  @IsArray({ message: 'Biến thể phải là danh sách.' })
  @ArrayMaxSize(500, { message: 'Tối đa 500 biến thể một lần lưu.' })
  @ValidateNested({ each: true })
  @Type(() => MobileProductVariantInputDto)
  variants?: MobileProductVariantInputDto[];

  @ApiPropertyOptional({ type: [MobileProductUnitInputDto], maxItems: 50 })
  @IsOptional()
  @IsArray({ message: 'Đơn vị chuyển đổi phải là danh sách.' })
  @ArrayMaxSize(50, { message: 'Tối đa 50 đơn vị chuyển đổi.' })
  @ValidateNested({ each: true })
  @Type(() => MobileProductUnitInputDto)
  units?: MobileProductUnitInputDto[];
}

/**
 * Body sửa hàng hoá — mọi trường tuỳ chọn, GỠ `initialStock`.
 *
 * `OmitType(PartialType(...))` chứ không khai lại tay: khai lại là dựng nguồn
 * thứ hai cho cùng một tập trường, và hai bên sẽ phân kỳ ngay lần thêm trường
 * tiếp theo.
 *
 * Gỡ `initialStock` KHÔNG phải là nới lỏng: whitelist đang bật
 * `forbidNonWhitelisted`, nên một trường đã bị `OmitType` loại ra mà client vẫn
 * gửi sẽ nhận **400** `property initialStock should not exist` — đúng thứ ta
 * muốn. App gửi nhầm nó sẽ biết ngay, thay vì đi dò vì sao tồn kho không đổi.
 *
 * **Mảng vắng mặt nghĩa là "giữ nguyên", mảng rỗng nghĩa là "xoá sạch"** —
 * `ItemCrudService.update` kiểm bằng `"units" in normalized`. App phải chủ ý
 * gửi `[]` khi người dùng xoá hết đơn vị chuyển đổi, và phải BỎ HẲN khoá khi
 * màn không đụng tới chúng.
 */
export class MobileProductUpdateDto extends OmitType(
  PartialType(MobileProductCreateDto),
  ['initialStock'] as const,
) {}
