/** Hình dạng dữ liệu trang "Phát hành hóa đơn điện tử" (hiện chạy mock). */

export type EInvoiceTab = "unissued" | "issued";

export interface EInvoiceLine {
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  /** Tiền hàng = số lượng × đơn giá. */
  goodsAmount: number;
  /** Thành tiền = tiền hàng − khuyến mại của dòng. */
  amount: number;
}

/** Tab "Thông tin người mua" của modal Sửa. */
export interface EInvoiceBuyer {
  taxCode: string;
  budgetUnitCode: string;
  unitName: string;
  address: string;
  buyerName: string;
  idNumber: string;
  email: string;
  phone: string;
  bankAccount: string;
  bankName: string;
  passportNo: string;
  sendToCustomer: boolean;
  recipientName: string;
  /** Nhiều email cách nhau bởi dấu `;`. */
  recipientEmails: string;
}

/** Tab "Thông tin người bán" của modal Sửa. */
export interface EInvoiceSeller {
  taxCode: string;
  sellerUnit: string;
  address: string;
  storeCode: string;
  phone: string;
  bankAccount: string;
  bankName: string;
  storeName: string;
}

/** Thông tin chỉ có sau khi hóa đơn đã phát hành. */
export interface EInvoiceIssueInfo {
  /** ISO date `YYYY-MM-DD`. */
  issuedDate: string;
  /** Mẫu số + ký hiệu, vd `2C26TAA`. */
  templateSymbol: string;
  providerInvoiceNo: string;
  issueStatus: string;
  invoiceStatus: string;
  taxAuthorityStatus: string;
  emailStatus: string;
  errorNote: string;
}

export interface EInvoiceRecord {
  id: string;
  branchId: string;
  /** Ngày hóa đơn bán hàng, ISO `YYYY-MM-DD`. */
  invoiceDate: string;
  invoiceCode: string;
  total: number;
  promotionTotal: number;
  unissuedReason: string;
  buyer: EInvoiceBuyer;
  seller: EInvoiceSeller;
  lines: EInvoiceLine[];
  /** Mẫu hóa đơn / ký hiệu mẫu đã chọn trong modal Sửa (chưa phát hành). */
  templateNo: string;
  symbol: string;
  issue: EInvoiceIssueInfo | null;
}

export interface EInvoiceListResult {
  rows: EInvoiceRecord[];
  total: number;
  totalAmount: number;
}
