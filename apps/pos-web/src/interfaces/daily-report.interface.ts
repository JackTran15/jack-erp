/**
 * FE-only cash-handover form state (BÀN GIAO TIỀN). Not persisted to the backend —
 * used purely to render + print/export the "BÁO CÁO TỔNG HỢP" document.
 */
export interface CashHandoverForm {
  /** Số tiền bàn giao từ ban đầu. */
  openingAmount: number;
  /** Nhận từ — nhân viên (id). */
  receivedFromId: string | null;
  /** Tiền bàn giao — computed from the cash-count modal. */
  handoverAmount: number;
  /** Người nhận bàn giao — nhân viên (id). */
  handedOverToId: string | null;
  /** Ghi chú. */
  note: string;
}

/** Cash-count modal state: denomination (VND) → quantity counted. */
export type CashCountState = Record<number, number>;
