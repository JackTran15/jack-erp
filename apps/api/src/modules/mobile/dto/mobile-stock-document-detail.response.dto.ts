import { ApiProperty } from '@nestjs/swagger';
import { DocCounterpartyKind } from '@erp/shared-interfaces';
import { GoodsReceiptPaymentMethod } from '../../inventory/goods-receipt/goods-receipt.entity';
import { MobileStockDocumentPurpose } from './mobile-stock-document-list.query.dto';
import { MobileStockDocumentStatus } from './mobile-stock-document.response.dto';

/**
 * Một dòng hàng của chứng từ, theo hình dạng app mobile đọc được.
 *
 * SÁU trường, khớp đúng `StockDocumentLineEntity` phía Dart và đúng những gì
 * `StockLineRow` vẽ ra: tên hàng, mã SKU, đơn vị tính, số lượng, đơn giá và
 * thành tiền.
 *
 * Trả `itemId` TRẦN chứ không cả object `item`: đó là thứ duy nhất app cần từ
 * hàng hoá khi gửi phiếu lên, và nó không kéo theo gì.
 *
 * Cố ý KHÔNG trả `item` và `location` dạng object. Cả hai là quan hệ `eager`
 * của entity dòng hàng, nên đường v1 trả TRỌN `ItemEntity` (~30 trường: giá
 * vốn, cân nặng, năm sản xuất, chất liệu…) và trọn `LocationEntity` cho MỖI
 * dòng — một phiếu 3 dòng đã nặng 8,2–8,9 KB. App chỉ cần vài mẩu chữ trong số
 * đó.
 *
 * Bốn trường KHO/VỊ TRÍ (`locationId`, `locationName`, `storageId`,
 * `storageName`) nay CÓ mặt, nhưng vẫn theo đúng nguyên tắc trên: chúng là bốn
 * cột phẳng lấy qua một `select` tường minh, không phải hai object lồng. Màn
 * Sửa dòng hàng cần chúng để hiện sẵn lựa chọn cũ **và để gửi lại `locationId`**
 * — thiếu nó thì mỗi lượt lưu là server giải lại vị trí, và một dòng người dùng
 * đã xếp tay lặng lẽ nhảy sang bin khác.
 *
 * `note` của dòng cũng chưa có ở đây: `StockLineRow` không vẽ nó. Thêm khi màn
 * hình cần — đó là thay đổi cộng thêm, không phá client cũ.
 */
/** Một người được nhắc tới trong chứng từ: chỉ định danh và tên, không hơn. */
export class MobileStockDocumentPersonDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

/**
 * Một cửa hàng được nhắc tới trong chứng từ điều chuyển.
 *
 * Hình dạng trùng `MobileStockDocumentPersonDto` nhưng là class RIÊNG: hai thứ
 * không liên quan gì nhau, và gộp lại thì ngày một bên cần thêm `code` là bên
 * kia lặng lẽ nhận theo.
 */
export class MobileStockDocumentBranchDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;
}

export class MobileStockDocumentLineDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Định danh hàng hoá. App gửi lại đúng giá trị này khi SỬA phiếu — không ' +
      'có nó thì mọi dòng đọc về đều phải chọn lại tay.',
  })
  itemId!: string;

  @ApiProperty({ description: 'Tên hàng hoá' })
  name!: string;

  @ApiProperty({ description: 'Mã hàng hoá' })
  sku!: string;

  @ApiProperty({
    description:
      'Đơn vị tính. Phiếu NHẬP lấy từ `uomCode` của chính dòng hàng — bản chụp ' +
      'tại thời điểm nhập; phiếu XUẤT không có cột đó nên lấy `item.unit`, tức ' +
      'giá trị HIỆN TẠI của hàng hoá.',
  })
  unit!: string;

  @ApiProperty({
    description:
      'Số lượng. Cột `numeric(18,3)` nên cho phép phần lẻ (0,5 kg). Driver `pg` ' +
      'trả `numeric` thành chuỗi, DTO này đã ép về số.',
  })
  quantity!: number;

  @ApiProperty()
  unitPrice!: number;

  @ApiProperty({
    description:
      'Thành tiền do BACKEND tính, không phải `quantity × unitPrice`. Hai số ' +
      'lệch nhau khi có chiết khấu, và trang web cũng ưu tiên trường này.',
  })
  lineTotal!: number;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description:
      'Bin (vị trí lưu kho) đã lưu của dòng. App gửi lại ĐÚNG giá trị này khi ' +
      'SỬA — thiếu nó thì mỗi lượt lưu là server giải lại vị trí, tức hàng đổi ' +
      'bin mà không ai bấm gì.',
  })
  locationId!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Tên bin, để màn Sửa hiện sẵn lựa chọn cũ',
  })
  locationName!: string | null;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description: 'Kho chứa bin — `storages.id`',
  })
  storageId!: string | null;

  @ApiProperty({ nullable: true, description: 'Tên kho' })
  storageName!: string | null;
}

/*
 * KHÔNG có `id` của dòng, và sẽ không bao giờ có: đường `update` của cả hai họ
 * chứng từ xoá sạch rồi chèn lại dòng, đánh số `lineNo` theo chỉ số mảng. Một
 * định danh phơi ra ở đây là lời nói dối mà app sẽ dựng lên trên.
 */

/**
 * Chi tiết một chứng từ kho: phần đầu phiếu cộng toàn bộ dòng hàng.
 *
 * Phần đầu là BẢY trường của [MobileStockDocumentResponseDto] (màn danh sách)
 * cộng đúng hai trường mà thẻ thông tin ở màn chi tiết hiện thêm: [deliverer]
 * và [note]. Hai DTO cố ý KHÔNG kế thừa nhau — chúng phục vụ hai màn khác nhau
 * và sẽ tiến hoá khác nhau; buộc vào một cây kế thừa thì thêm một trường cho
 * màn chi tiết là lặng lẽ nới cả màn danh sách.
 *
 * Bốn trường [counterpartyKind], [counterpartyId], [purchasingEmployee] và
 * [paymentMethod] KHÔNG phải để hiển thị — thẻ thông tin của màn chi tiết vẫn
 * đúng bốn dòng như cũ (Ngày, Nhà cung cấp, Người giao, Diễn giải). Chúng phục
 * vụ màn SỬA: app phải gửi lại chính những gì nó vừa đọc, mà tên và mã đối
 * tượng thì không suy ngược ra định danh được.
 *
 * Bốn trường [purpose], [sourceBranch], [targetBranch] và [transferOrderId] cũng
 * KHÔNG phải để hiển thị — chúng phục vụ màn SỬA của phiếu ĐIỀU CHUYỂN: app phải
 * dựng lại đúng mục đích và cửa hàng nguồn/đích đã lưu, mà không trường nào khác
 * suy ra được chúng. Trước đây `purpose` cố ý KHÔNG được trả, và đó đúng lúc app
 * chưa lập được phiếu điều chuyển; nay lập được thì thiếu nó nghĩa là mở màn Sửa
 * ra thấy "Khác" và lưu lại là MẤT thông tin điều chuyển.
 *
 * Vẫn KHÔNG trả `references`, `journalEntryId`, `transferImported`,
 * `attachmentIds`: app không hiển thị và cũng không gửi lại chúng.
 *
 * KHÔNG phân trang dòng hàng. Đường v1 có `GET /:id/lines` phân trang cho bảng
 * cuộn vô tận của web, nhưng `GET /:id` vốn đã trả trọn `lines` và app vẽ chúng
 * trong một `SliverList` không phân trang — thêm một vòng phân trang ở đây là
 * dựng thứ chưa ai dùng.
 */
export class MobileStockDocumentDetailDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    nullable: true,
    description: 'Số phiếu. NULL khi phiếu chưa ghi sổ — backend chỉ sinh mã lúc post.',
  })
  code!: string | null;

  @ApiProperty({
    description:
      'Ngày chứng từ, ISO-8601. Phiếu NHẬP là `receivedAt`; phiếu XUẤT là ' +
      '`occurredAt` (ngày nghiệp vụ người dùng nhập) và lùi về `createdAt` khi ' +
      'nó trống. Lưu ý màn DANH SÁCH của phiếu xuất hiện `createdAt` — lệch có ' +
      'chủ ý, lý do ở `MobileStockDocumentService`.',
  })
  documentDate!: string;

  @ApiProperty({ nullable: true, description: 'Tên đối tượng: nhà cung cấp, khách hàng hoặc chi nhánh đích' })
  partyName!: string | null;

  @ApiProperty({
    nullable: true,
    description:
      'Mã đối tượng. Lấy mã của chính đối tượng (nhà cung cấp HOẶC nhân viên), ' +
      'lùi về mã nhà cung cấp ở đường cũ.',
  })
  partyCode!: string | null;

  @ApiProperty({
    enum: DocCounterpartyKind,
    nullable: true,
    description:
      'Loại đối tượng. Đi CẶP với `counterpartyId` — có cái này mà thiếu cái ' +
      'kia thì app không dựng lại được đối tượng nào.',
  })
  counterpartyKind!: DocCounterpartyKind | null;

  @ApiProperty({ format: 'uuid', nullable: true })
  counterpartyId!: string | null;

  @ApiProperty({
    nullable: true,
    description:
      'Nhân viên mua hàng — CHỈ phiếu nhập. Trả cả tên chứ không riêng định ' +
      'danh: màn sửa phải hiện được tên, mà app không có đường nào tra ngược ' +
      'một `users.id` thành tên.',
  })
  purchasingEmployee!: MobileStockDocumentPersonDto | null;

  @ApiProperty({
    enum: GoodsReceiptPaymentMethod,
    nullable: true,
    description:
      'Phương thức thanh toán — CHỈ phiếu nhập. Phiếu xuất không có khái niệm ' +
      'này nên luôn `null`.',
  })
  paymentMethod!: GoodsReceiptPaymentMethod | null;

  @ApiProperty({
    description:
      'Thành tiền của phiếu — cộng từ `lineTotal` của các dòng. Đường `GET /:id` ' +
      'của backend KHÔNG có `totalAmount` (chỉ danh sách mới có), nên nó được ' +
      'tính ở đây thay vì để app tự cộng.',
  })
  amount!: number;

  @ApiProperty({ enum: ['draft', 'posted', 'cancelled'] })
  status!: MobileStockDocumentStatus;

  @ApiProperty({
    description:
      'Người giao hàng. `deliveredBy` ở phiếu nhập, `deliverer` ở phiếu xuất. ' +
      'Chuỗi rỗng khi không có — app hiển thị nó như một dòng trống, không phải ' +
      'thiếu dữ liệu.',
  })
  deliverer!: string;

  @ApiProperty({
    description: 'Diễn giải. `description` ở phiếu nhập, `notes` ở phiếu xuất.',
  })
  note!: string;

  @ApiProperty({
    enum: MobileStockDocumentPurpose,
    nullable: true,
    description:
      'Mục đích phiếu, để màn SỬA của app dựng lại đúng lựa chọn cũ. `null` khi ' +
      'mục đích của phiếu không nằm trong tập app lập được (vd phiếu bán hàng ' +
      'hay phiếu kiểm kê do hệ thống sinh) — app hiện "Khác" ở ca đó.',
  })
  purpose!: MobileStockDocumentPurpose | null;

  @ApiProperty({
    type: MobileStockDocumentBranchDto,
    nullable: true,
    description:
      'Cửa hàng NGUỒN — chỉ phiếu nhập kho điều chuyển có. Phục vụ màn SỬA, ' +
      'không hiển thị ở màn chi tiết.',
  })
  sourceBranch!: MobileStockDocumentBranchDto | null;

  @ApiProperty({
    type: MobileStockDocumentBranchDto,
    nullable: true,
    description: 'Cửa hàng ĐÍCH — chỉ phiếu xuất kho điều chuyển có. Xem [sourceBranch].',
  })
  targetBranch!: MobileStockDocumentBranchDto | null;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description:
      'Lệnh điều chuyển mà phiếu này là một chân của nó. `null` khi phiếu điều ' +
      'chuyển được lập độc lập (không chọn lệnh nào).',
  })
  transferOrderId!: string | null;

  @ApiProperty({ type: [MobileStockDocumentLineDto] })
  lines!: MobileStockDocumentLineDto[];
}
