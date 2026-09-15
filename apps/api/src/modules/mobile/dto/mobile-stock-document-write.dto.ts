import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DocCounterpartyKind } from '@erp/shared-interfaces';
import { GoodsReceiptPaymentMethod } from '../../inventory/goods-receipt/goods-receipt.entity';
import {
  MobileStockDocumentKind,
  MobileStockDocumentPurpose,
} from './mobile-stock-document-list.query.dto';

/**
 * Một dòng hàng do app gửi lên.
 *
 * `locationId` và `uomCode` là TUỲ CHỌN, và sự vắng mặt của chúng MANG NGHĨA:
 * vắng = server tự giải như trước (bin từ `branchId`, đơn vị từ `items.unit`),
 * có = dùng đúng thứ người dùng đã chọn trên màn Sửa dòng hàng. Nhờ vậy màn cũ
 * không gửi gì vẫn chạy nguyên như cũ.
 *
 * **KHÔNG có `id` của dòng, và sẽ không bao giờ có.** Đường `update` của cả hai
 * họ chứng từ XOÁ SẠCH rồi CHÈN LẠI, đánh số `lineNo` theo chỉ số mảng — nên
 * dòng không có định danh bền qua một lượt sửa. Hệ quả: **xoá một dòng là gửi
 * `PATCH` với mảng ngắn đi một phần tử**, và một route
 * `DELETE :id/lines/:lineId` thì không thể có nghĩa. Đừng thêm.
 */
export class MobileStockDocumentLineWriteDto {
  @ApiProperty({ format: 'uuid', description: 'Lấy từ `GET /mobile/items` — là `items.id`' })
  @IsUUID()
  itemId!: string;

  @ApiProperty({ minimum: 0.001, description: 'Cho phép phần lẻ: cột `numeric(18,3)`' })
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  @ApiProperty({ minimum: 0, description: '0 là hợp lệ — phiếu điều chuyển nội bộ không có giá' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitPrice!: number;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /**
   * Bin (vị trí lưu kho) người dùng CHỌN cho dòng này — lấy từ
   * `GET /mobile/inventory/locations?storageId=…`.
   *
   * Vắng = giữ nguyên hành vi cũ: server tự giải qua `ResolveItemLocationsQuery`
   * từ `branchId`. Có = server DÙNG ĐÚNG giá trị này, sau khi kiểm nó thuộc một
   * kho của chính cửa hàng lập phiếu — `location_id` chỉ có khoá ngoại tới
   * `locations`, KHÔNG có ràng buộc nào buộc bin thuộc đúng cửa hàng.
   */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  locationId?: string;

  /**
   * Đơn vị tính của dòng. Vắng = lấy `items.unit` như trước.
   *
   * CHỈ phiếu NHẬP lưu được: `goods_receipt_lines.uom_code` là cột thật, còn
   * `goods_issue_lines` KHÔNG có cột nào tương ứng. Với `kind=stock-out`, gửi
   * lại ĐÚNG đơn vị đang có là hợp lệ (màn Sửa gửi lại thứ nó vừa đọc) nhưng
   * đổi sang đơn vị khác thì 400 — xem `MobileStockDocumentWriteService`.
   */
  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  uomCode?: string;
}

/**
 * Tạo một chứng từ kho.
 *
 * MỘT hình dạng cho cả ba loại; service dịch sang DTO của phiếu nhập hoặc phiếu
 * xuất tuỳ [kind]. Ba chỗ hai bên đặt tên khác nhau (`receivedAt`/`occurredAt`,
 * `description`/`notes`, `deliveredBy`/`deliverer`) được giấu ở đây — app không
 * có lý do gì để biết chúng.
 *
 * **Hai trường mỗi dòng mà app ĐƯỢC BỎ TRỐNG, server tự giải:**
 *
 * - `locationId` — qua `ResolveItemLocationsQuery`, từ [branchId];
 * - `uomCode` — từ `items.unit`.
 *
 * Trước đây app KHÔNG gửi được chúng. Nay màn Sửa dòng hàng cho người dùng chọn
 * Kho/Vị trí và Đơn vị tính, nên chúng thành TUỲ CHỌN: vắng thì server giải như
 * cũ, có thì server dùng đúng lựa chọn đó. Xem `MobileStockDocumentLineWriteDto`.
 *
 * `purpose` TRƯỚC ĐÂY cũng nằm trong danh sách đó (server ép theo [kind]) và nay
 * KHÔNG còn: màn "Mục đích nhập/xuất kho" của app cho người dùng chọn giữa
 * "Khác" và "Điều chuyển", nên nó là một quyết định của người dùng chứ không
 * phải một hằng suy ra được. Bỏ trống vẫn ra đúng hành vi cũ — xem [purpose].
 */
export class MobileStockDocumentCreateDto {
  @ApiProperty({ enum: MobileStockDocumentKind })
  @IsEnum(MobileStockDocumentKind)
  kind!: MobileStockDocumentKind;

  @ApiProperty({ format: 'uuid', description: 'Cửa hàng lập phiếu — phải nằm trong quyền của người gọi' })
  @IsUUID()
  branchId!: string;

  @ApiProperty({ description: 'Ngày chứng từ, ISO-8601' })
  @IsISO8601()
  documentDate!: string;

  /**
   * Mục đích phiếu. Bỏ trống = `other`, tức ĐÚNG hành vi trước khi trường này
   * tồn tại — client cũ không phải đổi gì.
   *
   * **Đường GHI chỉ hiểu `other` và `transfer`**, dù enum có năm giá trị vì nó
   * dùng chung với bộ LỌC danh sách. Ba giá trị còn lại (`sale`, `disposal`,
   * `stock-take`) là phiếu do hệ thống sinh hoặc do luồng khác lập, không phải
   * thứ app tạo tay — gửi lên là 400 tường minh ở
   * `MobileStockDocumentWriteService`. Dùng chung enum thay vì dựng cái thứ hai
   * vì đó là CÙNG một từ vựng nhìn từ hai chiều; chỗ lệch là tập giá trị hợp
   * lệ, và nó được kiểm ở service — nơi duy nhất biết cả `kind` lẫn `purpose`.
   *
   * `transfer` kéo theo ba trường dưới đây và đổi hẳn đường ghi — xem service.
   */
  @ApiPropertyOptional({ enum: MobileStockDocumentPurpose, default: MobileStockDocumentPurpose.OTHER })
  @IsOptional()
  @IsEnum(MobileStockDocumentPurpose)
  purpose?: MobileStockDocumentPurpose;

  /**
   * Cửa hàng NGUỒN của phiếu nhập kho điều chuyển, khi người dùng KHÔNG chọn
   * lệnh điều chuyển nào.
   *
   * Phải khác [branchId] — nhận hàng điều chuyển từ chính mình là vô nghĩa, và
   * `GoodsReceiptService` từ chối ca đó.
   *
   * Chọn được lệnh thì đừng gửi trường này: [transferOrderId] đã mang cửa hàng
   * nguồn theo, và server lấy từ đó.
   */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  sourceBranchId?: string;

  /**
   * Cửa hàng ĐÍCH của phiếu xuất kho điều chuyển. **BẮT BUỘC** ở ca đó — không
   * có nó thì không biết hàng đi đâu, và `GoodsIssueService` trả 400
   * "Vui lòng chọn cửa hàng đích để điều chuyển".
   *
   * Phải khác [branchId], cùng lý do với [sourceBranchId].
   */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  targetBranchId?: string;

  /**
   * Lệnh điều chuyển mà phiếu NHẬP KHO này đang nhận về — lấy từ
   * `GET /mobile/transfer-orders/importable`.
   *
   * Có nó thì server đi đường XÁC NHẬN NHẬP: phiếu nhập được sinh ra kèm tham
   * chiếu tới lệnh, và lệnh chuyển sang "hoàn thành". **`lines` gửi kèm bị BỎ
   * QUA** ở ca này — số lượng nhận lấy từ chính lệnh, để nó không bao giờ lệch
   * thứ cửa hàng nguồn đã xuất. App vẫn phải gửi `lines` (DTO đòi không rỗng)
   * và nên gửi đúng dòng của lệnh để hai bên nhìn giống nhau.
   */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  transferOrderId?: string;

  /**
   * Đối tượng. Hai trường đi CÙNG NHAU: gửi `counterpartyKind` mà thiếu
   * `counterpartyId` là 400 ở tầng dưới.
   *
   * `customer` sẽ bị từ chối — phiếu kho chỉ nhận nhà cung cấp và nhân viên.
   */
  @ApiPropertyOptional({ enum: DocCounterpartyKind })
  @IsOptional()
  @IsEnum(DocCounterpartyKind)
  counterpartyKind?: DocCounterpartyKind;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  counterpartyId?: string;

  /** Nhân viên mua hàng — `users.id`. Chỉ phiếu NHẬP có trường này. */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  purchasingEmployeeId?: string;

  /** Chỉ phiếu NHẬP. Phiếu xuất không có khái niệm thanh toán. */
  @ApiPropertyOptional({ enum: GoodsReceiptPaymentMethod })
  @IsOptional()
  @IsEnum(GoodsReceiptPaymentMethod)
  paymentMethod?: GoodsReceiptPaymentMethod;

  @ApiPropertyOptional({ maxLength: 200, description: 'Người giao' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deliverer?: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Diễn giải' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiProperty({ type: [MobileStockDocumentLineWriteDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MobileStockDocumentLineWriteDto)
  lines!: MobileStockDocumentLineWriteDto[];
}

/**
 * Sửa một chứng từ.
 *
 * KHÔNG kế thừa DTO tạo: [kind] và [branchId] là thứ **không đổi được** — đổi
 * loại chứng từ hay chuyển phiếu sang cửa hàng khác là huỷ-và-lập-lại, không
 * phải sửa. Nhưng cả hai vẫn phải CÓ MẶT vì server cần chúng để biết tra bảng
 * nào và kiểm quyền cửa hàng nào; chúng đi qua query của đường `PATCH`.
 *
 * `lines` bắt buộc và không rỗng: phiếu không dòng hàng bị tầng dưới từ chối,
 * và một `PATCH` thiếu `lines` sẽ lặng lẽ giữ nguyên dòng cũ — trong khi màn
 * hình đang hiện danh sách người dùng vừa sửa.
 *
 * Hệ quả trực tiếp: **SỬA hay XOÁ một dòng đều là một lượt `PATCH` với trọn
 * mảng `lines`**, đúng cách trang web làm. Không có, và không nên có, endpoint
 * thao tác trên từng dòng — lý do ở `MobileStockDocumentLineWriteDto`.
 */
export class MobileStockDocumentUpdateDto {
  @ApiProperty({ description: 'Ngày chứng từ, ISO-8601' })
  @IsISO8601()
  documentDate!: string;

  @ApiPropertyOptional({ enum: DocCounterpartyKind })
  @IsOptional()
  @IsEnum(DocCounterpartyKind)
  counterpartyKind?: DocCounterpartyKind;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  counterpartyId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  purchasingEmployeeId?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deliverer?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiProperty({ type: [MobileStockDocumentLineWriteDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => MobileStockDocumentLineWriteDto)
  lines!: MobileStockDocumentLineWriteDto[];
}
