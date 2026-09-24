import { ForbiddenException, Injectable } from '@nestjs/common';
import { ImportableTransferOrderListItem } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { TransferOrderService } from '../../inventory/transfer-order/transfer-order.service';
import { MobileStockDocumentLineDto } from '../dto/mobile-stock-document-detail.response.dto';
import { withBranch } from '../../../common/utils/branch-request.util';
import {
  MobileTransferOrderPageDto,
  MobileTransferOrderResponseDto,
} from '../dto/mobile-transfer-order.response.dto';

/**
 * Lệnh điều chuyển đang chờ cửa hàng hiện tại nhập — nguồn của màn "Chọn chứng
 * từ" trong app.
 *
 * Uỷ quyền cho `TransferOrderService.listImportable`, đúng vị từ mà trang web
 * dùng cho hộp thoại "Chọn chứng từ xuất kho điều chuyển", rồi NẮN LẠI hình
 * dạng. Việc nắn là bắt buộc chứ không phải cho gọn: vị từ đó trả trọn
 * `ImportableTransferOrderListItem` kèm `status`, `importGoodsReceiptId`,
 * `counterpartyName` và cả tên kho / mã vị trí của từng dòng — app không vẽ thứ
 * nào trong số đó.
 *
 * **PHÂN TRANG TRONG BỘ NHỚ, và đó là quyết định có ý thức.** `listImportable`
 * trả một MẢNG TRẦN, không phân trang. Nhưng app có đúng MỘT cơ chế danh sách
 * (`DataListBloc` + `DataListView`) và nó đòi envelope `{data,total,page,limit}`
 * — dựng một cơ chế danh sách thứ hai ở app đắt hơn nhiều so với việc cắt trang
 * ở đây.
 *
 * Cái giá phải biết trước: mỗi lượt gọi nạp TRỌN danh sách rồi mới cắt, nên
 * trang 2 không rẻ hơn trang 1. Chấp nhận được vì danh sách "chờ nhận" của một
 * cửa hàng vốn ngắn — nó chỉ chứa những lệnh đã xuất mà chưa ai nhập. Ngày nó
 * dài tới mức thấy được thì việc cần làm là thêm phân trang vào
 * `listImportable`, không phải vá ở đây.
 */
@Injectable()
export class MobileTransferOrderService {
  constructor(private readonly transferOrders: TransferOrderService) {}

  async listImportable(
    query: {
      branchId?: string;
      page: number;
      limit: number;
      from?: string;
      to?: string;
      sourceBranchId?: string;
      search?: string;
    },
    actor: ActorContext,
  ): Promise<MobileTransferOrderPageDto> {
    const { page, limit, from, to, sourceBranchId, search } = query;

    // Giải chi nhánh TRƯỚC khi gọi: `listImportable` đọc `actor.branchId` làm
    // cửa hàng ĐÍCH, nên cách duy nhất đổi cửa hàng là đưa cho nó actor khác.
    const scoped = withBranch(actor, query.branchId);

    const rows = await this.transferOrders.listImportable({ from, to }, scoped);

    const filtered = rows
      .filter((row) => matchesSource(row, sourceBranchId))
      .filter((row) => matchesSearch(row, search));

    // Cắt trang SAU khi lọc, không trước: lọc rồi cắt cho ra đúng `total` mà
    // thanh cuộn vô tận của app cần để biết khi nào hết dữ liệu.
    const start = (page - 1) * limit;

    return {
      data: filtered.slice(start, start + limit).map(toMobileTransferOrder),
      total: filtered.length,
      page,
      limit,
    };
  }
}

/**
 * Chi nhánh dùng cho lượt đọc này — mặc định là chi nhánh trong token.
 *
 * Bản sao của `withBranch` ở `MobileStockDocumentService`, cố ý KHÔNG gom lại
 * thành một util dùng chung: hai service đọc hai nguồn dữ liệu khác nhau và sẽ
 * tiến hoá khác nhau, còn hàm này thì ba dòng. Gom lại là dựng một phụ thuộc
 * giữa hai module để tiết kiệm ba dòng.
 *
 * Yêu cầu một chi nhánh ngoài tầm thì **NÉM**, không lặng lẽ lùi về mặc định —
 * cùng lập luận đã ghi ở bản gốc.
 */

/** Bỏ trống thì nhận mọi cửa hàng nguồn. */
function matchesSource(
  row: ImportableTransferOrderListItem,
  sourceBranchId?: string,
): boolean {
  return !sourceBranchId || row.sourceBranchId === sourceBranchId;
}

/**
 * Một ô gõ, khớp chỗ nào cũng tính: số phiếu xuất, mã lệnh, tên cửa hàng nguồn.
 *
 * KHÔNG bỏ dấu — cùng giới hạn đã khai ở mọi đường `search` khác của `/mobile`.
 */
function matchesSearch(
  row: ImportableTransferOrderListItem,
  search?: string,
): boolean {
  const term = search?.trim().toLowerCase();
  if (!term) return true;

  return [
    row.exportGoodsIssueDocumentNumber,
    row.documentNumber,
    row.sourceBranchName,
  ].some((value) => value?.toLowerCase().includes(term));
}

function toMobileTransferOrder(
  row: ImportableTransferOrderListItem,
): MobileTransferOrderResponseDto {
  return {
    id: row.id,
    documentNumber: row.documentNumber,
    exportDocumentNumber: row.exportGoodsIssueDocumentNumber,
    documentDate: row.requestedDate,
    sourceBranchId: row.sourceBranchId,
    sourceBranchName: row.sourceBranchName,
    note: row.notes,
    totalAmount: Number(row.totalAmount ?? 0),
    lines: row.lines.map(toMobileLine),
  };
}

/**
 * Chép TƯỜNG MINH từng trường, không spread.
 *
 * Dòng của `listImportable` mang thêm `id`, `storageName`, `locationCode`,
 * `locationName`, `notes` — spread là để chúng rò ra ngoài mà không ai quyết
 * định gì. Cùng lập luận mà hai mapper của `MobileStockDocumentService` dùng.
 */
function toMobileLine(
  line: ImportableTransferOrderListItem['lines'][number],
): MobileStockDocumentLineDto {
  return {
    itemId: line.itemId,
    // `name`/`sku` chứ không `itemName`/`itemCode`: hình dạng này dùng chung với
    // dòng của chứng từ kho, nên app có đúng MỘT parser cho cả hai đường.
    name: line.itemName,
    sku: line.itemCode,
    unit: line.unit,
    quantity: Number(line.quantity ?? 0),
    unitPrice: Number(line.unitPrice ?? 0),
    lineTotal: Number(line.lineTotal ?? 0),
    // Bốn trường kho/vị trí đều `null`, CÓ CHỦ Ý — không phải chưa map xong.
    //
    // Dòng ở đây là dòng của LỆNH điều chuyển, tức thứ chi nhánh kia đã XUẤT;
    // `storageName`/`locationName` mà lệnh mang là kho NGUỒN. Chép chúng sang
    // đây là nói với màn Sửa rằng hàng đang nằm ở một bin của cửa hàng khác,
    // và app sẽ gửi lại đúng thứ đó khi lưu. Bin NHẬN do server giải lúc nhập,
    // từ `branchId` của chính người nhập.
    locationId: null,
    locationName: null,
    storageId: null,
    storageName: null,
  };
}
