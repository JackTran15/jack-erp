import type { PeriodValue } from "@erp/ui";
import type { EInvoiceTab } from "../../../pages/settings/einvoice/_lib/einvoice.interface";

export interface EInvoiceActions {
  /** Đổi tab: về trang 1, bỏ các dòng đã tick. */
  setTab: (tab: EInvoiceTab) => void;
  setPeriod: (period: PeriodValue) => void;
  /** Chốt kỳ đang chọn — lưới chỉ tải lại khi bấm "Lấy dữ liệu". */
  applyFilter: () => void;
  setPage: (page: number) => void;
  setPageSize: (pageSize: number) => void;
  toggleChecked: (id: string) => void;
  setCheckedIds: (ids: string[]) => void;
  /** Mở/đóng modal "Sửa" (null = đóng). */
  setEditingId: (id: string | null) => void;
  /** Mở/đóng modal "Chi tiết hóa đơn" (null = đóng). */
  setDetailId: (id: string | null) => void;
}

export interface EInvoiceState {
  tab: EInvoiceTab;
  period: PeriodValue;
  applied: { from: string; to: string };
  page: number;
  pageSize: number;
  checkedIds: string[];
  editingId: string | null;
  detailId: string | null;
  actions: EInvoiceActions;
}
