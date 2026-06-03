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
import { BaseDataTable } from "../../../../components/table/BaseDataTable";
import { Tabs } from "../../../../components/tabs";
import { VoucherLink } from "../_shared/VoucherLink";
import { CashVoucherCategoryDirection } from "../../cash-vouchers.types";
import { useCashVoucherCategories } from "../../../../hooks/treasury/use-cash-voucher-categories";
import {
  DebtCollectionPickDialog,
  type DebtCollectionPickResult,
} from "./DebtCollectionPickDialog";
import {
  RECEIPT_VOUCHER_DETAIL_TABS,
  RECEIPT_VOUCHER_PURPOSE_OPTIONS,
  ReceiptVoucherDetailTabEnum,
} from "./receipt-voucher.constants";
import { useReceiptVoucherDetailColumns } from "./useReceiptVoucherDetailColumns";
import { READONLY_INPUT_CLASS } from "../../ledger-cash/ledger-cash.constants";
import {
  LedgerCashVoucherKindEnum,
  LedgerCashVoucherPurposeEnum,
  resolveInvoiceCodeFromVoucher,
  type LedgerCashVoucherDetail,
} from "../../ledger-cash/ledger-cash.types";
import {
  emptyFormLine,
  type VoucherFormLine,
} from "../_shared/voucher-dialog.constants";
import { TreasuryVoucherDialogModeEnum } from "../_shared/voucher-dialog.types";
import {
  buildReceiptDetailFromForm,
  toIsoDate,
  voucherLineTotal,
} from "../_shared/voucher-dialog.utils";
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
import {
  useCustomerOpenDebts,
  mapInvoiceDebtsToPickRows,
} from "./debt-collection.api";

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
  onSave,
  onRequestEdit,
  onOpenInvoice,
}: Props) {
  const readOnly = mode === TreasuryVoucherDialogModeEnum.VIEW;
  const { mutateAsync: generateDocNumber } = useGenerateDocumentNumber();
  const { fetchPartnerByType, fetchStaffById } = usePartnerLookup();
  const fetchDebts = useCustomerOpenDebts();

  const [purpose, setPurpose] = useState<LedgerCashVoucherPurposeEnum>(
    LedgerCashVoucherPurposeEnum.OTHER,
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
  const [lines, setLines] = useState<VoucherFormLine[]>([emptyFormLine()]);
  const [entitySearchTarget, setEntitySearchTarget] =
    useState<VoucherEntitySearchTarget | null>(null);
  const [partnerCreateKind, setPartnerCreateKind] = useState<PartnerLookupType | null>(null);
  const [staffCreateOpen, setStaffCreateOpen] = useState(false);
  const [documentLines, setDocumentLines] = useState<
    LedgerCashVoucherDetail["documentLines"]
  >([]);
  const [detailTab, setDetailTab] = useState<ReceiptVoucherDetailTabEnum>(
    ReceiptVoucherDetailTabEnum.LINES,
  );
  const [countAsRevenue, setCountAsRevenue] = useState(false);
  const [debtPickOpen, setDebtPickOpen] = useState(false);

  const { data: receiptCategories = [] } = useCashVoucherCategories(
    CashVoucherCategoryDirection.IN,
  );

  const isDebtCollection =
    purpose === LedgerCashVoucherPurposeEnum.DEBT_COLLECTION;
  const debtFieldsLocked = isDebtCollection && !readOnly;

  const resetKey = `receipt-${mode}-${initial?.voucherNo ?? "new"}-${initial?.partnerId ?? ""}`;

  useEffect(() => {
    if (!open) return;
    if (mode === TreasuryVoucherDialogModeEnum.CREATE) {
      setPurpose(LedgerCashVoucherPurposeEnum.OTHER);
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
      setLines([emptyFormLine()]);
      setDocumentLines([]);
      setDetailTab(ReceiptVoucherDetailTabEnum.LINES);
      return;
    }
    if (initial) {
      setPurpose(initial.purpose);
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
      setDocumentLines(initial.documentLines ?? []);
      setDetailTab(ReceiptVoucherDetailTabEnum.LINES);
    }
  }, [resetKey, open, mode, initial]);

  useEffect(() => {
    if (!open || mode !== TreasuryVoucherDialogModeEnum.CREATE) return;
    let cancelled = false;
    void generateDocNumber({ documentType: DocumentType.CASH_RECEIPT })
      .then((no) => {
        if (!cancelled) setVoucherNo(no);
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

  const handlePurposeChange = useCallback(
    (next: LedgerCashVoucherPurposeEnum) => {
      setPurpose(next);
      if (next === LedgerCashVoucherPurposeEnum.DEBT_COLLECTION) {
        setPartnerKind(PartnerLookupType.CUSTOMER);
        setPartnerId("");
        setCounterpartyCode("");
        setCounterpartyName("");
        setCounterpartyPhone("");
        setPersonName("");
        setAddress("");
        setReason("");
        setLines([emptyFormLine()]);
        setDocumentLines([]);
        setDetailTab(ReceiptVoucherDetailTabEnum.DOCUMENTS);
      } else {
        setDocumentLines([]);
        setDetailTab(ReceiptVoucherDetailTabEnum.LINES);
      }
    },
    [],
  );

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
  }, [
    partnerId,
    counterpartyCode,
    counterpartyName,
    counterpartyPhone,
    partnerKind,
  ]);

  const handleDebtCollectionConfirm = useCallback(
    (result: DebtCollectionPickResult) => {
      const { partner: p, documentLines: docs, totalCollect } = result;
      applyPartnerFromSearch(p);
      setDocumentLines(docs);
      const reasonText = `Thu nợ của ${p.name}`;
      setReason(reasonText);
      setLines([
        {
          description: reasonText,
          amount: totalCollect,
          category: "",
        },
      ]);
      setDetailTab(ReceiptVoucherDetailTabEnum.DOCUMENTS);
    },
    [applyPartnerFromSearch],
  );

  useEffect(() => {
    if (!open || mode === TreasuryVoucherDialogModeEnum.CREATE || !initial) {
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
    mode,
    initial?.partnerId,
    initial?.partnerType,
    initial?.staffId,
    fetchPartnerByType,
    fetchStaffById,
  ]);

  useEffect(() => {
    if (
      !open ||
      mode === TreasuryVoucherDialogModeEnum.CREATE ||
      !initial ||
      initial.purpose !== LedgerCashVoucherPurposeEnum.DEBT_COLLECTION ||
      !initial.partnerId ||
      (initial.documentLines && initial.documentLines.length > 0)
    ) {
      return;
    }
    const partnerKindResolved =
      initial.partnerKind ?? inferLookupType(initial.partnerType);
    if (partnerKindResolved !== PartnerLookupType.CUSTOMER) return;

    let cancelled = false;
    void (async () => {
      try {
        const debts = await fetchDebts(initial.partnerId!);
        if (!cancelled && debts.length > 0) {
          setDocumentLines(mapInvoiceDebtsToPickRows(debts));
        }
      } catch {
        // G3: best-effort — silent on failure
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, mode, initial, fetchDebts]);

  const lineTotal = useMemo(() => voucherLineTotal(lines), [lines]);

  const linkedInvoiceCodes = useMemo(() => {
    const codes = (documentLines ?? [])
      .map((d) => d.documentNo?.trim())
      .filter((c): c is string => !!c);
    if (codes.length > 0) return codes;
    if (reference?.trim()) return [reference.trim()];
    return [];
  }, [documentLines, reference]);

  const showDetailTabs = isDebtCollection || (documentLines?.length ?? 0) > 0;

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
        categoryId: l.categoryId,
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
        width: 200,
        type: readOnly ? "readonly" : undefined,
        getValue: (r) =>
          r.categoryId
            ? (receiptCategories.find((c) => c.id === r.categoryId)?.name ??
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
    if (!voucherNo.trim()) {
      toast.error("Số phiếu thu là bắt buộc.");
      return;
    }
    if (!voucherDate) {
      toast.error("Ngày thu là bắt buộc.");
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
      buildReceiptDetailFromForm({
        purpose,
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
              <RadioGroup
                name="voucher-purpose"
                value={purpose}
                options={[...RECEIPT_VOUCHER_PURPOSE_OPTIONS]}
                onChange={handlePurposeChange}
                readOnly={readOnly}
              />
            </FormField>
            {isDebtCollection && !readOnly ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDebtPickOpen(true)}
              >
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
              onCreateNew={!readOnly && !isDebtCollection ? (kind) => setPartnerCreateKind(kind) : undefined}
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
            {linkedInvoiceCodes.length > 0 ? (
              <FormField label="Chứng từ" layout="horizontal" labelWidth="8rem">
                <div className="flex flex-wrap items-center gap-1.5 line-clamp-1 text-sm text-indigo-500">
                  {linkedInvoiceCodes.map((code, index) => (
                    <>
                      <VoucherLink
                        key={code}
                        code={code}
                        clickable={!!onOpenInvoice}
                        onClick={() => onOpenInvoice?.(code)}
                      />
                      {index < linkedInvoiceCodes.length - 1 ? "," : ""}
                    </>
                  ))}
                </div>
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
              label="Tính vào doanh thu"
              layout="horizontal"
              labelWidth="8rem"
            >
              <input
                type="checkbox"
                checked={countAsRevenue}
                onChange={(e) => setCountAsRevenue(e.target.checked)}
                disabled={readOnly}
                className={cn("h-9", fieldClass(readOnly))}
              />
            </FormField>
          </>
        }
        detail={
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {showDetailTabs ? (
              <Tabs
                tabs={RECEIPT_VOUCHER_DETAIL_TABS}
                activeTab={detailTab}
                onTabChange={setDetailTab}
              />
            ) : null}
            {detailTab === ReceiptVoucherDetailTabEnum.DOCUMENTS &&
            showDetailTabs ? (
              <BaseDataTable
                columns={documentColumnsWithFooter}
                rows={docRows}
                loading={false}
                emptyLabel={
                  isDebtCollection
                    ? "Chưa có chứng từ — bấm Chọn hóa đơn thu nợ."
                    : "Không có chứng từ."
                }
                getRowKey={(r) => r.debtId ?? r.documentNo}
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
                          prev.map((l, i) => {
                            if (i !== idx) return l;
                            if (key === "category") {
                              const cat = receiptCategories.find(
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
                  readOnly || isDebtCollection
                    ? undefined
                    : () => setLines((prev) => [...prev, emptyFormLine()])
                }
                onDeleteRow={
                  readOnly || isDebtCollection
                    ? undefined
                    : (idx) =>
                        setLines((prev) =>
                          prev.length > 1
                            ? prev.filter((_, i) => i !== idx)
                            : prev,
                        )
                }
                showAddRow={!readOnly && !isDebtCollection}
                showRowActions={!readOnly && !isDebtCollection}
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
          defaultCollectionDate={voucherDate}
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
