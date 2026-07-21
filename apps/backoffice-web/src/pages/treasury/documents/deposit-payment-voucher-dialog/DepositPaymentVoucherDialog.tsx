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
  SingleSelect,
  formatMoneyInteger,
  type LineColumn,
  type SingleSelectOption,
  type ToolbarItem,
} from "@erp/ui";
import { DocumentType } from "@erp/shared-interfaces";
import { Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";
import { useGenerateDocumentNumber } from "../../../../hooks/document-numbering/useGenerateDocumentNumber";
import { getStoredUserId } from "../../../../lib/auth-storage";
import { useBranches } from "../../../../hooks/iam/useBranches";
import { useBranchStore } from "../../../../store/common/branch/branch.store";
import { useDepositDashboard } from "../../../../hooks/treasury/use-deposit-dashboard";
import { BaseDataTable, type TableColumn } from "../../../../components/table/BaseDataTable";
import {
  BankPaymentPurpose,
  BankPaymentReferenceType,
  FundSwapDirection,
  SupplierDepositPaymentFund,
  type BankPayment,
  type CreateBankPaymentBody,
  type CreateFundSwapBody,
  type CreateSupplierDepositPaymentBody,
} from "../../bank-vouchers.types";
import type { CreateDepositTransferBody } from "../../deposit-transfer/deposit-transfer.types";
import { useDepositTransfer } from "../../../../hooks/treasury/use-deposit-transfers";
import { CashVoucherCategoryDirection, CashVoucherPartnerType } from "../../cash-vouchers.types";
import { useCashVoucherCategories } from "../../../../hooks/treasury/use-cash-voucher-categories";
import type { LedgerCashVoucherDocumentLine } from "../../ledger-cash/ledger-cash.types";
import {
  DebtRepaymentPickDialog,
  type DebtRepaymentPickResult,
} from "../payment-voucher-dialog/DebtRepaymentPickDialog";
import { READONLY_INPUT_CLASS } from "../../ledger-cash/ledger-cash.constants";
import {
  DepositPaymentPurposeRadio,
  DEPOSIT_PAYMENT_PURPOSE_RADIO_OPTIONS,
  emptyFormLine,
  type VoucherFormLine,
} from "../_shared/voucher-dialog.constants";
import { TreasuryVoucherDialogModeEnum } from "../_shared/voucher-dialog.types";
import { VoucherLink } from "../_shared/VoucherLink";
import { useFundSwapLegs } from "../../../../hooks/treasury/use-fund-swap";
import { formatDepositAccountLabel, voucherLineTotal } from "../_shared/voucher-dialog.utils";
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

// "Trả nợ NCC" moved out of this flat list — it is now the DEBT_GROUP branch of
// the top-level "Mục đích chi" radio (see DepositPaymentPurposeRadio). PURCHASE/
// EXPENSE/REFUND/BANK_FEE were dropped entirely (product decision) — no longer
// selectable when creating/editing a voucher.
const PAYMENT_PURPOSE_OPTIONS: SingleSelectOption[] = [
  { value: BankPaymentPurpose.OTHER, label: "Chi khác" },
  { value: BankPaymentPurpose.CASH_TRANSFER, label: "Chuyển tiền gửi thành tiền mặt" },
  { value: BankPaymentPurpose.INTER_BRANCH_OUT, label: "Chuyển tiền gửi đến cửa hàng khác" },
];

// Defensive display-only labels for the dropped purposes — so a voucher saved
// before this change (or created directly via API) still shows a real label
// instead of a blank Select when merely viewed/edited, without making these
// purposes choosable again for new saves.
const LEGACY_PURPOSE_LABELS: Partial<Record<BankPaymentPurpose, string>> = {
  [BankPaymentPurpose.PURCHASE]: "Mua hàng",
  [BankPaymentPurpose.EXPENSE]: "Chi phí",
  [BankPaymentPurpose.REFUND]: "Hoàn tiền",
  [BankPaymentPurpose.BANK_FEE]: "Phí ngân hàng",
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

export type DepositPaymentSaveResult =
  | { kind: "voucher"; body: CreateBankPaymentBody }
  | { kind: "supplierDepositPayment"; body: CreateSupplierDepositPaymentBody }
  | { kind: "fundSwap"; body: CreateFundSwapBody }
  | { kind: "depositTransfer"; body: CreateDepositTransferBody };

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
  const [purposeGroup, setPurposeGroup] = useState<DepositPaymentPurposeRadio>(
    DepositPaymentPurposeRadio.OTHER_GROUP,
  );
  const [purpose, setPurpose] = useState<BankPaymentPurpose>(BankPaymentPurpose.OTHER);
  const [toBranchId, setToBranchId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
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
  const [autoCreateReceipt, setAutoCreateReceipt] = useState(true);
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

  const currentBranchId = useBranchStore((s) => s.branchId);
  const { data: branches = [] } = useBranches();
  const { data: depositDashboard } = useDepositDashboard();

  const isSupplierPayment = purposeGroup === DepositPaymentPurposeRadio.DEBT_GROUP;
  // BR-CHI-05: fund-move purposes never count as an expense.
  const isFundMove =
    purpose === BankPaymentPurpose.CASH_TRANSFER || purpose === BankPaymentPurpose.INTER_BRANCH_OUT;
  const isBranchTransfer = purpose === BankPaymentPurpose.INTER_BRANCH_OUT;
  // Both auto-filled sub-modes lock the grid to one row; only Trả nợ also locks Số tiền.
  const lockRowCount = isSupplierPayment || isFundMove;
  const debtFieldsLocked = isSupplierPayment && !readOnly;

  const branchOptions = useMemo<SingleSelectOption[]>(
    () => branches.filter((b) => b.id !== currentBranchId).map((b) => ({ value: b.id, label: b.name })),
    [branches, currentBranchId],
  );
  const toBranchAccounts = useMemo(
    () => depositDashboard?.branches.find((b) => b.branchId === toBranchId)?.accounts ?? [],
    [depositDashboard, toBranchId],
  );
  const toAccountOptions = useMemo<SingleSelectOption[]>(
    () => toBranchAccounts.map((a) => ({ value: a.accountId, label: formatDepositAccountLabel(a) })),
    [toBranchAccounts],
  );
  const showToAccountGap = Boolean(toBranchId) && toAccountOptions.length === 0;

  // toBranchId/toAccountId live only on the deposit_transfers row (not on the
  // bank_payment itself) — view/edit of an already-created INTER_BRANCH_OUT
  // voucher must fetch it separately to show "Cửa hàng nhận"/"Tài khoản nhận".
  const linkedTransferId =
    mode !== TreasuryVoucherDialogModeEnum.CREATE &&
    initial?.referenceType === BankPaymentReferenceType.TRANSFER
      ? initial.referenceId
      : undefined;
  const { data: linkedTransfer } = useDepositTransfer(linkedTransferId, Boolean(linkedTransferId));

  useEffect(() => {
    if (!linkedTransfer) return;
    setToBranchId(linkedTransfer.toBranchId);
    setToAccountId(linkedTransfer.toAccountId);
  }, [linkedTransfer]);

  // Append the current purpose as a display-only option when it's one of the
  // dropped legacy values (see LEGACY_PURPOSE_LABELS) — keeps an existing
  // saved voucher's Select from rendering blank on view/edit.
  const purposeSelectOptions = useMemo<SingleSelectOption[]>(() => {
    if (PAYMENT_PURPOSE_OPTIONS.some((o) => o.value === purpose)) return PAYMENT_PURPOSE_OPTIONS;
    return [...PAYMENT_PURPOSE_OPTIONS, { value: purpose, label: LEGACY_PURPOSE_LABELS[purpose] ?? purpose }];
  }, [purpose]);

  useEffect(() => {
    setToAccountId("");
  }, [toBranchId]);

  const resetKey = `deposit-payment-${mode}-${initial?.id ?? "new"}`;

  useEffect(() => {
    if (isFundMove && affectExpense) setAffectExpense(false);
  }, [isFundMove, affectExpense]);

  useEffect(() => {
    if (!open) return;
    if (mode === TreasuryVoucherDialogModeEnum.CREATE) {
      setDepositAccountId("");
      setPurposeGroup(DepositPaymentPurposeRadio.OTHER_GROUP);
      setPurpose(BankPaymentPurpose.OTHER);
      setToBranchId("");
      setToAccountId("");
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
      setAutoCreateReceipt(true);
      setLines([emptyFormLine()]);
      setDocumentLines([]);
      return;
    }
    if (initial) {
      setDepositAccountId(initial.depositAccountId);
      setPurposeGroup(
        initial.purpose === BankPaymentPurpose.SUPPLIER_PAYMENT
          ? DepositPaymentPurposeRadio.DEBT_GROUP
          : DepositPaymentPurposeRadio.OTHER_GROUP,
      );
      setPurpose(initial.purpose);
      setToBranchId("");
      setToAccountId("");
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
      setAutoCreateReceipt(true);
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

  // Default "Nhân viên chi" to whoever is logged in — still a normal editable
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
          // Only when the voucher has no frozen snapshot of its own — the
          // snapshot is what the address looked like when the voucher was made.
          if (partner.address && !initial.partnerAddressSnapshot) {
            setAddress(partner.address);
          }
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

  // Top-level "Mục đích chi" radio — resets everything the other branch left behind.
  const handlePurposeGroupChange = useCallback((next: DepositPaymentPurposeRadio) => {
    setPurposeGroup(next);
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
    setToBranchId("");
    setToAccountId("");
    setAutoCreateReceipt(true);
    setPurpose(
      next === DepositPaymentPurposeRadio.DEBT_GROUP
        ? BankPaymentPurpose.SUPPLIER_PAYMENT
        : BankPaymentPurpose.OTHER,
    );
  }, []);

  // "Hình thức chi" sub-select (only reachable when purposeGroup=OTHER_GROUP).
  // CASH_TRANSFER / INTER_BRANCH_OUT auto-fill Lý do chi + a single detail line —
  // set directly here (an explicit user action), not in a useEffect keyed on
  // `purpose`, so it never overwrites edits made while viewing/editing a saved
  // voucher and never re-stomps a manually-tweaked reason on a no-op re-render.
  const handlePurposeChange = useCallback((next: BankPaymentPurpose) => {
    setPurpose(next);
    setToBranchId("");
    setToAccountId("");
    setAutoCreateReceipt(true);
    if (next === BankPaymentPurpose.CASH_TRANSFER) {
      setReason("Rút tiền gửi về nhập quỹ tiền mặt");
      setLines([
        {
          description: "Rút tiền gửi về nhập quỹ tiền mặt",
          amount: 0,
          category: "Rút tiền gửi về nhập quỹ",
          categoryId: undefined,
        },
      ]);
    } else if (next === BankPaymentPurpose.INTER_BRANCH_OUT) {
      setReason("Chi chuyển tiền sang cửa hàng");
      setLines([
        {
          description: "Chi chuyển tiền sang cửa hàng",
          amount: 0,
          category: "Chi chuyển tiền sang cửa hàng khác",
          categoryId: undefined,
        },
      ]);
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
        type: readOnly || lockRowCount ? "readonly" : undefined,
        getValue: (r) => r.description,
        renderEditor:
          readOnly || lockRowCount
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
        // Only Trả nợ locks Số tiền (amount comes from the debt picker's
        // allocations) — the two fund-move sub-modes still need it typed by hand.
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
        type: readOnly || lockRowCount ? "readonly" : undefined,
        getValue: (r) =>
          r.categoryId
            ? (paymentCategories.find((c) => c.id === r.categoryId)?.name ?? r.category)
            : r.category,
        renderEditor:
          readOnly || lockRowCount
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
    [readOnly, isSupplierPayment, lockRowCount, paymentCategories],
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

    if (purpose === BankPaymentPurpose.CASH_TRANSFER) {
      if (lineTotal <= 0) {
        toast.error("Vui lòng nhập số tiền chuyển.");
        return;
      }
      onSave({
        kind: "fundSwap",
        body: {
          direction: FundSwapDirection.DEPOSIT_TO_CASH,
          depositAccountId,
          amount: lineTotal,
          docDate,
          reason: reason || undefined,
          autoCreateReceipt,
          // Carried onto both legs so the generated vouchers are not blank —
          // same set the normal `voucher` path below already sends.
          partnerType: partnerId ? lookupTypeToPartnerType(partnerKind) : undefined,
          partnerId: partnerId || undefined,
          payeeName: payeeName || undefined,
          address: address || undefined,
          paidBy: staffId || undefined,
          reference: reference || undefined,
          lines: lines
            .filter((l) => l.description.trim() || Number(l.amount) > 0)
            .map((l) => ({
              description: l.description,
              amount: Number(l.amount) || 0,
              categoryId: l.categoryId || undefined,
            })),
        },
      });
      toast.success(
        autoCreateReceipt ? "Đã chuyển quỹ." : "Đã chuyển quỹ — chưa tạo phiếu thu tiền mặt.",
      );
      handleClose();
      return;
    }

    if (purpose === BankPaymentPurpose.INTER_BRANCH_OUT) {
      if (!toBranchId) {
        toast.error("Vui lòng chọn cửa hàng nhận.");
        return;
      }
      if (!toAccountId) {
        toast.error("Vui lòng chọn tài khoản nhận.");
        return;
      }
      if (lineTotal <= 0) {
        toast.error("Vui lòng nhập số tiền chuyển.");
        return;
      }
      onSave({
        kind: "depositTransfer",
        body: {
          toBranchId,
          toAccountId,
          amount: lineTotal,
          note: reason || undefined,
          partnerType: partnerId ? lookupTypeToPartnerType(partnerKind) : undefined,
          partnerId: partnerId || undefined,
          payeeName: payeeName || undefined,
          paidBy: staffId || undefined,
        },
      });
      toast.success("Đã khởi tạo chuyển tiền — trạng thái Đang chuyển.");
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
    lineTotal,
    documentNumber,
    purpose,
    toBranchId,
    toAccountId,
    staffId,
    reference,
    address,
    isFundMove,
    affectExpense,
    autoCreateReceipt,
    mode,
    handleClose,
  ]);

  /**
   * "Tham chiếu" — the other voucher generated by the same fund swap. Both legs
   * share one referenceId, so the counterpart is simply the leg that is not this
   * voucher.
   */
  const fundSwapId =
    initial?.referenceType === BankPaymentReferenceType.FUND_SWAP ? initial.referenceId : undefined;
  const { data: fundSwapLegs = [] } = useFundSwapLegs(fundSwapId);
  const counterpartLabel = useMemo(() => {
    const other = fundSwapLegs.find((leg) => leg.id !== initial?.id);
    return other?.documentNumber ?? "";
  }, [fundSwapLegs, initial?.id]);

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
        scroll="page"
        open
        onOpenChange={(nextOpen) => {
          if (!nextOpen) handleClose();
        }}
        title={title}
        toolbarItems={toolbarItems}
        purpose={
          <div className="flex flex-wrap items-center gap-3">
            <FormField label={LABELS.purpose} layout="horizontal" labelWidth="8rem" className="mb-0">
              <SingleSelect
                options={DEPOSIT_PAYMENT_PURPOSE_RADIO_OPTIONS}
                value={purposeGroup}
                onValueChange={(v) => handlePurposeGroupChange(v as DepositPaymentPurposeRadio)}
                disabled={readOnly}
                className="w-48"
              />
            </FormField>
            {isSupplierPayment ? (
              !readOnly ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setDebtPickOpen(true)}>
                  Chọn hóa đơn trả nợ
                </Button>
              ) : null
            ) : (
              <FormField label="Hình thức chi" layout="horizontal" labelWidth="8rem" className="mb-0">
                <SingleSelect
                  options={purposeSelectOptions}
                  value={purpose}
                  onValueChange={(v) => handlePurposeChange(v as BankPaymentPurpose)}
                  disabled={readOnly}
                  className="w-64"
                />
              </FormField>
            )}
          </div>
        }
        generalInfo={
          <>
            {isBranchTransfer ? (
              <FormField label="Cửa hàng nhận" required layout="horizontal" labelWidth="8rem">
                <SingleSelect
                  options={branchOptions}
                  value={toBranchId}
                  onValueChange={setToBranchId}
                  placeholder="Chọn cửa hàng"
                  disabled={readOnly}
                />
              </FormField>
            ) : null}
            <VoucherPartnerFields
              label={isSupplierPayment ? "Nhà cung cấp" : LABELS.counterparty}
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
              readOnly={readOnly || debtFieldsLocked}
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
            {counterpartLabel || reference ? (
              <FormField label="Tham chiếu" layout="horizontal" labelWidth="8rem">
                <span className="flex h-9 items-center text-sm">
                  {counterpartLabel ? (
                    // The counterpart of a fund swap lives on another screen, so
                    // it is shown but not clickable — same as the cash dialog's
                    // linked-document row.
                    <VoucherLink code={counterpartLabel} clickable={false} />
                  ) : (
                    reference
                  )}
                </span>
              </FormField>
            ) : null}
            {purpose === BankPaymentPurpose.CASH_TRANSFER ? (
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={autoCreateReceipt}
                    disabled={readOnly}
                    onChange={(e) => setAutoCreateReceipt(e.target.checked)}
                  />
                  Tự động sinh phiếu thu tiền ngay sau khi chi
                </label>
                {!autoCreateReceipt ? (
                  <p className="pl-6 text-xs text-muted-foreground">
                    Tiền sẽ treo ở tài khoản "Tiền đang chuyển" — tự tạo Phiếu thu tiền mặt riêng sau khi
                    đã đếm tiền.
                  </p>
                ) : null}
              </div>
            ) : isBranchTransfer ? (
              <div className="flex flex-col gap-1">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked disabled />
                  Tự động sinh phiếu thu tiền ngay sau khi chi
                </label>
                <p className="pl-6 text-xs text-muted-foreground">
                  Chi nhánh đích tự xác nhận nhận tiền sau (trang Chuyển liên chi nhánh).
                </p>
              </div>
            ) : null}
            {isBranchTransfer ? (
              <>
                <FormField label="Tài khoản nhận" layout="horizontal" labelWidth="8rem">
                  <SingleSelect
                    options={toAccountOptions}
                    value={toAccountId}
                    onValueChange={setToAccountId}
                    placeholder={toBranchId ? "Chọn tài khoản" : "Chọn cửa hàng nhận trước"}
                    disabled={readOnly || !toBranchId}
                  />
                </FormField>
                {showToAccountGap ? (
                  <p className="text-xs text-amber-600">
                    Không thấy tài khoản tiền gửi nào của cửa hàng này — bạn có thể không được
                    gán quyền xem quỹ chi nhánh đích.
                  </p>
                ) : null}
              </>
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
          <div className="flex flex-col gap-2">
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
                className="h-auto overflow-visible"
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
                  lockRowCount ? undefined : () => setLines((prev) => [...prev, emptyFormLine()])
                }
                onDeleteRow={
                  lockRowCount
                    ? undefined
                    : (idx) => setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev))
                }
                showAddRow={!lockRowCount}
                showRowActions={!lockRowCount}
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
