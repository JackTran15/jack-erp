import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  cn,
  DateTimeField,
  DocumentFormDialog,
  FormField,
  Input,
  LineItemGrid,
  MoneyInput,
  formatMoneyInteger,
  type LineColumn,
  type ToolbarItem,
} from "@erp/ui";
import { Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";
import { RadioGroup } from "../../../../components/forms/RadioGroup";
import { BaseDataTable } from "../../../../components/table/BaseDataTable";
import { Tabs } from "../../../../components/tabs";
import { VoucherLink } from "../_shared/VoucherLink";
import { RECEIPT_VOUCHER_PURPOSE_OPTIONS } from "./receipt-voucher.constants";
import { useReceiptVoucherDetailColumns } from "./useReceiptVoucherDetailColumns";
import { READONLY_INPUT_CLASS } from "../../ledger-cash/ledger-cash.constants";
import {
  LedgerCashVoucherKindEnum,
  LedgerCashVoucherPurposeEnum,
  resolveInvoiceCodeFromVoucher,
  type LedgerCashVoucherDetail,
} from "../../ledger-cash/ledger-cash.types";
import {
  DEFAULT_VOUCHER_EMPLOYEE_CODE,
  DEFAULT_VOUCHER_EMPLOYEE_NAME,
  emptyFormLine,
  type VoucherFormLine,
} from "../_shared/voucher-dialog.constants";
import { TreasuryVoucherDialogModeEnum } from "../_shared/voucher-dialog.types";
import {
  buildReceiptDetailFromForm,
  toIsoDate,
  voucherLineTotal,
} from "../_shared/voucher-dialog.utils";

enum DetailTabEnum {
  LINES = "lines",
  DOCUMENTS = "documents",
}

const DETAIL_TABS = [
  { id: DetailTabEnum.LINES, label: "Chi tiết" },
  { id: DetailTabEnum.DOCUMENTS, label: "Chứng từ" },
] as const;

const LABELS = {
  purpose: "Mục đích thu",
  counterparty: "Đối tượng nộp",
  person: "Người nộp",
  reason: "Lý do thu",
  employee: "Nhân viên thu",
  voucherNo: "Số phiếu thu",
  voucherDate: "Ngày thu",
  category: "Mục thu",
  titleCreate: "Thêm mới phiếu thu",
  titleView: "Phiếu thu",
} as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: TreasuryVoucherDialogModeEnum;
  initial: LedgerCashVoucherDetail | null;
  nextVoucherNo?: string;
  onSave?: (detail: LedgerCashVoucherDetail) => void;
  onRequestEdit?: () => void;
  onOpenInvoice?: (code: string) => void;
}

function fieldClass(readOnly: boolean): string | undefined {
  return readOnly ? READONLY_INPUT_CLASS : undefined;
}

export function ReceiptVoucherDialog({
  open,
  onOpenChange,
  mode,
  initial,
  nextVoucherNo = "",
  onSave,
  onRequestEdit,
  onOpenInvoice,
}: Props) {
  const readOnly = mode === TreasuryVoucherDialogModeEnum.VIEW;

  const [purpose, setPurpose] = useState<LedgerCashVoucherPurposeEnum>(
    LedgerCashVoucherPurposeEnum.OTHER,
  );
  const [counterpartyCode, setCounterpartyCode] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [personName, setPersonName] = useState("");
  const [address, setAddress] = useState("");
  const [reason, setReason] = useState("");
  const [employeeCode, setEmployeeCode] = useState(
    DEFAULT_VOUCHER_EMPLOYEE_CODE,
  );
  const [employeeName, setEmployeeName] = useState(
    DEFAULT_VOUCHER_EMPLOYEE_NAME,
  );
  const [reference, setReference] = useState("");
  const [voucherNo, setVoucherNo] = useState("");
  const [voucherDate, setVoucherDate] = useState(toIsoDate(new Date()));
  const [lines, setLines] = useState<VoucherFormLine[]>([emptyFormLine()]);
  const [documentLines, setDocumentLines] = useState<
    LedgerCashVoucherDetail["documentLines"]
  >([]);
  const [detailTab, setDetailTab] = useState<DetailTabEnum>(
    DetailTabEnum.LINES,
  );

  const resetKey = `receipt-${mode}-${initial?.voucherNo ?? nextVoucherNo}`;

  useEffect(() => {
    if (!open) return;
    if (mode === TreasuryVoucherDialogModeEnum.CREATE) {
      setPurpose(LedgerCashVoucherPurposeEnum.OTHER);
      setCounterpartyCode("");
      setCounterpartyName("");
      setPersonName("");
      setAddress("");
      setReason("");
      setEmployeeCode(DEFAULT_VOUCHER_EMPLOYEE_CODE);
      setEmployeeName(DEFAULT_VOUCHER_EMPLOYEE_NAME);
      setReference("");
      setVoucherNo(nextVoucherNo);
      setVoucherDate(toIsoDate(new Date()));
      setLines([emptyFormLine()]);
      setDocumentLines([]);
      setDetailTab(DetailTabEnum.LINES);
      return;
    }
    if (initial) {
      setPurpose(initial.purpose);
      setCounterpartyCode(initial.counterpartyCode);
      setCounterpartyName(initial.counterpartyName);
      setPersonName(initial.payerName ?? "");
      setAddress(initial.address ?? "");
      setReason(initial.reason);
      setEmployeeCode(initial.employeeCode);
      setEmployeeName(initial.employeeName);
      setReference(initial.reference ?? "");
      setVoucherNo(initial.voucherNo);
      setVoucherDate(toIsoDate(new Date(initial.voucherDate)));
      setLines(
        initial.lines.length > 0
          ? initial.lines.map((l) => ({
              description: l.description,
              amount: l.amount,
              category: l.category,
            }))
          : [emptyFormLine()],
      );
      setDocumentLines(initial.documentLines ?? []);
      setDetailTab(DetailTabEnum.LINES);
    }
  }, [resetKey, open, mode, initial, nextVoucherNo]);

  const lineTotal = useMemo(() => voucherLineTotal(lines), [lines]);

  const linkedInvoiceCode = useMemo(
    () =>
      initial
        ? resolveInvoiceCodeFromVoucher({
            ...initial,
            reference,
            documentLines,
          })
        : resolveInvoiceCodeFromVoucher({
            kind: LedgerCashVoucherKindEnum.RECEIPT,
            purpose,
            voucherNo,
            voucherDate: new Date(voucherDate),
            counterpartyCode,
            counterpartyName,
            reason,
            employeeCode,
            employeeName,
            reference: reference || undefined,
            lines: [],
            documentLines,
          }),
    [
      initial,
      reference,
      documentLines,
      purpose,
      voucherNo,
      voucherDate,
      counterpartyCode,
      counterpartyName,
      reason,
      employeeCode,
      employeeName,
    ],
  );

  const showDocumentTab = (documentLines?.length ?? 0) > 0;

  const detailForColumns = useMemo(
    (): LedgerCashVoucherDetail => ({
      kind: LedgerCashVoucherKindEnum.RECEIPT,
      purpose,
      voucherNo,
      voucherDate: new Date(voucherDate),
      counterpartyCode,
      counterpartyName,
      reason,
      employeeCode,
      employeeName,
      lines: lines.map((l) => ({
        description: l.description,
        amount: Number(l.amount) || 0,
        category: l.category,
      })),
      documentLines,
    }),
    [
      purpose,
      voucherNo,
      voucherDate,
      counterpartyCode,
      counterpartyName,
      reason,
      employeeCode,
      employeeName,
      lines,
      documentLines,
    ],
  );

  const {
    lineColumnsWithFooter,
    documentColumnsWithFooter,
    documentLines: docRows,
  } = useReceiptVoucherDetailColumns(detailForColumns, onOpenInvoice);

  const lineColumns: LineColumn<VoucherFormLine>[] = useMemo(
    () => [
      {
        key: "description",
        label: "Diễn giải",
        width: 280,
        type: readOnly ? "readonly" : undefined,
        getValue: (r) => r.description,
        renderEditor: readOnly
          ? undefined
          : (row, _idx, onChange) => (
              <Input
                value={row.description}
                onChange={(e) => onChange(e.target.value)}
              />
            ),
      },
      {
        key: "amount",
        label: "Số tiền",
        width: 140,
        align: "right",
        type: readOnly ? "readonly" : undefined,
        getValue: (r) => formatMoneyInteger(r.amount),
        renderEditor: readOnly
          ? undefined
          : (row, _idx, onChange) => (
              <MoneyInput
                value={row.amount}
                onChange={(v) => onChange(v === "" ? 0 : v)}
              />
            ),
      },
      {
        key: "category",
        label: LABELS.category,
        width: 160,
        type: readOnly ? "readonly" : undefined,
        getValue: (r) => r.category,
        renderEditor: readOnly
          ? undefined
          : (row, _idx, onChange) => (
              <Input
                value={row.category}
                onChange={(e) => onChange(e.target.value)}
              />
            ),
      },
    ],
    [readOnly],
  );

  const lineColumnsWithFooterEdit = useMemo(
    (): LineColumn<VoucherFormLine>[] =>
      lineColumns.map((c) =>
        c.key === "amount"
          ? {
              ...c,
              footer: (
                <span className="font-semibold">
                  {formatMoneyInteger(lineTotal)}
                </span>
              ),
            }
          : c.key === "description"
            ? { ...c, footer: <span className="font-semibold">Tổng</span> }
            : c,
      ),
    [lineColumns, lineTotal],
  );

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSave = useCallback(() => {
    if (!onSave) return;
    const validLines = lines.filter(
      (l) => l.description.trim() || Number(l.amount) > 0,
    );
    if (validLines.length === 0) {
      toast.error("Vui lòng nhập ít nhất một dòng chi tiết.");
      return;
    }
    if (voucherLineTotal(validLines) <= 0) {
      toast.error("Tổng số tiền phải lớn hơn 0.");
      return;
    }
    if (!voucherNo.trim()) {
      toast.error(`${LABELS.voucherNo} không được để trống.`);
      return;
    }

    onSave(
      buildReceiptDetailFromForm({
        purpose,
        counterpartyCode,
        counterpartyName,
        payerName: personName,
        address,
        reason,
        employeeCode,
        employeeName,
        reference,
        voucherNo: voucherNo.trim(),
        voucherDate,
        lines: validLines,
        documentLines,
      }),
    );
    toast.success(
      mode === TreasuryVoucherDialogModeEnum.CREATE
        ? "Đã thêm phiếu thu."
        : "Đã cập nhật phiếu thu.",
    );
    handleClose();
  }, [
    lines,
    voucherNo,
    purpose,
    counterpartyCode,
    counterpartyName,
    personName,
    address,
    reason,
    employeeCode,
    employeeName,
    reference,
    voucherDate,
    mode,
    onSave,
    handleClose,
    documentLines,
  ]);

  const toolbarItems: ToolbarItem[] = useMemo(() => {
    const items: ToolbarItem[] = [];
    if (readOnly && onRequestEdit) {
      items.push({
        id: "edit",
        label: "Sửa",
        icon: Pencil,
        onClick: onRequestEdit,
      });
    }
    if (!readOnly && onSave) {
      items.push({
        id: "save",
        label: "Lưu",
        icon: Save,
        onClick: handleSave,
      });
    }
    items.push({
      id: "close",
      label: "Đóng",
      icon: X,
      onClick: handleClose,
    });
    return items;
  }, [readOnly, onRequestEdit, handleSave, handleClose, onSave]);

  const title =
    mode === TreasuryVoucherDialogModeEnum.CREATE
      ? LABELS.titleCreate
      : `${LABELS.titleView} ${voucherNo}`;

  const inputProps = {
    readOnly,
    disabled: readOnly,
    className: fieldClass(readOnly),
  };

  if (!open) return null;

  return (
    <DocumentFormDialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) handleClose();
      }}
      title={title}
      toolbarItems={toolbarItems}
      purpose={
        <FormField label={LABELS.purpose} layout="horizontal" labelWidth="8rem">
          <RadioGroup
            name="voucher-purpose"
            value={purpose}
            options={[...RECEIPT_VOUCHER_PURPOSE_OPTIONS]}
            onChange={setPurpose}
            readOnly={readOnly}
          />
        </FormField>
      }
      generalInfo={
        <>
          <FormField
            label={LABELS.counterparty}
            layout="horizontal"
            labelWidth="8rem"
          >
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={counterpartyCode}
                onChange={(e) => setCounterpartyCode(e.target.value)}
                placeholder="Mã"
                {...inputProps}
              />
              <Input
                value={counterpartyName}
                onChange={(e) => setCounterpartyName(e.target.value)}
                placeholder="Tên"
                {...inputProps}
              />
            </div>
          </FormField>
          <FormField
            label={LABELS.person}
            layout="horizontal"
            labelWidth="8rem"
          >
            <Input
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              {...inputProps}
            />
          </FormField>
          <FormField label="Địa chỉ" layout="horizontal" labelWidth="8rem">
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              {...inputProps}
            />
          </FormField>
          <FormField
            label={LABELS.reason}
            layout="horizontal"
            labelWidth="8rem"
          >
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              {...inputProps}
            />
          </FormField>
          <FormField
            label={LABELS.employee}
            layout="horizontal"
            labelWidth="8rem"
          >
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                {...inputProps}
              />
              <Input
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
                {...inputProps}
              />
            </div>
          </FormField>
          <FormField label="Tham chiếu" layout="horizontal" labelWidth="8rem">
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              {...inputProps}
            />
          </FormField>
          {linkedInvoiceCode ? (
            <FormField label="Chứng từ" layout="horizontal" labelWidth="8rem">
              <VoucherLink
                code={linkedInvoiceCode}
                clickable={!!onOpenInvoice}
                onClick={() => onOpenInvoice?.(linkedInvoiceCode)}
              />
            </FormField>
          ) : null}
          <FormField
            label="Tài liệu đính kèm"
            layout="horizontal"
            labelWidth="8rem"
          >
            <Button variant="outline" size="sm" disabled>
              Tải tệp…
            </Button>
          </FormField>
        </>
      }
      documentInfo={
        <>
          <FormField
            label={LABELS.voucherNo}
            layout="horizontal"
            labelWidth="7.5rem"
          >
            <Input
              value={voucherNo}
              onChange={(e) => setVoucherNo(e.target.value)}
              readOnly={readOnly || mode === TreasuryVoucherDialogModeEnum.EDIT}
              disabled={readOnly || mode === TreasuryVoucherDialogModeEnum.EDIT}
              className={fieldClass(
                readOnly || mode === TreasuryVoucherDialogModeEnum.EDIT,
              )}
            />
          </FormField>
          <FormField
            label={LABELS.voucherDate}
            layout="horizontal"
            labelWidth="7.5rem"
          >
            <DateTimeField
              value={voucherDate}
              onChange={(e) => setVoucherDate(e.target.value)}
              includeTime={false}
              disabled={readOnly}
              className={cn(fieldClass(readOnly))}
            />
          </FormField>
        </>
      }
      detail={
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {showDocumentTab && readOnly ? (
            <Tabs
              tabs={DETAIL_TABS}
              activeTab={detailTab}
              onTabChange={setDetailTab}
            />
          ) : null}
          {detailTab === DetailTabEnum.DOCUMENTS &&
          showDocumentTab &&
          readOnly ? (
            <BaseDataTable
              columns={documentColumnsWithFooter}
              rows={docRows}
              loading={false}
              emptyLabel="Không có chứng từ."
              getRowKey={(r) => r.documentNo}
              className="min-h-0 flex-1"
            />
          ) : readOnly ? (
            <BaseDataTable
              columns={lineColumnsWithFooter}
              rows={detailForColumns.lines}
              loading={false}
              emptyLabel="Không có dòng chi tiết."
              getRowKey={(_, index) => String(index)}
              className="min-h-0 flex-1"
            />
          ) : (
            <LineItemGrid
              className="min-h-0 flex-1"
              columns={lineColumnsWithFooterEdit}
              rows={lines}
              onChangeCell={
                readOnly
                  ? undefined
                  : (idx, key, value) => {
                      setLines((prev) =>
                        prev.map((l, i) =>
                          i === idx ? { ...l, [key]: value } : l,
                        ),
                      );
                    }
              }
              onAddRow={
                readOnly
                  ? undefined
                  : () => setLines((prev) => [...prev, emptyFormLine()])
              }
              onDeleteRow={
                readOnly
                  ? undefined
                  : (idx) =>
                      setLines((prev) =>
                        prev.length > 1
                          ? prev.filter((_, i) => i !== idx)
                          : prev,
                      )
              }
              showAddRow={!readOnly}
              showRowActions={!readOnly}
            />
          )}
        </div>
      }
    />
  );
}
