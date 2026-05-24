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
import { VoucherLink } from "../_shared/VoucherLink";
import { GoodsReceiptPaymentDialog } from "../goods-receipt-payment-dialog/GoodsReceiptPaymentDialog";
import { READONLY_INPUT_CLASS } from "../../ledger-cash/ledger-cash.constants";
import {
  isGoodsReceiptPaymentVoucher,
  LedgerCashVoucherKindEnum,
  LedgerCashVoucherPurposeEnum,
  type LedgerCashVoucherDetail,
} from "../../ledger-cash/ledger-cash.types";
import {
  DEFAULT_VOUCHER_EMPLOYEE_CODE,
  DEFAULT_VOUCHER_EMPLOYEE_NAME,
  PAYMENT_PURPOSE_DETAIL_OPTIONS,
  PAYMENT_PURPOSE_GROUP_OPTIONS,
  PaymentVoucherPurposeDetailEnum,
  PaymentVoucherPurposeGroupEnum,
  emptyFormLine,
  type VoucherFormLine,
} from "../_shared/voucher-dialog.constants";
import { TreasuryVoucherDialogModeEnum } from "../_shared/voucher-dialog.types";
import {
  buildPaymentDetailFromForm,
  toIsoDate,
  voucherLineTotal,
} from "../_shared/voucher-dialog.utils";

const LABELS = {
  purpose: "Mục đích chi",
  counterparty: "Đối tượng nhận",
  person: "Người nhận",
  reason: "Lý do chi",
  employee: "Nhân viên chi",
  voucherNo: "Số phiếu chi",
  voucherDate: "Ngày chi",
  category: "Mục chi",
  titleCreate: "Thêm mới phiếu chi",
  titleView: "Phiếu chi",
} as const;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: TreasuryVoucherDialogModeEnum;
  initial: LedgerCashVoucherDetail | null;
  nextVoucherNo?: string;
  onSave?: (detail: LedgerCashVoucherDetail) => void;
  onRequestEdit?: () => void;
}

function fieldClass(readOnly: boolean): string | undefined {
  return readOnly ? READONLY_INPUT_CLASS : undefined;
}

export function PaymentVoucherDialog({
  open,
  onOpenChange,
  mode,
  initial,
  nextVoucherNo = "",
  onSave,
  onRequestEdit,
}: Props) {
  const readOnly = mode === TreasuryVoucherDialogModeEnum.VIEW;
  const isGoodsView =
    !!initial && isGoodsReceiptPaymentVoucher(initial) && readOnly;

  const [purposeGroup, setPurposeGroup] = useState(
    PaymentVoucherPurposeGroupEnum.OTHER,
  );
  const [purposeDetail, setPurposeDetail] = useState(
    PaymentVoucherPurposeDetailEnum.OTHER_EXPENSE,
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
  const [countAsExpense, setCountAsExpense] = useState(true);
  const [lines, setLines] = useState<VoucherFormLine[]>([emptyFormLine()]);

  const resetKey = `payment-${mode}-${initial?.voucherNo ?? nextVoucherNo}`;

  useEffect(() => {
    if (!open || isGoodsView) return;
    if (mode === TreasuryVoucherDialogModeEnum.CREATE) {
      setPurposeGroup(PaymentVoucherPurposeGroupEnum.OTHER);
      setPurposeDetail(PaymentVoucherPurposeDetailEnum.OTHER_EXPENSE);
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
      setCountAsExpense(true);
      setLines([emptyFormLine()]);
      return;
    }
    if (initial && !isGoodsReceiptPaymentVoucher(initial)) {
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
    }
  }, [resetKey, open, mode, initial, nextVoucherNo, isGoodsView]);

  const lineTotal = useMemo(() => voucherLineTotal(lines), [lines]);

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

    const categoryDefault =
      PAYMENT_PURPOSE_DETAIL_OPTIONS[purposeGroup].find(
        (o) => o.value === purposeDetail,
      )?.label ?? "";

    onSave(
      buildPaymentDetailFromForm({
        purpose: LedgerCashVoucherPurposeEnum.OTHER,
        counterpartyCode,
        counterpartyName,
        payerName: personName,
        address,
        reason: reason || categoryDefault,
        employeeCode,
        employeeName,
        reference,
        voucherNo: voucherNo.trim(),
        voucherDate,
        lines: validLines,
        categoryDefault,
      }),
    );
    toast.success(
      mode === TreasuryVoucherDialogModeEnum.CREATE
        ? "Đã thêm phiếu chi."
        : "Đã cập nhật phiếu chi.",
    );
    handleClose();
  }, [
    lines,
    voucherNo,
    purposeGroup,
    purposeDetail,
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

  const purposePaymentOptions = PAYMENT_PURPOSE_DETAIL_OPTIONS[purposeGroup];

  if (!open) return null;

  if (isGoodsView && initial) {
    return (
      <GoodsReceiptPaymentDialog
        open={open}
        onOpenChange={onOpenChange}
        detail={initial}
      />
    );
  }

  const linkedDocCode = initial?.goodsReceipt?.receiptNo ?? initial?.reference;

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
          {readOnly ? (
            <span className="text-sm">
              {PAYMENT_PURPOSE_GROUP_OPTIONS[0]?.label} —{" "}
              {purposePaymentOptions.find((o) => o.value === purposeDetail)
                ?.label ?? "Chi khác"}
            </span>
          ) : (
            <div className="flex flex-wrap gap-2">
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={purposeGroup}
                onChange={(e) => {
                  const g = e.target.value as PaymentVoucherPurposeGroupEnum;
                  setPurposeGroup(g);
                  setPurposeDetail(PAYMENT_PURPOSE_DETAIL_OPTIONS[g][0]!.value);
                }}
              >
                {PAYMENT_PURPOSE_GROUP_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={purposeDetail}
                onChange={(e) =>
                  setPurposeDetail(
                    e.target.value as PaymentVoucherPurposeDetailEnum,
                  )
                }
              >
                {purposePaymentOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}
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
          {linkedDocCode ? (
            <FormField label="Chứng từ" layout="horizontal" labelWidth="8rem">
              <VoucherLink code={linkedDocCode} clickable={false} />
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
          <FormField label="Tính vào" layout="horizontal" labelWidth="7.5rem">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={countAsExpense}
                onChange={(e) => setCountAsExpense(e.target.checked)}
                disabled={readOnly}
              />
              <select
                className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
                disabled={readOnly || !countAsExpense}
              >
                <option value="expense">Chi phí</option>
              </select>
            </div>
          </FormField>
        </>
      }
      detail={
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
          <LineItemGrid
            columns={lineColumns}
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
                      prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev,
                    )
            }
            showAddRow={!readOnly}
            showRowActions={!readOnly}
          />
        </div>
      }
      footerSummary={
        <div className="flex justify-end gap-8">
          <span>
            Tổng số tiền: <strong>{formatMoneyInteger(lineTotal)}</strong>
          </span>
        </div>
      }
    />
  );
}
