import { useCallback, useMemo, useState } from "react";
import {
  LedgerCashDetailTypeEnum,
  LedgerCashDocumentTypeEnum,
  LedgerCashVoucherKindEnum,
  type LedgerCashRow,
  type LedgerCashVoucherDetail,
} from "../../ledger-cash/ledger-cash.types";
import { buildReceiptCashSeedRows } from "./mock-receipt-cash";
import {
  cloneLedgerCashRow,
  formatVoucherNumber,
  getReceiptCashTotalAmount,
  getReceiptCashVoucherNo,
  hydrateLedgerCashRowDates,
  parseVoucherNumberSuffix,
} from "./receipt-cash.utils";

function nextVoucherSeq(rows: LedgerCashRow[], prefix: "PT" | "PC"): number {
  let max = 0;
  for (const row of rows) {
    const no = getReceiptCashVoucherNo(row);
    max = Math.max(max, parseVoucherNumberSuffix(no, prefix));
  }
  return max + 1;
}

function rowFromVoucherDetail(
  detail: LedgerCashVoucherDetail,
  id: string,
  documentType: LedgerCashDocumentTypeEnum,
): LedgerCashRow {
  const amount = detail.lines.reduce((s, l) => s + l.amount, 0);
  const isReceipt = detail.kind === LedgerCashVoucherKindEnum.RECEIPT;
  return {
    id,
    documentDate: new Date(detail.voucherDate),
    receiptNo: isReceipt ? detail.voucherNo : undefined,
    paymentNo: isReceipt ? undefined : detail.voucherNo,
    description: detail.reason,
    amountIn: isReceipt ? amount : 0,
    amountOut: isReceipt ? 0 : amount,
    balance: 0,
    counterparty: detail.counterpartyName,
    employee: detail.employeeName,
    documentType,
    detail: { type: LedgerCashDetailTypeEnum.VOUCHER, data: detail },
  };
}

export function useReceiptCashMockStore() {
  const [rows, setRows] = useState<LedgerCashRow[]>(() =>
    buildReceiptCashSeedRows().map(hydrateLedgerCashRowDates),
  );

  const addRow = useCallback(
    (detail: LedgerCashVoucherDetail): LedgerCashRow => {
      const isReceipt = detail.kind === LedgerCashVoucherKindEnum.RECEIPT;
      const documentType = isReceipt
        ? LedgerCashDocumentTypeEnum.CASH_RECEIPT
        : LedgerCashDocumentTypeEnum.CASH_PAYMENT;
      let created!: LedgerCashRow;
      setRows((prev) => {
        const prefix = isReceipt ? "PT" : "PC";
        const voucherNo =
          detail.voucherNo ||
          formatVoucherNumber(prefix, nextVoucherSeq(prev, prefix));
        const nextDetail = { ...detail, voucherNo };
        const id = `${prefix.toLowerCase()}-${voucherNo}`;
        created = rowFromVoucherDetail(nextDetail, id, documentType);
        return [...prev, created];
      });
      return created;
    },
    [],
  );

  const updateRow = useCallback(
    (id: string, detail: LedgerCashVoucherDetail) => {
      setRows((prev) =>
        prev.map((row) => {
          if (row.id !== id) return row;
          const isReceipt = detail.kind === LedgerCashVoucherKindEnum.RECEIPT;
          const documentType = isReceipt
            ? LedgerCashDocumentTypeEnum.CASH_RECEIPT
            : row.documentType ===
                LedgerCashDocumentTypeEnum.GOODS_RECEIPT_PAYMENT
              ? LedgerCashDocumentTypeEnum.GOODS_RECEIPT_PAYMENT
              : LedgerCashDocumentTypeEnum.CASH_PAYMENT;
          const amount = detail.lines.reduce((s, l) => s + l.amount, 0);
          return {
            ...row,
            documentDate: new Date(detail.voucherDate),
            receiptNo: isReceipt ? detail.voucherNo : row.receiptNo,
            paymentNo: isReceipt ? row.paymentNo : detail.voucherNo,
            description: detail.reason,
            amountIn: isReceipt ? amount : 0,
            amountOut: isReceipt ? 0 : amount,
            counterparty: detail.counterpartyName,
            employee: detail.employeeName,
            documentType,
            detail: { type: LedgerCashDetailTypeEnum.VOUCHER, data: detail },
          };
        }),
      );
    },
    [],
  );

  const removeRow = useCallback((id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const duplicateRow = useCallback(
    (id: string): LedgerCashRow | null => {
      const source = rows.find((r) => r.id === id);
      if (!source || source.detail.type !== LedgerCashDetailTypeEnum.VOUCHER) {
        return null;
      }
      if (
        source.documentType === LedgerCashDocumentTypeEnum.GOODS_RECEIPT_PAYMENT
      ) {
        return null;
      }
      const cloned = hydrateLedgerCashRowDates(cloneLedgerCashRow(source));
      if (cloned.detail.type !== LedgerCashDetailTypeEnum.VOUCHER) return null;
      const detail = cloned.detail.data;
      const isReceipt = detail.kind === LedgerCashVoucherKindEnum.RECEIPT;
      const prefix = isReceipt ? "PT" : "PC";
      const voucherNo = formatVoucherNumber(
        prefix,
        nextVoucherSeq(rows, prefix),
      );
      detail.voucherNo = voucherNo;
      detail.voucherDate = new Date();
      const newId = `${prefix.toLowerCase()}-${voucherNo}-copy`;
      const newRow = rowFromVoucherDetail(
        detail,
        newId,
        isReceipt
          ? LedgerCashDocumentTypeEnum.CASH_RECEIPT
          : LedgerCashDocumentTypeEnum.CASH_PAYMENT,
      );
      setRows((prev) => [...prev, newRow]);
      return newRow;
    },
    [rows],
  );

  const reloadFromSeed = useCallback(() => {
    setRows(buildReceiptCashSeedRows().map(hydrateLedgerCashRowDates));
  }, []);

  const allRowsForInvoiceLookup = useMemo(
    () => [...rows, ...buildReceiptCashSeedRows()],
    [rows],
  );

  return {
    rows,
    setRows,
    addRow,
    updateRow,
    removeRow,
    duplicateRow,
    reloadFromSeed,
    allRowsForInvoiceLookup,
    getRowById: (id: string | null) =>
      id ? (rows.find((r) => r.id === id) ?? null) : null,
    getTotalAmount: (list: LedgerCashRow[]) =>
      list.reduce((s, r) => s + getReceiptCashTotalAmount(r), 0),
  };
}
