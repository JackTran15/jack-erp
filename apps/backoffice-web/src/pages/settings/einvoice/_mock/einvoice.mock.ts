/**
 * Mock trang "Phát hành hóa đơn điện tử". Backend chưa có HĐĐT — khi có API thì
 * thay `_lib/einvoice-query.ts` + `_lib/useEInvoiceMutations.ts` gọi `_api/`, xóa
 * thư mục này.
 *
 * Mảng `RECORDS` là mutable: "Lưu" / "Phát hành" sửa thẳng vào đây rồi
 * invalidate query, nên dữ liệu giữ được trong phiên (mất khi tải lại trang).
 */
import type {
  EInvoiceBuyer,
  EInvoiceIssueInfo,
  EInvoiceLine,
  EInvoiceRecord,
  EInvoiceSeller,
} from "../_lib/einvoice.interface";

/** Cùng id/tên với mock "Tình hình phát hành HĐĐT" ở trang Tổng quan. */
export const EINVOICE_MOCK_BRANCHES = [
  { id: "mock-da-nang", name: "Chi nhánh 211 TP. Đà Nẵng" },
  { id: "mock-ca-mau", name: "Chi nhánh TP. Cà Mau" },
  { id: "mock-buon-ma-thuot", name: "Giày MT Buôn Ma Thuột" },
] as const;

export const EINVOICE_TEMPLATE_OPTIONS = [
  { value: "1", label: "1 - Hóa đơn giá trị gia tăng" },
  { value: "2", label: "2 - Hóa đơn bán hàng" },
];

export const EINVOICE_SYMBOL_OPTIONS = [
  { value: "C26TAA", label: "C26TAA" },
  { value: "C26TBB", label: "C26TBB" },
];

/** Mẫu / ký hiệu dùng khi phát hành thẳng từ bảng (không qua modal Sửa). */
export const EINVOICE_DEFAULT_TEMPLATE = { templateNo: "2", symbol: "C26TAA" };

export const EINVOICE_ISSUE_STATUS_OPTIONS = ["Đã phát hành", "Phát hành lỗi"];
export const EINVOICE_INVOICE_STATUS_OPTIONS = ["Hóa đơn gốc", "Hóa đơn điều chỉnh", "Hóa đơn thay thế"];
export const EINVOICE_TAX_AUTHORITY_STATUS_OPTIONS = ["Chưa gửi", "Đã cấp mã", "CQT từ chối"];
export const EINVOICE_EMAIL_STATUS_OPTIONS = ["Chưa gửi", "Đã gửi", "Gửi lỗi"];

/** Khối "Mã số thuế / Số HĐ còn được sử dụng" — ảnh ghi trống / 0. */
export const EINVOICE_QUOTA = { taxCode: "", remaining: 0 };

const EMPTY_BUYER: EInvoiceBuyer = {
  taxCode: "",
  budgetUnitCode: "",
  unitName: "",
  address: "",
  buyerName: "Bán cho người tiêu dùng",
  idNumber: "",
  email: "",
  phone: "",
  bankAccount: "",
  bankName: "",
  passportNo: "",
  sendToCustomer: false,
  recipientName: "",
  recipientEmails: "",
};

const EMPTY_SELLER: EInvoiceSeller = {
  taxCode: "",
  sellerUnit: "",
  address: "",
  storeCode: "",
  phone: "",
  bankAccount: "",
  bankName: "",
  storeName: "",
};

const PRODUCTS = [
  { sku: "ABA2950-D-39", name: "Giày nam ABA2950-D-39", price: 720_000 },
  { sku: "AK0021-D-37", name: "Giày nữ AK0021-D-37", price: 1_250_000 },
  { sku: "ABA3376-D-39", name: "Sapo nam ABA3376-D-39", price: 595_000 },
  { sku: "AK118066-TR-37", name: "Giày thể thao AK118066-TR-37", price: 1_100_000 },
  { sku: "DT0520-N-38", name: "Dép nữ DT0520-N-38", price: 260_000 },
  { sku: "BT1180-D-41", name: "Boot nam BT1180-D-41", price: 1_680_000 },
];

function line(
  sku: string,
  name: string,
  quantity: number,
  unitPrice: number,
  amount = quantity * unitPrice,
): EInvoiceLine {
  return { sku, name, unit: "Đôi", quantity, unitPrice, goodsAmount: quantity * unitPrice, amount };
}

/** Một dòng hàng "gói" đúng tổng tiền — cho các hóa đơn ảnh không chụp chi tiết. */
function singleLine(total: number, seed: number): EInvoiceLine[] {
  const product = PRODUCTS[seed % PRODUCTS.length]!;
  const quantity = total < 0 ? -1 : 1;
  return [line(product.sku, product.name, quantity, Math.abs(total))];
}

interface Seed {
  date: string;
  code: string;
  total: number;
  customer?: string;
  address?: string;
  phone?: string;
  lines?: EInvoiceLine[];
  promotionTotal?: number;
}

/** 16 dòng đầu lấy đúng từ ảnh chụp tab "Hóa đơn chưa phát hành". */
const SCREENSHOT_SEEDS: Seed[] = [
  {
    date: "2026-09-22",
    code: "2609060009",
    total: 1_695_000,
    lines: [
      line("ABA3376-D-39", "Sapo nam ABA3376-D-39", 1, 595_000),
      line("AK118066-TR-37", "Giày thể thao AK118066-TR-37", 1, 1_100_000),
    ],
  },
  { date: "2026-09-21", code: "2609050001", total: 10_080_000, customer: "CHỢ ĐÀO", address: "DN", phone: "0869967814" },
  {
    date: "2026-09-15",
    code: "2609060007",
    total: 2_258_000,
    promotionTotal: 1_682_000,
    lines: [
      line("ABA2950-D-39", "Giày nam ABA2950-D-39", 2, 720_000, 1_008_000),
      line("AK0021-D-37", "Giày nữ AK0021-D-37", 2, 1_250_000, 1_250_000),
    ],
  },
  { date: "2026-09-14", code: "2609060006", total: 2_250_000, customer: "Dev Test", phone: "0987654322" },
  { date: "2026-09-14", code: "2609060005TH", total: -30_000, customer: "Dev Test", phone: "0987654322" },
  { date: "2026-09-14", code: "2609060003", total: 750_000 },
  { date: "2026-09-14", code: "2609060002", total: 780_000 },
  { date: "2026-09-09", code: "2609060001", total: 750_000 },
  { date: "2026-09-09", code: "2604010001", total: 750_000, customer: "A AN", address: "CT", phone: "0839234567" },
  { date: "2026-08-24", code: "2608050012", total: 520_000, customer: "Dev Test", phone: "0987654322" },
  { date: "2026-08-24", code: "2608050011", total: 520_000 },
  { date: "2026-08-14", code: "2608050009", total: 10_080_000, customer: "Dev Test", phone: "0987654322" },
  { date: "2026-08-14", code: "2608050008", total: 840_000, customer: "CHỢ ĐÀO", address: "DN", phone: "0869967814" },
  { date: "2026-08-06", code: "2608050004", total: 2_097_000 },
  { date: "2026-08-06", code: "2608050003", total: 1_680_000 },
  { date: "2026-08-06", code: "2608050002", total: 1_046_500 },
];

/** Sinh thêm hóa đơn các tháng 1–7/2026 để lưới có đủ nhiều trang. */
function generatedSeeds(count: number): Seed[] {
  const customers = [undefined, "Dev Test", "CHỢ ĐÀO", "A AN", undefined, "Nguyễn Văn Bình"];
  return Array.from({ length: count }, (_, i) => {
    const month = 7 - (i % 7);
    const day = 28 - ((i * 3) % 27);
    const product = PRODUCTS[i % PRODUCTS.length]!;
    const quantity = (i % 3) + 1;
    const customer = customers[i % customers.length];
    const mm = String(month).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    return {
      date: `2026-${mm}-${dd}`,
      code: `26${mm}0${String(500 + i).padStart(5, "0")}`,
      total: product.price * quantity,
      customer,
      phone: customer ? "09" + String(10_000_000 + i * 7_919).slice(0, 8) : undefined,
      lines: [line(product.sku, product.name, quantity, product.price)],
    };
  });
}

function toRecord(seed: Seed, index: number): EInvoiceRecord {
  // Phần lớn hóa đơn thuộc Đà Nẵng, rải vài hóa đơn cho 2 chi nhánh còn lại.
  const branch = EINVOICE_MOCK_BRANCHES[index % 5 === 3 ? 1 : index % 5 === 4 ? 2 : 0];
  return {
    id: `einv-${seed.code}`,
    branchId: branch.id,
    invoiceDate: seed.date,
    invoiceCode: seed.code,
    total: seed.total,
    promotionTotal: seed.promotionTotal ?? 0,
    unissuedReason: "",
    buyer: {
      ...EMPTY_BUYER,
      unitName: seed.customer ?? "",
      address: seed.address ?? "",
      phone: seed.phone ?? "",
    },
    seller: { ...EMPTY_SELLER },
    lines: seed.lines ?? singleLine(seed.total, index),
    templateNo: "",
    symbol: "",
    issue: null,
  };
}

const RECORDS: EInvoiceRecord[] = [...SCREENSHOT_SEEDS, ...generatedSeeds(44)].map(toRecord);

let providerSequence = 0;

export function getEInvoiceRecords(): readonly EInvoiceRecord[] {
  return RECORDS;
}

export function findEInvoiceRecord(id: string): EInvoiceRecord | undefined {
  return RECORDS.find((r) => r.id === id);
}

export function updateEInvoiceRecord(
  id: string,
  patch: Pick<EInvoiceRecord, "buyer" | "seller" | "templateNo" | "symbol">,
): void {
  const record = findEInvoiceRecord(id);
  if (record) Object.assign(record, patch);
}

/** Chuyển các hóa đơn sang "đã phát hành". Trả về số hóa đơn thực sự phát hành. */
export function issueEInvoiceRecords(
  ids: readonly string[],
  template: { templateNo: string; symbol: string },
  now: Date = new Date(),
): number {
  const today = now.toISOString().slice(0, 10);
  let issued = 0;
  for (const id of ids) {
    const record = findEInvoiceRecord(id);
    if (!record || record.issue) continue;
    providerSequence += 1;
    const info: EInvoiceIssueInfo = {
      issuedDate: today,
      templateSymbol: `${template.templateNo}${template.symbol}`,
      providerInvoiceNo: String(providerSequence).padStart(8, "0"),
      issueStatus: "Đã phát hành",
      invoiceStatus: "Hóa đơn gốc",
      taxAuthorityStatus: "Đã cấp mã",
      emailStatus: record.buyer.sendToCustomer ? "Đã gửi" : "Chưa gửi",
      errorNote: "",
    };
    record.templateNo = template.templateNo;
    record.symbol = template.symbol;
    record.issue = info;
    issued += 1;
  }
  return issued;
}
