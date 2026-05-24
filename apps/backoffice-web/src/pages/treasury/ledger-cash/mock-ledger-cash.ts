import {
  LedgerCashDetailTypeEnum,
  LedgerCashDocumentTypeEnum,
  LedgerCashInvoiceKindEnum,
  LedgerCashVoucherKindEnum,
  LedgerCashVoucherPaymentModeEnum,
  LedgerCashVoucherPurposeEnum,
  type LedgerCashInvoiceDetail,
  type LedgerCashRow,
} from "./ledger-cash.types";

const EMPLOYEE = "Phan Thanh Hà";
const EMPLOYEE_CODE = "0000";

function d(iso: string): Date {
  return new Date(iso);
}

/** Full mock ledger for May 2026 (MISA sample). */
export const MOCK_LEDGER_CASH_ROWS: LedgerCashRow[] = [
  {
    id: "opening",
    documentDate: d("2026-05-01T00:00:00"),
    description: "Số dư đầu kỳ",
    amountIn: 0,
    amountOut: 0,
    balance: 1_080_000,
    counterparty: "",
    employee: "",
    documentType: LedgerCashDocumentTypeEnum.OPENING_BALANCE,
    detail: {
      type: LedgerCashDetailTypeEnum.INVOICE,
      data: {
        kind: LedgerCashInvoiceKindEnum.PAYMENT,
        code: "",
        cashier: EMPLOYEE,
        customer: "",
        issuedAt: d("2026-05-01T00:00:00"),
        salesChannel: "",
        lines: [],
        totalPayment: 0,
        goodsAmount: 0,
        cashAmount: 0,
      },
    },
  },
  {
    id: "inv-2604010001",
    documentDate: d("2026-05-05T17:05:00"),
    receiptNo: "2604010001",
    description: "Hóa đơn bán hàng",
    amountIn: 540_000,
    amountOut: 0,
    balance: 1_620_000,
    counterparty: "Anh Hà",
    employee: EMPLOYEE,
    documentType: LedgerCashDocumentTypeEnum.INVOICE_SALE,
    detail: {
      type: LedgerCashDetailTypeEnum.INVOICE,
      data: {
        kind: LedgerCashInvoiceKindEnum.PAYMENT,
        code: "2604010001",
        cashier: EMPLOYEE,
        customer: "Anh Hà",
        issuedAt: d("2026-05-05T17:05:00"),
        phone: "0834561317",
        salesChannel: "Tại cửa hàng",
        lines: [
          {
            sku: "SAN822-D-39",
            name: "Dép nam SAN822-D-39",
            unit: "Đôi",
            quantity: 1,
            unitPrice: 540_000,
            lineAmount: 540_000,
            discountAmount: 0,
            totalAmount: 540_000,
          },
        ],
        totalPayment: 540_000,
        goodsAmount: 540_000,
        customerPaid: 550_000,
        changeAmount: 10_000,
        cashAmount: 550_000,
      },
    },
  },
  {
    id: "inv-2605010002",
    documentDate: d("2026-05-06T10:22:00"),
    receiptNo: "2605010002",
    description: "Hóa đơn bán hàng",
    amountIn: 1_650_000,
    amountOut: 0,
    balance: 3_270_000,
    counterparty: "Anh Hà",
    employee: EMPLOYEE,
    documentType: LedgerCashDocumentTypeEnum.INVOICE_SALE,
    detail: {
      type: LedgerCashDetailTypeEnum.INVOICE,
      data: {
        kind: LedgerCashInvoiceKindEnum.PAYMENT,
        code: "2605010002",
        cashier: EMPLOYEE,
        customer: "Anh Hà",
        issuedAt: d("2026-05-06T10:22:00"),
        salesChannel: "Tại cửa hàng",
        lines: [
          {
            sku: "AKCV19837-D-38",
            name: "Giày nam AKCV19837-D-38",
            unit: "Đôi",
            quantity: 1,
            unitPrice: 1_650_000,
            lineAmount: 1_650_000,
            discountAmount: 0,
            totalAmount: 1_650_000,
          },
        ],
        totalPayment: 1_650_000,
        goodsAmount: 1_650_000,
        customerPaid: 1_650_000,
        cashAmount: 1_650_000,
      },
    },
  },
  {
    id: "inv-2605010003",
    documentDate: d("2026-05-07T14:15:00"),
    receiptNo: "2605010003",
    description: "Hóa đơn bán hàng",
    amountIn: 850_000,
    amountOut: 0,
    balance: 4_120_000,
    counterparty: "Anh Hà",
    employee: EMPLOYEE,
    documentType: LedgerCashDocumentTypeEnum.INVOICE_SALE,
    detail: {
      type: LedgerCashDetailTypeEnum.INVOICE,
      data: {
        kind: LedgerCashInvoiceKindEnum.PAYMENT,
        code: "2605010003",
        cashier: EMPLOYEE,
        customer: "Anh Hà",
        issuedAt: d("2026-05-07T14:15:00"),
        salesChannel: "Tại cửa hàng",
        lines: [
          {
            sku: "MY3007-D-35",
            name: "Dép nữ MY3007-D-35",
            unit: "Đôi",
            quantity: 1,
            unitPrice: 850_000,
            lineAmount: 850_000,
            discountAmount: 0,
            totalAmount: 850_000,
          },
        ],
        totalPayment: 850_000,
        goodsAmount: 850_000,
        customerPaid: 850_000,
        cashAmount: 850_000,
      },
    },
  },
  {
    id: "inv-2605010014",
    documentDate: d("2026-05-08T16:40:00"),
    receiptNo: "2605010014",
    description: "Hóa đơn bán hàng",
    amountIn: 4_170_000,
    amountOut: 0,
    balance: 8_290_000,
    counterparty: "Anh Hà",
    employee: EMPLOYEE,
    documentType: LedgerCashDocumentTypeEnum.INVOICE_SALE,
    detail: {
      type: LedgerCashDetailTypeEnum.INVOICE,
      data: {
        kind: LedgerCashInvoiceKindEnum.PAYMENT,
        code: "2605010014",
        cashier: EMPLOYEE,
        customer: "Anh Hà",
        issuedAt: d("2026-05-08T16:40:00"),
        salesChannel: "Tại cửa hàng",
        lines: [
          {
            sku: "DD1850-D-40",
            name: "Giày nữ DD1850-D-40",
            unit: "Đôi",
            quantity: 2,
            unitPrice: 1_650_000,
            lineAmount: 3_300_000,
            discountAmount: 0,
            totalAmount: 3_300_000,
          },
          {
            sku: "SAN822-D-39",
            name: "Dép nam SAN822-D-39",
            unit: "Đôi",
            quantity: 2,
            unitPrice: 435_000,
            lineAmount: 870_000,
            discountAmount: 0,
            totalAmount: 870_000,
          },
        ],
        totalPayment: 4_170_000,
        goodsAmount: 4_170_000,
        customerPaid: 4_170_000,
        cashAmount: 4_170_000,
      },
    },
  },
  {
    id: "inv-2605010018TH",
    documentDate: d("2026-05-11T19:26:00"),
    paymentNo: "2605010018TH",
    description: "Hóa đơn bán hàng",
    amountIn: 0,
    amountOut: 2_500_000,
    balance: 5_790_000,
    counterparty: "duc anh",
    employee: EMPLOYEE,
    documentType: LedgerCashDocumentTypeEnum.INVOICE_RETURN,
    detail: {
      type: LedgerCashDetailTypeEnum.INVOICE,
      data: {
        kind: LedgerCashInvoiceKindEnum.RETURN,
        code: "2605010018TH",
        cashier: EMPLOYEE,
        customer: "duc anh",
        issuedAt: d("2026-05-11T19:26:00"),
        phone: "3662272727",
        salesChannel: "Tại cửa hàng",
        originalInvoiceCode: "2605010017",
        lines: [
          {
            sku: "MY3007-D-35",
            name: "Dép nữ MY3007-D-35",
            unit: "Đôi",
            quantity: -1,
            unitPrice: 850_000,
            lineAmount: -850_000,
            discountAmount: 0,
            totalAmount: -850_000,
          },
          {
            sku: "AKCV19837-D-38",
            name: "Giày nam AKCV19837-D-38",
            unit: "Đôi",
            quantity: -1,
            unitPrice: 1_650_000,
            lineAmount: -1_650_000,
            discountAmount: 0,
            totalAmount: -1_650_000,
          },
        ],
        totalPayment: -2_500_000,
        goodsAmount: -2_500_000,
        returnValue: -2_500_000,
        refundToCustomer: 2_500_000,
        cashAmount: 2_500_000,
      },
    },
  },
  {
    id: "pt-000001",
    documentDate: d("2026-05-11T11:00:00"),
    receiptNo: "PT000001",
    description: "Thu nợ từ duc anh",
    amountIn: 1_650_000,
    amountOut: 0,
    balance: 7_440_000,
    counterparty: "duc anh",
    employee: EMPLOYEE,
    documentType: LedgerCashDocumentTypeEnum.CASH_RECEIPT,
    detail: {
      type: LedgerCashDetailTypeEnum.VOUCHER,
      data: {
        kind: LedgerCashVoucherKindEnum.RECEIPT,
        purpose: LedgerCashVoucherPurposeEnum.DEBT_COLLECTION,
        voucherNo: "PT000001",
        voucherDate: d("2026-05-11T00:00:00"),
        counterpartyCode: "KH000017",
        counterpartyName: "duc anh",
        payerName: "",
        address: "",
        reason: "Thu nợ từ duc anh",
        employeeCode: EMPLOYEE_CODE,
        employeeName: EMPLOYEE,
        lines: [
          {
            description: "Thu nợ từ duc anh",
            amount: 1_650_000,
            category: "Thu từ bán hàng",
          },
        ],
        documentLines: [
          {
            documentDate: d("2026-05-05T00:00:00"),
            documentNo: "2605010002",
            debtAmount: 1_650_000,
            collectedAmount: 0,
            remainingAmount: 1_650_000,
            collectAmount: 1_650_000,
          },
        ],
      },
    },
  },
  {
    id: "pc-000001",
    documentDate: d("2026-05-18T09:30:00"),
    paymentNo: "PC000001",
    description: "Thanh toán tiền nhập hàng hóa",
    amountIn: 0,
    amountOut: 1_397_500,
    balance: 6_042_500,
    counterparty: "Test NCC",
    employee: EMPLOYEE,
    documentType: LedgerCashDocumentTypeEnum.GOODS_RECEIPT_PAYMENT,
    detail: {
      type: LedgerCashDetailTypeEnum.VOUCHER,
      data: {
        kind: LedgerCashVoucherKindEnum.PAYMENT,
        purpose: LedgerCashVoucherPurposeEnum.OTHER,
        voucherNo: "PC000001",
        voucherDate: d("2026-05-18T00:00:00"),
        counterpartyCode: "NCC000001",
        counterpartyName: "Test NCC",
        address: "HCM",
        reason: "Thanh toán tiền nhập hàng hóa",
        employeeCode: EMPLOYEE_CODE,
        employeeName: EMPLOYEE,
        paymentMode: LedgerCashVoucherPaymentModeEnum.PAY_NOW,
        paymentMethod: "Tiền mặt",
        receiveWithInvoice: false,
        goodsReceipt: {
          receiptNo: "NK000018",
          receiptDate: d("2026-05-18T00:00:00"),
          receiptTime: "22:02",
          delivererName: "duc anh 2",
          narrative:
            "Nhập hàng từ NCC000001 - Test NCC theo phiếu đặt hàng số PO000001",
          purchaseEmployeeCode: EMPLOYEE_CODE,
          purchaseEmployeeName: EMPLOYEE,
        },
        lines: [
          {
            description: "Thanh toán tiền nhập hàng hóa",
            amount: 1_397_500,
            category: "Chi mua hàng",
          },
        ],
        skuLines: [
          {
            sku: "BT15",
            name: "BT15",
            warehouse: "KHO CẦN THƠ",
            location: "",
            unit: "Đôi",
            quantity: 1,
            unitPrice: 350_000,
          },
          {
            sku: "DD1200",
            name: "Dây thắt lưng DD1200",
            warehouse: "KHO CẦN THƠ",
            location: "",
            unit: "Đôi",
            quantity: 1,
            unitPrice: 350_000,
          },
          {
            sku: "DD1850",
            name: "Dây thắt lưng DD1850",
            warehouse: "KHO CẦN THƠ",
            location: "",
            unit: "Đôi",
            quantity: 1,
            unitPrice: 347_500,
          },
          {
            sku: "DD140",
            name: "Dây thắt lưng DD140",
            warehouse: "KHO CẦN THƠ",
            location: "",
            unit: "Đôi",
            quantity: 1,
            unitPrice: 350_000,
          },
        ],
        discountAmount: 0,
        taxAmount: 0,
      },
    },
  },
  {
    id: "pt-000002",
    documentDate: d("2026-05-13T10:00:00"),
    receiptNo: "PT000002",
    description: "Thu nợ của khách hàng duc anh",
    amountIn: 175_000,
    amountOut: 0,
    balance: 7_615_000,
    counterparty: "duc anh",
    employee: EMPLOYEE,
    documentType: LedgerCashDocumentTypeEnum.CASH_RECEIPT,
    detail: {
      type: LedgerCashDetailTypeEnum.VOUCHER,
      data: {
        kind: LedgerCashVoucherKindEnum.RECEIPT,
        purpose: LedgerCashVoucherPurposeEnum.DEBT_COLLECTION,
        voucherNo: "PT000002",
        voucherDate: d("2026-05-13T00:00:00"),
        counterpartyCode: "KH000017",
        counterpartyName: "duc anh",
        payerName: "duc anh",
        address: "",
        reason: "Thu nợ của khách hàng duc anh",
        employeeCode: EMPLOYEE_CODE,
        employeeName: EMPLOYEE,
        reference: "2605010002",
        lines: [
          {
            description: "Thu nợ của khách hàng duc anh",
            amount: 175_000,
            category: "",
          },
        ],
        documentLines: [
          {
            documentDate: d("2026-05-06T00:00:00"),
            documentNo: "2605010002",
            debtAmount: 175_000,
            collectedAmount: 0,
            remainingAmount: 175_000,
            collectAmount: 175_000,
          },
        ],
      },
    },
  },
  {
    id: "pt-000004",
    documentDate: d("2026-05-15T14:30:00"),
    receiptNo: "PT000004",
    description: "Thu nợ của khách hàng duc anh",
    amountIn: 175_000,
    amountOut: 0,
    balance: 7_790_000,
    counterparty: "duc anh",
    employee: EMPLOYEE,
    documentType: LedgerCashDocumentTypeEnum.CASH_RECEIPT,
    detail: {
      type: LedgerCashDetailTypeEnum.VOUCHER,
      data: {
        kind: LedgerCashVoucherKindEnum.RECEIPT,
        purpose: LedgerCashVoucherPurposeEnum.DEBT_COLLECTION,
        voucherNo: "PT000004",
        voucherDate: d("2026-05-15T00:00:00"),
        counterpartyCode: "KH000017",
        counterpartyName: "duc anh",
        payerName: "duc anh",
        address: "",
        reason: "Thu nợ của khách hàng duc anh",
        employeeCode: EMPLOYEE_CODE,
        employeeName: EMPLOYEE,
        lines: [
          {
            description: "Thu nợ của khách hàng duc anh",
            amount: 175_000,
            category: "Thu từ bán hàng",
          },
        ],
      },
    },
  },
  {
    id: "pc-000002",
    documentDate: d("2026-05-21T09:00:00"),
    paymentNo: "PC000002",
    description: "Chi khác",
    amountIn: 0,
    amountOut: 0,
    balance: 6_042_500,
    counterparty: "",
    employee: EMPLOYEE,
    documentType: LedgerCashDocumentTypeEnum.CASH_PAYMENT,
    detail: {
      type: LedgerCashDetailTypeEnum.VOUCHER,
      data: {
        kind: LedgerCashVoucherKindEnum.PAYMENT,
        purpose: LedgerCashVoucherPurposeEnum.OTHER,
        voucherNo: "PC000002",
        voucherDate: d("2026-05-21T00:00:00"),
        counterpartyCode: "",
        counterpartyName: "",
        address: "",
        reason: "",
        employeeCode: EMPLOYEE_CODE,
        employeeName: EMPLOYEE,
        lines: [{ description: "", amount: 0, category: "" }],
      },
    },
  },
];

/** Find invoice detail by document code across ledger rows. */
export function findLedgerCashInvoiceByCode(
  code: string,
  rows: LedgerCashRow[] = MOCK_LEDGER_CASH_ROWS,
): LedgerCashInvoiceDetail | null {
  const normalized = code.trim();
  if (!normalized) return null;

  for (const row of rows) {
    if (row.detail.type !== LedgerCashDetailTypeEnum.INVOICE) continue;
    const inv = row.detail.data;
    if (inv.code === normalized) return inv;
    if (row.receiptNo === normalized || row.paymentNo === normalized) {
      return inv;
    }
  }
  return null;
}

/** Parse `YYYY-MM-DD` as local calendar date (avoids UTC shift). */
export function parseLedgerPeriodDate(iso: string, endOfDay = false): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
}

function isWithinLedgerPeriod(date: Date, from: Date, to: Date): boolean {
  const t = date.getTime();
  return t >= from.getTime() && t <= to.getTime();
}

/**
 * Opening balance is always row 1; transactions filtered by document date.
 */
export function buildLedgerCashViewRows(
  rows: LedgerCashRow[],
  periodFrom: string,
  periodTo: string,
): { opening: LedgerCashRow | null; transactions: LedgerCashRow[] } {
  const from = parseLedgerPeriodDate(periodFrom);
  const to = parseLedgerPeriodDate(periodTo, true);

  const opening =
    rows.find(
      (r) => r.documentType === LedgerCashDocumentTypeEnum.OPENING_BALANCE,
    ) ?? null;

  const transactions = rows
    .filter(
      (r) =>
        r.documentType !== LedgerCashDocumentTypeEnum.OPENING_BALANCE &&
        isWithinLedgerPeriod(r.documentDate, from, to),
    )
    .sort((a, b) => a.documentDate.getTime() - b.documentDate.getTime());

  return { opening, transactions };
}
