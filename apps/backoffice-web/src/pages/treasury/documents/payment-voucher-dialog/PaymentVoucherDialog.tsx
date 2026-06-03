import { DocumentType } from "@erp/shared-interfaces";
import {
  Button,
  DateTimeField,
  DocumentFormDialog,
  FormField,
  Input,
  LineItemGrid,
  MoneyInput,
  cn,
  formatMoneyInteger,
  type LineColumn,
  type ToolbarItem,
} from "@erp/ui";
import { Pencil, Save, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RadioGroup } from "../../../../components/forms/RadioGroup";
import { useGenerateDocumentNumber } from "../../../../hooks/document-numbering/useGenerateDocumentNumber";
import { useCashVoucherCategories } from "../../../../hooks/treasury/use-cash-voucher-categories";
import {
  CashPaymentPurpose,
  CashVoucherCategoryDirection,
} from "../../cash-vouchers.types";
import { READONLY_INPUT_CLASS } from "../../ledger-cash/ledger-cash.constants";
import {
  LedgerCashVoucherPurposeEnum,
  isGoodsReceiptPaymentVoucher,
  type LedgerCashVoucherDetail,
  type LedgerCashVoucherDocumentLine,
} from "../../ledger-cash/ledger-cash.types";
import {
  QuickCreateCustomerDialog,
  QuickCreateEmployeeDialog,
  QuickCreateProviderDialog,
} from "../../../../components/forms/QuickCreateDialogs";
import { VoucherDocumentNumberField } from "../_shared/VoucherDocumentNumberField";
import { VoucherEntitySearchModal } from "../_shared/VoucherEntitySearchModal";
import { VoucherLink } from "../_shared/VoucherLink";
import { VoucherPartnerFields } from "../_shared/VoucherPartnerFields";
import { VoucherStaffFields } from "../_shared/VoucherStaffFields";
import {
  PAYMENT_OTHER_SUB_OPTIONS,
  PAYMENT_PURPOSE_LABEL,
  PAYMENT_VOUCHER_PURPOSE_RADIO_OPTIONS,
  emptyFormLine,
  isTransferSubOption,
  subOptionToApiPurpose,
  PaymentOtherSubOption,
  PaymentPurposeRadio,
  type VoucherFormLine,
} from "../_shared/voucher-dialog.constants";
import { usePaymentAccounts } from "../../../../hooks/treasury/use-payment-accounts";
import { TreasuryVoucherDialogModeEnum } from "../_shared/voucher-dialog.types";
import {
  buildPaymentDetailFromForm,
  toIsoDate,
  voucherLineTotal,
} from "../_shared/voucher-dialog.utils";
import type { VoucherEntitySearchTarget } from "../_shared/voucher-entity-search.store";
import type { VoucherPartnerOption } from "../_shared/voucher-partner-search";
import { usePartnerLookup } from "../_shared/voucher-partner-search";
import {
  PartnerLookupType,
  inferLookupType,
} from "../_shared/voucher-partner.constants";
import { GoodsReceiptPaymentDialog } from "../goods-receipt-payment-dialog/GoodsReceiptPaymentDialog";
import {
  DebtRepaymentPickDialog,
  type DebtRepaymentPickResult,
} from "./DebtRepaymentPickDialog";

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
  onSave,
  onRequestEdit,
}: Props) {
  const readOnly = mode === TreasuryVoucherDialogModeEnum.VIEW;
  const { mutateAsync: generateDocNumber } = useGenerateDocumentNumber();
  const { fetchPartnerByType, fetchStaffById } = usePartnerLookup();
  const { data: paymentCategories = [] } = useCashVoucherCategories(
    CashVoucherCategoryDirection.OUT,
  );
  const isGoodsView =
    !!initial && isGoodsReceiptPaymentVoucher(initial) && readOnly;

  const [paymentPurpose, setPaymentPurpose] = useState<CashPaymentPurpose>(
    CashPaymentPurpose.OTHER,
  );
  const [partnerKind, setPartnerKind] = useState<PartnerLookupType>(
    PartnerLookupType.SUPPLIER,
  );
  const [partnerId, setPartnerId] = useState("");
  const [counterpartyCode, setCounterpartyCode] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [counterpartyPhone, setCounterpartyPhone] = useState("");
  const [personName, setPersonName] = useState("");
  const [address, setAddress] = useState("");
  const [reason, setReason] = useState("");
  const [staffId, setStaffId] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [reference, setReference] = useState("");
  const [voucherNo, setVoucherNo] = useState("");
  const [voucherDate, setVoucherDate] = useState(toIsoDate(new Date()));
  const [countAsExpense, setCountAsExpense] = useState(true);
  const [lines, setLines] = useState<VoucherFormLine[]>([emptyFormLine()]);
  const [documentLines, setDocumentLines] = useState<
    LedgerCashVoucherDocumentLine[]
  >([]);
  const [entitySearchTarget, setEntitySearchTarget] =
    useState<VoucherEntitySearchTarget | null>(null);
  const [partnerCreateKind, setPartnerCreateKind] = useState<PartnerLookupType | null>(null);
  const [staffCreateOpen, setStaffCreateOpen] = useState(false);
  const [debtPickOpen, setDebtPickOpen] = useState(false);
  const [paymentSubOption, setPaymentSubOption] = useState(
    PaymentOtherSubOption.OTHER,
  );
  const [transferAccountId, setTransferAccountId] = useState("");

  const { data: paymentAccounts = [] } = usePaymentAccounts();

  const isDebtRepayment =
    paymentPurpose === CashPaymentPurpose.SUPPLIER_PAYMENT;
  const purposeRadio: PaymentPurposeRadio = isDebtRepayment
    ? PaymentPurposeRadio.DEBT_GROUP
    : PaymentPurposeRadio.OTHER_GROUP;
  const showTransferAccount =
    !isDebtRepayment && isTransferSubOption(paymentSubOption);
  const debtFieldsLocked = isDebtRepayment && !readOnly;

  const resetKey = `payment-${mode}-${initial?.voucherNo ?? "new"}-${initial?.partnerId ?? ""}`;

  useEffect(() => {
    if (!open || isGoodsView) return;
    if (mode === TreasuryVoucherDialogModeEnum.CREATE) {
      setPaymentPurpose(CashPaymentPurpose.OTHER);
      setPaymentSubOption(PaymentOtherSubOption.OTHER);
      setTransferAccountId("");
      setPartnerKind(PartnerLookupType.SUPPLIER);
      setPartnerId("");
      setCounterpartyCode("");
      setCounterpartyName("");
      setCounterpartyPhone("");
      setPersonName("");
      setAddress("");
      setReason("");
      setStaffId("");
      setEmployeeCode("");
      setEmployeeName("");
      setReference("");
      setVoucherNo("");
      setVoucherDate(toIsoDate(new Date()));
      setCountAsExpense(true);
      setLines([emptyFormLine()]);
      setDocumentLines([]);
      return;
    }
    if (initial && !isGoodsReceiptPaymentVoucher(initial)) {
      setPaymentPurpose(initial.paymentPurpose ?? CashPaymentPurpose.OTHER);
      setPaymentSubOption(PaymentOtherSubOption.OTHER);
      setTransferAccountId("");
      setPartnerKind(
        initial.partnerKind ?? inferLookupType(initial.partnerType),
      );
      setPartnerId(initial.partnerId ?? "");
      setCounterpartyCode(initial.counterpartyCode);
      setCounterpartyName(initial.counterpartyName);
      setPersonName(initial.payerName ?? "");
      setAddress(initial.address ?? "");
      setReason(initial.reason);
      setStaffId(initial.staffId ?? "");
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
              categoryId: l.categoryId,
            }))
          : [emptyFormLine()],
      );
    }
  }, [resetKey, open, mode, initial, isGoodsView]);

  useEffect(() => {
    if (!open || mode !== TreasuryVoucherDialogModeEnum.CREATE) return;
    let cancelled = false;
    void generateDocNumber({ documentType: DocumentType.CASH_PAYMENT })
      .then((no) => {
        if (!cancelled) setVoucherNo(no);
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

  const applyPartnerFromSearch = useCallback((item: VoucherPartnerOption) => {
    setPartnerKind(item.kind);
    setPartnerId(item.id);
    setCounterpartyCode(item.code);
    setCounterpartyName(item.name);
    setCounterpartyPhone(item.phone ?? "");
    if (item.address) setAddress(item.address);
    setPersonName((prev) => prev.trim() || item.name);
  }, []);

  const applyStaffFromSearch = useCallback((item: VoucherPartnerOption) => {
    setStaffId(item.id);
    setEmployeeCode(item.code);
    setEmployeeName(item.name);
  }, []);

  const handleRadioChange = useCallback((next: PaymentPurposeRadio) => {
    if (next === PaymentPurposeRadio.DEBT_GROUP) {
      setPaymentPurpose(CashPaymentPurpose.SUPPLIER_PAYMENT);
      setPaymentSubOption(PaymentOtherSubOption.OTHER);
      setTransferAccountId("");
      setPartnerKind(PartnerLookupType.SUPPLIER);
      setPartnerId("");
      setCounterpartyCode("");
      setCounterpartyName("");
      setCounterpartyPhone("");
      setPersonName("");
      setAddress("");
      setReason("");
      setStaffId("");
      setEmployeeCode("");
      setEmployeeName("");
      setLines([emptyFormLine()]);
      setDocumentLines([]);
    } else {
      setPaymentPurpose(CashPaymentPurpose.OTHER);
      setPaymentSubOption(PaymentOtherSubOption.OTHER);
      setTransferAccountId("");
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

  const handleDebtRepaymentConfirm = useCallback(
    (result: DebtRepaymentPickResult) => {
      setPartnerKind(result.partner.kind);
      setPartnerId(result.partner.id);
      setCounterpartyCode(result.partner.code);
      setCounterpartyName(result.partner.name);
      setCounterpartyPhone(result.partner.phone ?? "");
      if (result.partner.address) setAddress(result.partner.address);
      setPersonName((prev) => prev.trim() || result.partner.name);
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
    },
    [],
  );

  useEffect(() => {
    if (
      !open ||
      isGoodsView ||
      mode === TreasuryVoucherDialogModeEnum.CREATE ||
      !initial
    ) {
      return;
    }
    let cancelled = false;
    void (async () => {
      if (initial.partnerId && initial.partnerType) {
        const partner = await fetchPartnerByType(
          initial.partnerType,
          initial.partnerId,
        );
        if (!cancelled && partner) {
          setPartnerKind(partner.kind);
          setCounterpartyCode(partner.code);
          setCounterpartyName(partner.name);
          setCounterpartyPhone(partner.phone ?? "");
          if (partner.address) setAddress(partner.address);
        }
      }
      if (initial.staffId) {
        const staff = await fetchStaffById(initial.staffId);
        if (!cancelled && staff) {
          setEmployeeCode(staff.code);
          setEmployeeName(staff.name);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    isGoodsView,
    mode,
    initial?.partnerId,
    initial?.partnerType,
    initial?.staffId,
    fetchPartnerByType,
    fetchStaffById,
  ]);

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
        width: 200,
        type: readOnly ? "readonly" : undefined,
        getValue: (r) =>
          r.categoryId
            ? (paymentCategories.find((c) => c.id === r.categoryId)?.name ??
              r.category)
            : r.category,
        renderEditor: readOnly
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
    [readOnly, paymentCategories],
  );

  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const handleSave = useCallback(() => {
    if (!onSave) return;
    if (!voucherNo.trim()) {
      toast.error("Số phiếu chi là bắt buộc.");
      return;
    }
    if (!voucherDate) {
      toast.error("Ngày chi là bắt buộc.");
      return;
    }
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
    onSave(
      buildPaymentDetailFromForm({
        purpose: isDebtRepayment
          ? LedgerCashVoucherPurposeEnum.DEBT_REPAYMENT
          : LedgerCashVoucherPurposeEnum.OTHER,
        paymentPurpose,
        partnerKind,
        partnerId,
        counterpartyCode,
        counterpartyName,
        payerName: personName,
        address,
        reason,
        staffId,
        employeeCode,
        employeeName,
        reference,
        voucherNo: voucherNo.trim(),
        voucherDate,
        lines: validLines,
        documentLines,
        transferAccountId: showTransferAccount ? transferAccountId : undefined,
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
    paymentPurpose,
    isDebtRepayment,
    documentLines,
    showTransferAccount,
    transferAccountId,
    partnerKind,
    partnerId,
    counterpartyCode,
    counterpartyName,
    personName,
    address,
    reason,
    staffId,
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
            <FormField
              label={LABELS.purpose}
              layout="horizontal"
              labelWidth="8rem"
              className="mb-0"
            >
              <div className="flex items-center gap-3">
                <RadioGroup
                  name="payment-purpose"
                  value={purposeRadio}
                  options={[...PAYMENT_VOUCHER_PURPOSE_RADIO_OPTIONS]}
                  onChange={handleRadioChange}
                  readOnly={readOnly}
                />
                {!isDebtRepayment ? (
                  readOnly ? (
                    <span className="pt-2 text-sm">
                      {PAYMENT_OTHER_SUB_OPTIONS.find(
                        (o) => o.value === paymentSubOption,
                      )?.label ?? PAYMENT_OTHER_SUB_OPTIONS[0].label}
                    </span>
                  ) : (
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={paymentSubOption}
                      onChange={(e) => {
                        const sub = e.target.value as PaymentOtherSubOption;
                        setPaymentSubOption(sub);
                        setPaymentPurpose(subOptionToApiPurpose(sub));
                        if (!isTransferSubOption(sub)) {
                          setTransferAccountId("");
                        }
                      }}
                    >
                      {PAYMENT_OTHER_SUB_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )
                ) : null}
              </div>
            </FormField>
            {isDebtRepayment && !readOnly ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDebtPickOpen(true)}
              >
                Chọn hóa đơn trả nợ
              </Button>
            ) : null}
          </div>
        }
        generalInfo={
          <>
            <VoucherPartnerFields
              label={LABELS.counterparty}
              readOnly={readOnly || isDebtRepayment}
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
                setPersonName((prev) => prev.trim() || p.partnerName);
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
              onCreateNew={!readOnly && !isDebtRepayment ? (kind) => setPartnerCreateKind(kind) : undefined}
            />
            <FormField
              label={LABELS.person}
              layout="horizontal"
              labelWidth="8rem"
            >
              <Input
                value={personName}
                onChange={(e) => setPersonName(e.target.value)}
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
            <FormField
              label={LABELS.reason}
              layout="horizontal"
              labelWidth="8rem"
            >
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
            {showTransferAccount ? (
              <FormField
                label="Tài khoản thu"
                layout="horizontal"
                labelWidth="8rem"
              >
                {readOnly ? (
                  <span className="flex h-9 items-center text-sm">
                    {paymentAccounts.find((a) => a.id === transferAccountId)
                      ?.label ?? transferAccountId}
                  </span>
                ) : (
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    value={transferAccountId}
                    onChange={(e) => setTransferAccountId(e.target.value)}
                  >
                    <option value="">-- Chọn tài khoản --</option>
                    {paymentAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {[a.label, a.accountNumber, a.bankName]
                          .filter(Boolean)
                          .join(" — ") || a.id}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            ) : null}
            {reference ? (
              <FormField
                label="Tham chiếu"
                layout="horizontal"
                labelWidth="8rem"
              >
                <span className="flex h-9 items-center text-sm">
                  {reference}
                </span>
              </FormField>
            ) : null}
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
            <VoucherDocumentNumberField
              label={LABELS.voucherNo}
              value={voucherNo}
              mode={mode}
              readOnly={readOnly}
            />
            <FormField
              label={LABELS.voucherDate}
              required
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
            <FormField
              label="Tính vào chi phí"
              layout="horizontal"
              labelWidth="7.5rem"
            >
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  checked={countAsExpense}
                  onChange={(e) => setCountAsExpense(e.target.checked)}
                  disabled={readOnly}
                />
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
                        prev.map((l, i) => {
                          if (i !== idx) return l;
                          if (key === "category") {
                            const cat = paymentCategories.find(
                              (c) => c.id === value,
                            );
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
          defaultRepaymentDate={voucherDate}
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
            setPersonName((prev) => prev.trim() || p.name);
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
            setPersonName((prev) => prev.trim() || c.name);
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
            setPersonName((prev) => prev.trim() || e.name);
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
