export interface BranchRow {
  id: string;
  name: string;
  /** Địa chỉ chi nhánh — in trên hóa đơn POS. Có thể null nếu chưa nhập. */
  address?: string | null;
  /** SĐT chi nhánh — in trên hóa đơn POS. Có thể null nếu chưa nhập. */
  phone?: string | null;
}
