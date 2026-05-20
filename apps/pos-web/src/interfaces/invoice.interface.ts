import type {
  InvoicePaymentMethod,
  InvoiceStatus,
} from "@erp/pos/types/invoice.type";

export interface InvoiceItemRow {
  id: string;
  itemId: string;
  locationId?: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  lineTotal: number;
  note?: string;
  sortOrder?: number;
}

/**
 * Bản ghi invoice trả về từ `POST /invoices`, `GET /invoices/:id`, `GET /invoices/drafts`
 * và `POST /invoices/:id/checkout`. `items` chỉ có ở endpoint chi tiết.
 */
export interface InvoiceRow {
  id: string;
  code: string;
  status: InvoiceStatus;
  isDraft: boolean;
  draftLabel?: string;
  sessionId: string;
  customerId?: string;
  staffId: string;
  subtotal: number;
  discountAmount: number;
  depositAmount: number;
  amountDue: number;
  totalPaid: number;
  note?: string;
  issuedAt?: string;
  createdAt: string;
  updatedAt?: string;
  items?: InvoiceItemRow[];
  // Chỉ có ở `GET /invoices/:id` (sau checkout) — phục vụ biên lai chi tiết.
  paymentMethod?: InvoicePaymentMethod | null;
  cashTendered?: number | null;
  changeAmount?: number | null;
}
