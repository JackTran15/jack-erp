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
import { DocumentType } from "@erp/shared-interfaces";
import { Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";
import { useGenerateDocumentNumber } from "../../../../hooks/document-numbering/useGenerateDocumentNumber";
import { RadioGroup } from "../../../../components/forms/RadioGroup";
import { BaseDataTable, type TableColumn } from "../../../../components/table/BaseDataTable";
import {
  BankPaymentPurpose,
  SupplierDepositPaymentFund,
  type BankPayment,
  type CreateBankPaymentBody,
  type CreateSupplierDepositPaymentBody,
} from "../../bank-vouchers.types";
import { CashVoucherCategoryDirection, CashVoucherPartnerType } from "../../cash-vouchers.types";
import { useCashVoucherCategories } from "../../../../hooks/treasury/use-cash-voucher-categories";
import type { LedgerCashVoucherDocumentLine } from "../../ledger-cash/ledger-cash.types";
import {
  DebtRepaymentPickDialog,
  type DebtRepaymentPickResult,
} from "../payment-voucher-dialog/DebtRepaymentPickDialog";
import { READONLY_INPUT_CLASS } from "../../ledger-cash/ledger-cash.constants";
import {
  emptyFormLine,
  type VoucherFormLine,
} from "../_shared/voucher-dialog.constants";
import { TreasuryVoucherDialogModeEnum } from "../_shared/voucher-dialog.types";
import { voucherLineTotal } from "../_shared/voucher-dialog.utils";
import { DepositAccountSelect } from "../_shared/DepositAccountSelect";
import {
  QuickCreateCustomerDialog,
  QuickCreateEmployeeDialog,
  QuickCreateProviderDialog,
} from "../../../../components/forms/QuickCreateDialogs";
import { VoucherDocumentNumberField } from "../_shared/VoucherDocumentNumberField";
import { VoucherEntitySearchModal } from "../_shared/VoucherEntitySearchModal";
import type { VoucherEntitySearchTarget } from "../_shared/voucher-entity-search.store";
import { VoucherPartnerFields } from "../_shared/VoucherPartnerFields";
import { VoucherStaffFields } from "../_shared/VoucherStaffFields";
import type { VoucherPartnerOption } from "../_shared/voucher-partner-search";
import {
  PartnerLookupType,
  inferLookupType,
} from "../_shared/voucher-partner.constants";
import { usePartnerLookup } from "../_shared/voucher-partner-search";

const LABELS = {
  purpose: "Mục đích chi",
  account: "Tài khoản chi",
  counterparty: "Đối tượng nhận",
  person: "Người nhận",
  reason: "Lý do chi",
  employee: "Nhân viên chi",
  voucherNo: "Số phiếu chi",
  voucherDate: "Ngày chi",
  category: "Mục chi",
  titleCreate: "Thêm mới phiếu chi tiền gửi",
  titleView: "Phiếu chi tiền gửi",
} as const;

const PAYMENT_PURPOSE_OPTIONS = [
  { value: BankPaymentPurpose.OTHER, label: "Khác" },
  { value: BankPaymentPurpose.SUPPLIER_PAYMENT, label: "Trả nợ NCC" },
  { value: BankPaymentPurpose.PURCHASE, label: "Mua hàng" },
  { value: BankPaymentPurpose.EXPENSE, label: "Chi phí" },
  { value: BankPaymentPurpose.REFUND, label: "Hoàn tiền" },
  { value: BankPaymentPurpose.BANK_FEE, label: "Phí ngân hàng" },
  { value: BankPaymentPurpose.CASH_TRANSFER, label: "Chuyển thành tiền mặt" },
  {
    value: BankPaymentPurpose.INTER_BRANCH_OUT,
    label: "Chuyển tiền đến chi nhánh khác (GĐ4)",
    disabled: true,
  },
] as const;

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lookupTypeToPartnerType(kind: PartnerLookupType): CashVoucherPartnerType {
  switch (kind) {
    case PartnerLookupType.CUSTOMER:
      return CashVoucherPartnerType.CUSTOMER;
    case PartnerLookupType.EMPLOYEE:
      return CashVoucherPartnerType.EMPLOYEE;
    case PartnerLookupType.SUPPLIER:
      return CashVoucherPartnerType.SUPPLIER;
    default:
      return CashVoucherPartnerType.OTHER;
  }
}

export type DepositPaymentSaveResult =
  | { kind: "voucher"; body: CreateBankPaymentBody }
  | { kind: "supplierDepositPayment"; body: CreateSupplierDepositPaymentBody };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: TreasuryVoucherDialogModeEnum;
  initial: BankPayment | null;
  onSave?: (result: DepositPaymentSaveResult) => void;
  onRequestEdit?: () => void;
}

function fieldClass(readOnly: boolean): string | undefined {
  return readOnly ? READONLY_INPUT_CLASS : undefined;
}

export function DepositPaymentVoucherDialog({
  open,
  onOpenChange,
  mode,
  initial,
  onSave,
  onRequestEdit,
}: Props) {
  const readOnly = mode === TreasuryVoucherDialogModeEnum.VIEW;
  const { mutateAsync: generateDocNumber } = useGenerateDocumentNumber();
  const { fetchPartnerByType, fetchStaffById } = usePartnerLookup();

  const [depositAccountId, setDepositAccountId] = useState("");
  const [purpose, setPurpose] = useState<BankPaymentPurpose>(BankPaymentPurpose.OTHER);
  const [partnerKind, setPartnerKind] = useState<PartnerLookupType>(PartnerLookupType.SUPPLIER);
  const [partnerId, setPartnerId] = useState("");
  const [counterpartyCode, setCounterpartyCode] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [counterpartyPhone, setCounterpartyPhone] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [address, setAddress] = useState("");
  const [reason, setReason] = useState("");
  const [staffId, setStaffId] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [reference, setReference] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [docDate, setDocDate] = useState(toIsoDate(new Date()));
  const [affectExpense, setAffectExpense] = useState(true);
  const [lines, setLines] = useState<VoucherFormLine[]>([emptyFormLine()]);
  const [documentLines, setDocumentLines] = useState<LedgerCashVoucherDocumentLine[]>([]);
  const [entitySearchTarget, setEntitySearchTarget] =
    useState<VoucherEntitySearchTarget | null>(null);
  const [partnerCreateKind, setPartnerCreateKind] = useState<PartnerLookupType | null>(null);
  const [staffCreateOpen, setStaffCreateOpen] = useState(false);
  const [debtPickOpen, setDebtPickOpen] = useState(false);

  const { data: paymentCategories = [] } = useCashVoucherCategories(
    CashVoucherCategoryDirection.OUT,
  );

  const isSupplierPayment = purpose === BankPaymentPurpose.SUPPLIER_PAYMENT;
  // BR-CHI-05: fund-move purposes never count as an expense.
  const isFundMove =
    purpose === BankPaymentPurpose.CASH_TRANSFER || purpose === BankPaymentPurpose.INTER_BRANCH_OUT;
  const debtFieldsLocked = isSupplierPayment && !readOnly;

  const resetKey = `deposit-payment-${mode}-${initial?.id ?? "new"}`;

  useEffect(() => {
    if (isFundMove && affectExpense) setAffectExpense(false);
  }, [isFundMove, affectExpense]);

  useEffect(() => {
    if (!open) return;
    if (mode === TreasuryVoucherDialogModeEnum.CREATE) {
      setDepositAccountId("");
      setPurpose(BankPaymentPurpose.OTHER);
      setPartnerKind(PartnerLookupType.SUPPLIER);
      setPartnerId("");
      setCounterpartyCode("");
      setCounterpartyName("");
      setCounterpartyPhone("");
      setPayeeName("");
      setAddress("");
      setReason("");
      setStaffId("");
      setEmployeeCode("");
      setEmployeeName("");
      setReference("");
      setDocumentNumber("");
      setDocDate(toIsoDate(new Date()));
      setAffectExpense(true);
      setLines([emptyFormLine()]);
      setDocumentLines([]);
      return;
    }
    if (initial) {
      setDepositAccountId(initial.depositAccountId);
      setPurpose(initial.purpose);
      setPartnerKind(inferLookupType(initial.partnerType));
      setPartnerId(initial.partnerId ?? "");
      setCounterpartyCode("");
      setCounterpartyName(initial.partnerNameSnapshot ?? "");
      setPayeeName(initial.payeeName ?? "");
      setAddress(initial.partnerAddressSnapshot ?? "");
      setReason(initial.reason ?? "");
      setStaffId(initial.paidBy ?? "");
      setEmployeeCode("");
      setEmployeeName("");
      setReference(initial.reference ?? "");
      setDocumentNumber(initial.documentNumber ?? "");
      setDocDate(initial.docDate);
      setAffectExpense(initial.affectExpense);
      setLines(
        initial.lines.length > 0
          ? initial.lines.map((l) => ({
              description: l.description,
              amount: l.amount,
              category: "",
              categoryId: l.categoryId,
            }))
          : [emptyFormLine()],
      );
      setDocumentLines([]);
    }
  }, [resetKey, open, mode, initial]);

  useEffect(() => {
    if (!open || mode !== TreasuryVoucherDialogModeEnum.CREATE) return;
    let cancelled = false;
    void generateDocNumber({ documentType: DocumentType.BANK_PAYMENT })
      .then((no) => {
        if (!cancelled) setDocumentNumber(no);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Không sinh được số phiếu chi. Vui lòng thử lại.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, generateDocNumber]);

  useEffect(() => {
    if (!open) setEntitySearchTarget(null);
  }, [open]);

  useEffect(() => {
    if (!open || mode === TreasuryVoucherDialogModeEnum.CREATE || !initial) return;
    let cancelled = false;
    void (async () => {
      if (initial.partnerId && initial.partnerType) {
        const partner = await fetchPartnerByType(initial.partnerType, initial.partnerId);
        if (!cancelled && partner) {
          setPartnerKind(partner.kind);
          setCounterpartyCode(partner.code);
          setCounterpartyName(partner.name);
          setCounterpartyPhone(partner.phone ?? "");
        }
      }
      if (initial.paidBy) {
        const staff = await fetchStaffById(initial.paidBy);
        if (!cancelled && staff) {
          setEmployeeCode(staff.code);
          setEmployeeName(staff.name);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mode, initial, fetchPartnerByType, fetchStaffById]);

  const applyPartnerFromSearch = useCallback((item: VoucherPartnerOption) => {
    setPartnerKind(item.kind);
    setPartnerId(item.id);
    setCounterpartyCode(item.code);
    setCounterpartyName(item.name);
    setCounterpartyPhone(item.phone ?? "");
    if (item.address) setAddress(item.address);
    setPayeeName((prev) => prev.trim() || item.name);
  }, []);

  const applyStaffFromSearch = useCallback((item: VoucherPartnerOption) => {
    setStaffId(item.id);
    setEmployeeCode(item.code);
    setEmployeeName(item.name);
  }, []);

  const handlePurposeChange = useCallback((next: BankPaymentPurpose) => {
    setPurpose(next);
    if (next === BankPaymentPurpose.SUPPLIER_PAYMENT) {
      setPartnerKind(PartnerLookupType.SUPPLIER);
      setPartnerId("");
      setCounterpartyCode("");
      setCounterpartyName("");
      setCounterpartyPhone("");
      setPayeeName("");
      setAddress("");
      setReason("");
      setLines([emptyFormLine()]);
      setDocumentLines([]);
    }
  }, []);

  const debtPickInitialPartner = useMemo((): VoucherPartnerOption | null => {
    if (!partnerId || !counterpartyCode) return null;
    return {
      lookupKey: `${PartnerLookupType.SUPPLIER}:${partnerId}`,
      id: partnerId,
      code: counterpartyCode,
      name: counterpartyName,
      kind: PartnerLookupType.SUPPLIER,
      kindLabel: "Nhà cung cấp",
    };
  }, [partnerId, counterpartyCode, counterpartyName]);

  // BR-BUY-02 (multi-doc) / amount-not-exceeding-remaining-debt is enforced inside
  // DebtRepaymentPickDialog itself; the picked allocations settle real
  // supplier_debts rows via POST /supplier-deposit-payment (FR-06), not this dialog's
  // plain-voucher path.
  const handleDebtRepaymentConfirm = useCallback((result: DebtRepaymentPickResult) => {
    setPartnerKind(result.partner.kind);
    setPartnerId(result.partner.id);
    setCounterpartyCode(result.partner.code);
    setCounterpartyName(result.partner.name);
    setCounterpartyPhone(result.partner.phone ?? "");
    if (result.partner.address) setAddress(result.partner.address);
    setPayeeName((prev) => prev.trim() || result.partner.name);
    setReason(`Trả nợ cho ${result.partner.name}`);
    setDocumentLines(result.documentLines);
    setLines(
      result.documentLines.map((d) => ({
        description: `Trả nợ ${d.documentNo}`,
        amount: d.collectAmount,
        category: "",
        categoryId: undefined,
      })),
    );
  }, []);

  const lineTotal = useMemo(() => voucherLineTotal(lines), [lines]);

  const lineColumns: LineColumn<VoucherFormLine>[] = useMemo(
    () => [
      {
        key: "description",
        label: "Diễn giải",
        width: 280,
        type: readOnly || isSupplierPayment ? "readonly" : undefined,
        getValue: (r) => r.description,
        renderEditor:
          readOnly || isSupplierPayment
            ? undefined
            : (row, _idx, onChange) => (
                <Input value={row.description} onChange={(e) => onChange(e.target.value)} />
              ),
      },
      {
        key: "amount",
        label: "Số tiền",
        width: 140,
        align: "right",
        type: readOnly || isSupplierPayment ? "readonly" : undefined,
        getValue: (r) => formatMoneyInteger(r.amount),
        renderEditor:
          readOnly || isSupplierPayment
            ? undefined
            : (row, _idx, onChange) => (
                <MoneyInput value={row.amount} onChange={(v) => onChange(v === "" ? 0 : v)} />
              ),
      },
      {
        key: "category",
        label: LABELS.category,
        width: 200,
        type: readOnly || isSupplierPayment ? "readonly" : undefined,
        getValue: (r) =>
          r.categoryId
            ? (paymentCategories.find((c) => c.id === r.categoryId)?.name ?? r.category)
            : r.category,
        renderEditor:
          readOnly || isSupplierPayment
            ? undefined
            : (row, _idx, onChange) => (
                <select
                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={row.categoryId ?? ""}
                  onChange={(e) => onChange(e.target.value)}
                >
                  <option value="">-- Chọn --</option>
                  {paymentCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ),
      },
    ],
    [readOnly, isSupplierPayment, paymentCategories],
  );

  const lineColumnsWithFooter: LineColumn<VoucherFormLine>[] = useMemo(
    () =>
      lineColumns.map((c) =>
        c.key === "amount"
          ? { ...c, footer: <span className="font-semibold">{formatMoneyInteger(lineTotal)}</span> }
          : c.key === "description"
            ? { ...c, footer: <span className="font-semibold">Tổng</span> }
            : c,
      ),
    [lineColumns, lineTotal],
  );

  const lineColumnsView: TableColumn<VoucherFormLine>[] = useMemo(
    () =>
      lineColumnsWithFooter.map((c) => ({
        key: c.key,
        label: c.label,
        width: c.width,
        className: c.key === "amount" ? "text-right tabular-nums" : undefined,
        footer: c.footer,
        render: (row: VoucherFormLine) => c.getValue?.(row) ?? "",
      })),
    [lineColumnsWithFooter],
  );

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  const handleSave = useCallback(() => {
    if (!onSave) return;
    if (!depositAccountId) {
      toast.error("Vui lòng chọn tài khoản chi.");
      return;
    }
    if (!docDate) {
      toast.error("Ngày chi là bắt buộc.");
      return;
    }

    if (isSupplierPayment) {
      if (!partnerId) {
        toast.error("Vui lòng chọn nhà cung cấp.");
        return;
      }
      const allocations = documentLines
        .filter((d) => d.debtId && Number(d.collectAmount) > 0)
        .map((d) => ({ supplierDebtId: d.debtId as string, amount: Number(d.collectAmount) || 0 }));
      if (allocations.length === 0) {
        toast.error("Chọn ít nhất một hóa đơn trả nợ.");
        return;
      }
      const totalAmount = allocations.reduce((s, a) => s + a.amount, 0);
      onSave({
        kind: "supplierDepositPayment",
        body: {
          docDate,
          partnerType: lookupTypeToPartnerType(partnerKind),
          partnerId,
          payeeName: payeeName || undefined,
          reason: reason || undefined,
          legs: [{ fund: SupplierDepositPaymentFund.DEPOSIT, depositAccountId, amount: totalAmount }],
          allocations,
        },
      });
      toast.success("Đã trả nợ nhà cung cấp.");
      handleClose();
      return;
    }

    const validLines = lines.filter((l) => l.description.trim() || Number(l.amount) > 0);
    if (validLines.length === 0) {
      toast.error("Vui lòng nhập ít nhất một dòng chi tiết.");
      return;
    }
    const totalAmount = voucherLineTotal(validLines);
    if (totalAmount <= 0) {
      toast.error("Tổng số tiền phải lớn hơn 0.");
      return;
    }
    onSave({
      kind: "voucher",
      body: {
        documentNumber: documentNumber.trim() || undefined,
        depositAccountId,
        docDate,
        purpose,
        partnerType: partnerId ? lookupTypeToPartnerType(partnerKind) : undefined,
        partnerId: partnerId || undefined,
        payeeName: payeeName || undefined,
        reason: reason || undefined,
        paidBy: staffId || undefined,
        reference: reference || undefined,
        affectExpense: isFundMove ? false : affectExpense,
        totalAmount,
        lines: validLines.map((l) => ({
          description: l.description,
          amount: Number(l.amount) || 0,
          categoryId: l.categoryId || undefined,
        })),
      },
    });
    toast.success(
      mode === TreasuryVoucherDialogModeEnum.CREATE ? "Đã thêm phiếu chi." : "Đã cập nhật phiếu chi.",
    );
    handleClose();
  }, [
    onSave,
    depositAccountId,
    docDate,
    isSupplierPayment,
    partnerId,
    partnerKind,
    documentLines,
    payeeName,
    reason,
    lines,
    documentNumber,
    purpose,
    staffId,
    reference,
    isFundMove,
    affectExpense,
    mode,
    handleClose,
  ]);

  const toolbarItems: ToolbarItem[] = useMemo(() => {
    const items: ToolbarItem[] = [];
    if (readOnly && onRequestEdit) {
      items.push({ id: "edit", label: "Sửa", icon: Pencil, onClick: onRequestEdit });
    }
    if (!readOnly && onSave) {
      items.push({ id: "save", label: "Lưu", icon: Save, onClick: handleSave });
    }
    items.push({ id: "close", label: "Đóng", icon: X, onClick: handleClose });
    return items;
  }, [readOnly, onRequestEdit, handleSave, handleClose, onSave]);

  const title =
    mode === TreasuryVoucherDialogModeEnum.CREATE
      ? LABELS.titleCreate
      : `${LABELS.titleView} ${documentNumber}`;

  if (!open) return null;

  return (
    <>
      <DocumentFormDialog
        open
        onOpenChange={(nextOpen) => {
          if (!nextOpen) handleClose();
        }}
        title={title}
        toolbarItems={toolbarItems}
        purpose={
          <div className="flex flex-wrap items-center gap-3">
            <FormField label={LABELS.purpose} layout="horizontal" labelWidth="8rem" className="mb-0">
              <RadioGroup
                name="deposit-payment-purpose"
                value={purpose}
                options={PAYMENT_PURPOSE_OPTIONS}
                onChange={handlePurposeChange}
                readOnly={readOnly}
              />
            </FormField>
            {isSupplierPayment && !readOnly ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setDebtPickOpen(true)}>
                Chọn hóa đơn trả nợ
              </Button>
            ) : null}
          </div>
        }
        generalInfo={
          <>
            <VoucherPartnerFields
              label={LABELS.counterparty}
              readOnly={readOnly || isSupplierPayment}
              partnerKind={partnerKind}
              partnerId={partnerId}
              partnerCode={counterpartyCode}
              partnerName={counterpartyName}
              partnerPhone={counterpartyPhone}
              onPartnerSelect={(p) => {
                setPartnerKind(p.partnerKind);
                setPartnerId(p.partnerId);
                setCounterpartyCode(p.partnerCode);
                setCounterpartyName(p.partnerName);
                setCounterpartyPhone(p.partnerPhone ?? "");
                if (p.address) setAddress(p.address);
                setPayeeName((prev) => prev.trim() || p.partnerName);
              }}
              onPartnerLookupChange={(code) => {
                setCounterpartyCode(code);
                setPartnerId("");
                setCounterpartyName("");
                setCounterpartyPhone("");
              }}
              onPartnerClear={() => {
                setPartnerId("");
                setCounterpartyCode("");
                setCounterpartyName("");
                setCounterpartyPhone("");
              }}
              onOpenSearchDialog={() => setEntitySearchTarget("partner")}
              onCreateNew={!readOnly && !isSupplierPayment ? (kind) => setPartnerCreateKind(kind) : undefined}
            />
            <FormField label={LABELS.person} layout="horizontal" labelWidth="8rem">
              <Input
                value={payeeName}
                onChange={(e) => setPayeeName(e.target.value)}
                readOnly={readOnly || debtFieldsLocked}
                disabled={readOnly || debtFieldsLocked}
                className={fieldClass(readOnly || debtFieldsLocked)}
              />
            </FormField>
            <FormField label="Địa chỉ" layout="horizontal" labelWidth="8rem">
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                readOnly={readOnly || debtFieldsLocked}
                disabled={readOnly || debtFieldsLocked}
                className={fieldClass(readOnly || debtFieldsLocked)}
              />
            </FormField>
            <FormField label={LABELS.reason} layout="horizontal" labelWidth="8rem">
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                readOnly={readOnly || debtFieldsLocked}
                disabled={readOnly || debtFieldsLocked}
                className={fieldClass(readOnly || debtFieldsLocked)}
              />
            </FormField>
            <VoucherStaffFields
              label={LABELS.employee}
              readOnly={readOnly}
              staffId={staffId}
              staffCode={employeeCode}
              staffName={employeeName}
              onStaffSelect={(s) => {
                setStaffId(s.staffId);
                setEmployeeCode(s.staffCode);
                setEmployeeName(s.staffName);
              }}
              onStaffLookupChange={(code) => {
                setEmployeeCode(code);
                setStaffId("");
                setEmployeeName("");
              }}
              onStaffClear={() => {
                setStaffId("");
                setEmployeeCode("");
                setEmployeeName("");
              }}
              onOpenSearchDialog={() => setEntitySearchTarget("staff")}
              onCreateNew={!readOnly ? () => setStaffCreateOpen(true) : undefined}
            />
            {reference ? (
              <FormField label="Tham chiếu" layout="horizontal" labelWidth="8rem">
                <span className="flex h-9 items-center text-sm">{reference}</span>
              </FormField>
            ) : null}
            <FormField label="Tài liệu đính kèm" layout="horizontal" labelWidth="8rem">
              <Button variant="outline" size="sm" disabled>
                Tải tệp…
              </Button>
            </FormField>
          </>
        }
        documentInfo={
          <>
            <VoucherDocumentNumberField
              label={LABELS.voucherNo}
              value={documentNumber}
              mode={mode}
              readOnly={readOnly}
            />
            <FormField label={LABELS.account} required layout="horizontal" labelWidth="7.5rem">
              <DepositAccountSelect
                value={depositAccountId}
                onChange={setDepositAccountId}
                disabled={readOnly}
              />
            </FormField>
            <FormField label={LABELS.voucherDate} required layout="horizontal" labelWidth="7.5rem">
              <DateTimeField
                value={docDate}
                onChange={(e) => setDocDate(e.target.value)}
                includeTime={false}
                disabled={readOnly}
                className={cn(fieldClass(readOnly))}
              />
            </FormField>
            <FormField label="Tính vào chi phí" layout="horizontal" labelWidth="7.5rem">
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  checked={isFundMove ? false : affectExpense}
                  disabled={readOnly || isFundMove}
                  onChange={(e) => setAffectExpense(e.target.checked)}
                  title={isFundMove ? "Chuyển quỹ không tính vào chi phí (BR-CHI-05)" : undefined}
                />
              </div>
            </FormField>
          </>
        }
        detail={
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
            {readOnly ? (
              <BaseDataTable
                columns={lineColumnsView}
                rows={lines}
                loading={false}
                emptyLabel="Không có dòng chi tiết."
                getRowKey={(_, index) => String(index)}
                className="min-h-0 flex-1"
              />
            ) : (
              <LineItemGrid
                columns={lineColumns}
                rows={lines}
                onChangeCell={
                  isSupplierPayment
                    ? undefined
                    : (idx, key, value) => {
                        setLines((prev) =>
                          prev.map((l, i) => {
                            if (i !== idx) return l;
                            if (key === "category") {
                              const cat = paymentCategories.find((c) => c.id === value);
                              return {
                                ...l,
                                categoryId: (value as string) || undefined,
                                category: cat?.name ?? "",
                              };
                            }
                            return { ...l, [key]: value };
                          }),
                        );
                      }
                }
                onAddRow={
                  isSupplierPayment ? undefined : () => setLines((prev) => [...prev, emptyFormLine()])
                }
                onDeleteRow={
                  isSupplierPayment
                    ? undefined
                    : (idx) => setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))
                }
                showAddRow={!isSupplierPayment}
                showRowActions={!isSupplierPayment}
              />
            )}
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
      {entitySearchTarget ? (
        <VoucherEntitySearchModal
          open
          target={entitySearchTarget}
          onOpenChange={(next) => {
            if (!next) setEntitySearchTarget(null);
          }}
          onSelectPartner={applyPartnerFromSearch}
          onSelectStaff={applyStaffFromSearch}
        />
      ) : null}
      {debtPickOpen ? (
        <DebtRepaymentPickDialog
          open
          onOpenChange={setDebtPickOpen}
          defaultRepaymentDate={docDate}
          initialPartner={debtPickInitialPartner}
          onConfirm={handleDebtRepaymentConfirm}
        />
      ) : null}
      {partnerCreateKind === PartnerLookupType.SUPPLIER ? (
        <QuickCreateProviderDialog
          open
          onClose={() => setPartnerCreateKind(null)}
          onCreated={(p) => {
            setPartnerKind(PartnerLookupType.SUPPLIER);
            setPartnerId(p.id);
            setCounterpartyCode(p.code);
            setCounterpartyName(p.name);
            setCounterpartyPhone(p.phone ?? "");
            setPayeeName((prev) => prev.trim() || p.name);
            setPartnerCreateKind(null);
          }}
        />
      ) : null}
      {partnerCreateKind === PartnerLookupType.CUSTOMER ? (
        <QuickCreateCustomerDialog
          open
          onClose={() => setPartnerCreateKind(null)}
          onCreated={(c) => {
            setPartnerKind(PartnerLookupType.CUSTOMER);
            setPartnerId(c.id);
            setCounterpartyCode(c.code);
            setCounterpartyName(c.name);
            setCounterpartyPhone(c.phone ?? "");
            setPayeeName((prev) => prev.trim() || c.name);
            setPartnerCreateKind(null);
          }}
        />
      ) : null}
      {partnerCreateKind === PartnerLookupType.EMPLOYEE ? (
        <QuickCreateEmployeeDialog
          open
          onClose={() => setPartnerCreateKind(null)}
          onCreated={(e) => {
            setPartnerKind(PartnerLookupType.EMPLOYEE);
            setPartnerId(e.id);
            setCounterpartyCode(e.code);
            setCounterpartyName(e.name);
            setPayeeName((prev) => prev.trim() || e.name);
            setPartnerCreateKind(null);
          }}
        />
      ) : null}
      {staffCreateOpen ? (
        <QuickCreateEmployeeDialog
          open
          onClose={() => setStaffCreateOpen(false)}
          onCreated={(e) => {
            setStaffId(e.id);
            setEmployeeCode(e.code);
            setEmployeeName(e.name);
          }}
        />
      ) : null}
    </>
  );
}
