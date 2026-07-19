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
import { getStoredUserId } from "../../../../lib/auth-storage";
import { RadioGroup } from "../../../../components/forms/RadioGroup";
import { BaseDataTable, type TableColumn } from "../../../../components/table/BaseDataTable";
import {
  BankReceiptPurpose,
  type BankReceipt,
  type CreateBankReceiptBody,
} from "../../bank-vouchers.types";
import { CashVoucherCategoryDirection } from "../../cash-vouchers.types";
import { useCashVoucherCategories } from "../../../../hooks/treasury/use-cash-voucher-categories";
import {
  DebtCollectionPickDialog,
  type DebtCollectionPickResult,
} from "../receipt-voucher-dialog/DebtCollectionPickDialog";
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
  PARTNER_LOOKUP_LABEL,
  PartnerLookupType,
  inferLookupType,
} from "../_shared/voucher-partner.constants";
import { usePartnerLookup } from "../_shared/voucher-partner-search";
import { CashVoucherPartnerType } from "../../cash-vouchers.types";

const LABELS = {
  purpose: "Mục đích thu",
  account: "Tài khoản nhận",
  counterparty: "Đối tượng nộp",
  person: "Người nộp",
  reason: "Lý do thu",
  employee: "Nhân viên thu",
  voucherNo: "Số phiếu thu",
  voucherDate: "Ngày thu",
  category: "Mục thu",
  titleCreate: "Thêm mới phiếu thu tiền gửi",
  titleView: "Phiếu thu tiền gửi",
} as const;

// OTHER_INCOME / INTER_BRANCH_IN dropped from this selectable list (product
// decision) — "Mục đích thu" is just Khác/Thu nợ now.
const RECEIPT_PURPOSE_OPTIONS = [
  { value: BankReceiptPurpose.OTHER, label: "Khác" },
  { value: BankReceiptPurpose.DEBT_COLLECTION, label: "Thu nợ" },
];

// Defensive display-only labels for the dropped purposes — so a receipt saved
// before this change (or created directly via API) still shows a real label
// instead of no radio checked when merely viewed/edited, without making these
// purposes choosable again for new saves.
const LEGACY_RECEIPT_PURPOSE_LABELS: Partial<Record<BankReceiptPurpose, string>> = {
  [BankReceiptPurpose.OTHER_INCOME]: "Thu nhập khác",
  [BankReceiptPurpose.INTER_BRANCH_IN]: "Nhận tiền từ chi nhánh khác (GĐ4)",
};

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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: TreasuryVoucherDialogModeEnum;
  initial: BankReceipt | null;
  onSave?: (body: CreateBankReceiptBody) => void;
  onRequestEdit?: () => void;
}

function fieldClass(readOnly: boolean): string | undefined {
  return readOnly ? READONLY_INPUT_CLASS : undefined;
}

export function DepositReceiptVoucherDialog({
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
  const [purpose, setPurpose] = useState<BankReceiptPurpose>(BankReceiptPurpose.OTHER);
  const [partnerKind, setPartnerKind] = useState<PartnerLookupType>(PartnerLookupType.SUPPLIER);
  const [partnerId, setPartnerId] = useState("");
  const [counterpartyCode, setCounterpartyCode] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [counterpartyPhone, setCounterpartyPhone] = useState("");
  const [payerName, setPayerName] = useState("");
  const [address, setAddress] = useState("");
  const [reason, setReason] = useState("");
  const [staffId, setStaffId] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [reference, setReference] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [docDate, setDocDate] = useState(toIsoDate(new Date()));
  const [affectRevenue, setAffectRevenue] = useState(false);
  const [lines, setLines] = useState<VoucherFormLine[]>([emptyFormLine()]);
  const [entitySearchTarget, setEntitySearchTarget] =
    useState<VoucherEntitySearchTarget | null>(null);
  const [partnerCreateKind, setPartnerCreateKind] = useState<PartnerLookupType | null>(null);
  const [staffCreateOpen, setStaffCreateOpen] = useState(false);
  const [debtPickOpen, setDebtPickOpen] = useState(false);

  const { data: receiptCategories = [] } = useCashVoucherCategories(
    CashVoucherCategoryDirection.IN,
  );

  const isDebtCollection = purpose === BankReceiptPurpose.DEBT_COLLECTION;
  const debtFieldsLocked = isDebtCollection && !readOnly;

  // Append the current purpose as a display-only option when it's one of the
  // dropped legacy values (see LEGACY_RECEIPT_PURPOSE_LABELS) — keeps an
  // existing saved receipt from showing no radio checked on view/edit.
  const purposeOptions = useMemo(() => {
    if (RECEIPT_PURPOSE_OPTIONS.some((o) => o.value === purpose)) return RECEIPT_PURPOSE_OPTIONS;
    return [
      ...RECEIPT_PURPOSE_OPTIONS,
      { value: purpose, label: LEGACY_RECEIPT_PURPOSE_LABELS[purpose] ?? purpose },
    ];
  }, [purpose]);

  const resetKey = `deposit-receipt-${mode}-${initial?.id ?? "new"}`;

  useEffect(() => {
    if (!open) return;
    if (mode === TreasuryVoucherDialogModeEnum.CREATE) {
      setDepositAccountId("");
      setPurpose(BankReceiptPurpose.OTHER);
      setPartnerKind(PartnerLookupType.SUPPLIER);
      setPartnerId("");
      setCounterpartyCode("");
      setCounterpartyName("");
      setCounterpartyPhone("");
      setPayerName("");
      setAddress("");
      setReason("");
      setStaffId("");
      setEmployeeCode("");
      setEmployeeName("");
      setReference("");
      setDocumentNumber("");
      setDocDate(toIsoDate(new Date()));
      setAffectRevenue(false);
      setLines([emptyFormLine()]);
      return;
    }
    if (initial) {
      setDepositAccountId(initial.depositAccountId);
      setPurpose(initial.purpose);
      setPartnerKind(inferLookupType(initial.partnerType));
      setPartnerId(initial.partnerId ?? "");
      setCounterpartyCode("");
      setCounterpartyName(initial.partnerNameSnapshot ?? "");
      setPayerName(initial.payerName ?? "");
      setAddress(initial.partnerAddressSnapshot ?? "");
      setReason(initial.reason ?? "");
      setStaffId(initial.collectedBy ?? "");
      setEmployeeCode("");
      setEmployeeName("");
      setReference(initial.reference ?? "");
      setDocumentNumber(initial.documentNumber ?? "");
      setDocDate(initial.docDate);
      setAffectRevenue(initial.affectRevenue);
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
    }
  }, [resetKey, open, mode, initial]);

  useEffect(() => {
    if (!open || mode !== TreasuryVoucherDialogModeEnum.CREATE) return;
    let cancelled = false;
    void generateDocNumber({ documentType: DocumentType.BANK_RECEIPT })
      .then((no) => {
        if (!cancelled) setDocumentNumber(no);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Không sinh được số phiếu thu. Vui lòng thử lại.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, generateDocNumber]);

  // Default "Nhân viên thu" to whoever is logged in — still a normal editable
  // field, the cashier can pick someone else via the lookup/search as before.
  useEffect(() => {
    if (!open || mode !== TreasuryVoucherDialogModeEnum.CREATE) return;
    const userId = getStoredUserId();
    if (!userId) return;
    let cancelled = false;
    void fetchStaffById(userId).then((staff) => {
      if (cancelled || !staff) return;
      setStaffId(staff.id);
      setEmployeeCode(staff.code);
      setEmployeeName(staff.name);
    });
    return () => {
      cancelled = true;
    };
  }, [open, mode, fetchStaffById]);

  useEffect(() => {
    if (!open) setEntitySearchTarget(null);
  }, [open]);

  useEffect(() => {
    if (
      !open ||
      mode === TreasuryVoucherDialogModeEnum.CREATE ||
      !initial
    ) {
      return;
    }
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
      if (initial.collectedBy) {
        const staff = await fetchStaffById(initial.collectedBy);
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
    setPayerName((prev) => prev.trim() || item.name);
  }, []);

  const applyStaffFromSearch = useCallback((item: VoucherPartnerOption) => {
    setStaffId(item.id);
    setEmployeeCode(item.code);
    setEmployeeName(item.name);
  }, []);

  const handlePurposeChange = useCallback((next: BankReceiptPurpose) => {
    setPurpose(next);
    if (next === BankReceiptPurpose.DEBT_COLLECTION) {
      setPartnerKind(PartnerLookupType.CUSTOMER);
      setPartnerId("");
      setCounterpartyCode("");
      setCounterpartyName("");
      setCounterpartyPhone("");
      setPayerName("");
      setAddress("");
      setReason("");
      setLines([emptyFormLine()]);
    }
  }, []);

  const debtPickInitialPartner = useMemo((): VoucherPartnerOption | null => {
    if (!partnerId || !counterpartyCode) return null;
    return {
      lookupKey: `${partnerKind}:${partnerId}`,
      id: partnerId,
      code: counterpartyCode,
      name: counterpartyName,
      phone: counterpartyPhone || undefined,
      kind: partnerKind,
      kindLabel: PARTNER_LOOKUP_LABEL[partnerKind],
    };
  }, [partnerId, counterpartyCode, counterpartyName, counterpartyPhone, partnerKind]);

  // BR-THU-02 (amount <= remaining debt) is enforced inside DebtCollectionPickDialog
  // itself. NOTE: unlike the cash "Thu nợ" flow (which hits a dedicated saga that
  // atomically settles each picked invoice_debt), no equivalent settlement endpoint
  // exists yet for deposit receipts — this purpose only tags/categorizes a manual
  // voucher; picking debts here is a data-entry convenience (prefill partner/
  // reason/amount), it does not reduce the customer's outstanding debt server-side.
  const handleDebtCollectionConfirm = useCallback(
    (result: DebtCollectionPickResult) => {
      applyPartnerFromSearch(result.partner);
      const reasonText = `Thu nợ của ${result.partner.name}`;
      setReason(reasonText);
      setLines([{ description: reasonText, amount: result.totalCollect, category: "" }]);
    },
    [applyPartnerFromSearch],
  );

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
              <Input value={row.description} onChange={(e) => onChange(e.target.value)} />
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
              <MoneyInput value={row.amount} onChange={(v) => onChange(v === "" ? 0 : v)} />
            ),
      },
      {
        key: "category",
        label: LABELS.category,
        width: 200,
        type: readOnly ? "readonly" : undefined,
        getValue: (r) =>
          r.categoryId
            ? (receiptCategories.find((c) => c.id === r.categoryId)?.name ?? r.category)
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
                {receiptCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            ),
      },
    ],
    [readOnly, receiptCategories],
  );

  const lineColumnsWithFooterEdit: LineColumn<VoucherFormLine>[] = useMemo(
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

  const lineColumnsWithFooterView: TableColumn<VoucherFormLine>[] = useMemo(
    () =>
      lineColumnsWithFooterEdit.map((c) => ({
        key: c.key,
        label: c.label,
        width: c.width,
        className: c.key === "amount" ? "text-right tabular-nums" : undefined,
        footer: c.footer,
        render: (row: VoucherFormLine) => c.getValue?.(row) ?? "",
      })),
    [lineColumnsWithFooterEdit],
  );

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  const handleSave = useCallback(() => {
    if (!onSave) return;
    if (!depositAccountId) {
      toast.error("Vui lòng chọn tài khoản nhận.");
      return;
    }
    if (!docDate) {
      toast.error("Ngày thu là bắt buộc.");
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
      documentNumber: documentNumber.trim() || undefined,
      depositAccountId,
      docDate,
      purpose,
      partnerType: partnerId ? lookupTypeToPartnerType(partnerKind) : undefined,
      partnerId: partnerId || undefined,
      payerName: payerName || undefined,
      reason: reason || undefined,
      collectedBy: staffId || undefined,
      reference: reference || undefined,
      affectRevenue,
      totalAmount,
      lines: validLines.map((l) => ({
        description: l.description,
        amount: Number(l.amount) || 0,
        categoryId: l.categoryId || undefined,
      })),
    });
    toast.success(
      mode === TreasuryVoucherDialogModeEnum.CREATE ? "Đã thêm phiếu thu." : "Đã cập nhật phiếu thu.",
    );
    handleClose();
  }, [
    onSave,
    depositAccountId,
    docDate,
    lines,
    documentNumber,
    purpose,
    partnerId,
    partnerKind,
    payerName,
    reason,
    staffId,
    reference,
    affectRevenue,
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
                name="deposit-receipt-purpose"
                value={purpose}
                options={purposeOptions}
                onChange={handlePurposeChange}
                readOnly={readOnly}
              />
            </FormField>
            {isDebtCollection && !readOnly ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setDebtPickOpen(true)}>
                Chọn hóa đơn thu nợ
              </Button>
            ) : null}
          </div>
        }
        generalInfo={
          <>
            <VoucherPartnerFields
              label={LABELS.counterparty}
              readOnly={readOnly || isDebtCollection}
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
                setPayerName((prev) => prev.trim() || p.partnerName);
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
              onCreateNew={!readOnly && !isDebtCollection ? (kind) => setPartnerCreateKind(kind) : undefined}
            />
            <FormField label={LABELS.person} layout="horizontal" labelWidth="8rem">
              <Input
                value={payerName}
                onChange={(e) => setPayerName(e.target.value)}
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
            <FormField label="Tính vào doanh thu" layout="horizontal" labelWidth="8rem">
              <input
                type="checkbox"
                checked={affectRevenue}
                onChange={(e) => setAffectRevenue(e.target.checked)}
                disabled={readOnly}
                className={cn("h-9", fieldClass(readOnly))}
              />
            </FormField>
          </>
        }
        detail={
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {readOnly ? (
              <BaseDataTable
                columns={lineColumnsWithFooterView}
                rows={lines}
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
                onChangeCell={(idx, key, value) => {
                  setLines((prev) =>
                    prev.map((l, i) => {
                      if (i !== idx) return l;
                      if (key === "category") {
                        const cat = receiptCategories.find((c) => c.id === value);
                        return { ...l, categoryId: (value as string) || undefined, category: cat?.name ?? "" };
                      }
                      return { ...l, [key]: value };
                    }),
                  );
                }}
                onAddRow={isDebtCollection ? undefined : () => setLines((prev) => [...prev, emptyFormLine()])}
                onDeleteRow={
                  isDebtCollection
                    ? undefined
                    : (idx) => setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))
                }
                showAddRow={!isDebtCollection}
                showRowActions={!isDebtCollection}
              />
            )}
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
        <DebtCollectionPickDialog
          open
          onOpenChange={setDebtPickOpen}
          defaultCollectionDate={docDate}
          initialPartner={debtPickInitialPartner}
          onConfirm={handleDebtCollectionConfirm}
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
            setPayerName((prev) => prev.trim() || p.name);
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
            setPayerName((prev) => prev.trim() || c.name);
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
            setPayerName((prev) => prev.trim() || e.name);
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
