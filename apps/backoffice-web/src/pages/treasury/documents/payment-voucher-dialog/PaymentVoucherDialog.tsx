import { DocumentType } from "@erp/shared-interfaces";
import {
  Button,
  DateTimeField,
  DocumentFormDialog,
  FormField,
  Input,
  LineItemGrid,
  MoneyInput,
  SingleSelect,
  cn,
  formatMoneyInteger,
  type LineColumn,
  type SingleSelectOption,
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
  CashPaymentReferenceType,
  CashTransferFundKind,
  CashVoucherCategoryDirection,
} from "../../cash-vouchers.types";
import { FundSwapDirection, type CreateFundSwapBody } from "../../bank-vouchers.types";
import type { CreateCashTransferBody } from "../../cash-transfer/cash-transfer.types";
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
  TRANSFER_SUB_OPTION_REASON,
  apiPurposeToSubOption,
  emptyFormLine,
  isTransferSubOption,
  subOptionToApiPurpose,
  PaymentOtherSubOption,
  PaymentPurposeRadio,
  type VoucherFormLine,
} from "../_shared/voucher-dialog.constants";
import { DepositAccountSelect } from "../_shared/DepositAccountSelect";
import { useBranches } from "../../../../hooks/iam/useBranches";
import { useBranchStore } from "../../../../store/common/branch/branch.store";
import { useDepositDashboard } from "../../../../hooks/treasury/use-deposit-dashboard";
import { useCashTransfer } from "../../../../hooks/treasury/use-cash-transfers";
import { TreasuryVoucherDialogModeEnum } from "../_shared/voucher-dialog.types";
import {
  buildPaymentDetailFromForm,
  formatDepositAccountLabel,
  toIsoDate,
  voucherLineTotal,
} from "../_shared/voucher-dialog.utils";
import type { VoucherEntitySearchTarget } from "../_shared/voucher-entity-search.store";
import type { VoucherPartnerOption } from "../_shared/voucher-partner-search";
import { usePartnerLookup } from "../_shared/voucher-partner-search";
import {
  PartnerLookupType,
  inferLookupType,
  lookupTypeToPartnerType,
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

/**
 * The two transfer sub-modes don't post an ordinary cash payment — they hit
 * dedicated endpoints that write both legs. The dialog emits which one it built
 * and the page performs the HTTP call, mirroring `DepositPaymentSaveResult`.
 */
export type CashPaymentSaveResult =
  | { kind: "voucher"; detail: LedgerCashVoucherDetail }
  | { kind: "fundSwap"; body: CreateFundSwapBody }
  | { kind: "cashTransfer"; body: CreateCashTransferBody };

const RECEIVING_FUND_OPTIONS: SingleSelectOption[] = [
  { value: CashTransferFundKind.CASH, label: "Thu tiền mặt" },
  { value: CashTransferFundKind.DEPOSIT, label: "Thu tiền gửi" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: TreasuryVoucherDialogModeEnum;
  initial: LedgerCashVoucherDetail | null;
  onSave?: (result: CashPaymentSaveResult) => void;
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
  /** Destination deposit account of "Chuyển tiền mặt thành tiền gửi" (this branch). */
  const [transferAccountId, setTransferAccountId] = useState("");
  const [autoCreateReceipt, setAutoCreateReceipt] = useState(true);
  const [toBranchId, setToBranchId] = useState("");
  const [toFundKind, setToFundKind] = useState<CashTransferFundKind>(
    CashTransferFundKind.CASH,
  );
  const [toAccountId, setToAccountId] = useState("");

  const currentBranchId = useBranchStore((s) => s.branchId);
  const { data: branches = [] } = useBranches();
  const { data: depositDashboard } = useDepositDashboard();

  const isDebtRepayment =
    paymentPurpose === CashPaymentPurpose.SUPPLIER_PAYMENT;
  const purposeRadio: PaymentPurposeRadio = isDebtRepayment
    ? PaymentPurposeRadio.DEBT_GROUP
    : PaymentPurposeRadio.OTHER_GROUP;
  const isCashToDeposit =
    !isDebtRepayment && paymentSubOption === PaymentOtherSubOption.CASH_TO_DEPOSIT;
  const isBranchTransfer =
    !isDebtRepayment && paymentSubOption === PaymentOtherSubOption.BRANCH_TRANSFER;
  const isFundMove = isCashToDeposit || isBranchTransfer;
  const debtFieldsLocked = isDebtRepayment && !readOnly;
  // Both auto-filled sub-modes lock the grid to one row; only Trả nợ also locks Số tiền.
  const lockRowCount = isDebtRepayment || isFundMove;

  const branchOptions = useMemo<SingleSelectOption[]>(
    () =>
      branches
        .filter((b) => b.id !== currentBranchId)
        .map((b) => ({ value: b.id, label: b.name })),
    [branches, currentBranchId],
  );
  const toBranchAccounts = useMemo(
    () => depositDashboard?.branches.find((b) => b.branchId === toBranchId)?.accounts ?? [],
    [depositDashboard, toBranchId],
  );
  const toAccountOptions = useMemo<SingleSelectOption[]>(
    () =>
      toBranchAccounts.map((a) => ({
        value: a.accountId,
        label: formatDepositAccountLabel(a),
      })),
    [toBranchAccounts],
  );
  const showToAccountGap =
    toFundKind === CashTransferFundKind.DEPOSIT &&
    Boolean(toBranchId) &&
    toAccountOptions.length === 0;

  // toBranchId/toFundKind/toAccountId live only on the cash_transfer row (not on
  // the cash_payment itself) — view/edit of an already-created INTER_BRANCH_OUT
  // voucher must fetch it separately.
  const linkedTransferId =
    mode !== TreasuryVoucherDialogModeEnum.CREATE &&
    initial?.referenceType === CashPaymentReferenceType.TRANSFER
      ? (initial.referenceId ?? undefined)
      : undefined;
  const { data: linkedTransfer } = useCashTransfer(
    linkedTransferId,
    Boolean(linkedTransferId),
  );

  useEffect(() => {
    if (!linkedTransfer) return;
    setToBranchId(linkedTransfer.toBranchId);
    setToFundKind(linkedTransfer.toFundKind);
    setToAccountId(linkedTransfer.toDepositAccountId ?? "");
  }, [linkedTransfer]);

  const resetKey = `payment-${mode}-${initial?.voucherNo ?? "new"}-${initial?.partnerId ?? ""}`;

  useEffect(() => {
    if (!open || isGoodsView) return;
    if (mode === TreasuryVoucherDialogModeEnum.CREATE) {
      setPaymentPurpose(CashPaymentPurpose.OTHER);
      setPaymentSubOption(PaymentOtherSubOption.OTHER);
      setTransferAccountId("");
      setAutoCreateReceipt(true);
      setToBranchId("");
      setToFundKind(CashTransferFundKind.CASH);
      setToAccountId("");
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
      const savedPurpose = initial.paymentPurpose ?? CashPaymentPurpose.OTHER;
      setPaymentPurpose(savedPurpose);
      setPaymentSubOption(
        apiPurposeToSubOption(savedPurpose, initial.referenceType),
      );
      setTransferAccountId("");
      setAutoCreateReceipt(true);
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

  /**
   * Auto-fills "Lý do chi" + the single locked detail line for a transfer
   * sub-mode. Done here rather than in an effect so re-picking the same option
   * after manual edits still restores the defaults, and so switching away can't
   * leave a stale destination behind.
   */
  const handleSubOptionChange = useCallback((next: PaymentOtherSubOption) => {
    setPaymentSubOption(next);
    setPaymentPurpose(subOptionToApiPurpose(next));
    setTransferAccountId("");
    setAutoCreateReceipt(true);
    setToBranchId("");
    setToFundKind(CashTransferFundKind.CASH);
    setToAccountId("");
    if (!isTransferSubOption(next)) return;
    const text = TRANSFER_SUB_OPTION_REASON[next];
    setReason(text);
    setLines([
      { description: text, amount: 0, category: "", categoryId: undefined },
    ]);
  }, []);

  // Changing the destination branch invalidates the account picked from the old one.
  useEffect(() => {
    setToAccountId("");
  }, [toBranchId]);

  const handleRadioChange = useCallback((next: PaymentPurposeRadio) => {
    if (next === PaymentPurposeRadio.DEBT_GROUP) {
      setPaymentPurpose(CashPaymentPurpose.SUPPLIER_PAYMENT);
      setPaymentSubOption(PaymentOtherSubOption.OTHER);
      setTransferAccountId("");
      setAutoCreateReceipt(true);
      setToBranchId("");
      setToFundKind(CashTransferFundKind.CASH);
      setToAccountId("");
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
      setAutoCreateReceipt(true);
      setToBranchId("");
      setToFundKind(CashTransferFundKind.CASH);
      setToAccountId("");
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
    const total = voucherLineTotal(validLines);
    if (total <= 0) {
      toast.error("Tổng số tiền phải lớn hơn 0.");
      return;
    }

    const transferLines = validLines.map((l) => ({
      description: l.description,
      amount: l.amount,
      categoryId: l.categoryId,
    }));

    // "Chuyển tiền mặt thành tiền gửi" — both legs inside this branch, posted by
    // POST /fund-swaps rather than as an ordinary cash payment.
    if (isCashToDeposit) {
      if (!transferAccountId) {
        toast.error("Vui lòng chọn tài khoản thu.");
        return;
      }
      onSave({
        kind: "fundSwap",
        body: {
          direction: FundSwapDirection.CASH_TO_DEPOSIT,
          depositAccountId: transferAccountId,
          amount: total,
          docDate: voucherDate,
          reason: reason || undefined,
          autoCreateReceipt,
          partnerType: partnerId ? lookupTypeToPartnerType(partnerKind) : undefined,
          partnerId: partnerId || undefined,
          payeeName: personName || undefined,
          address: address || undefined,
          paidBy: staffId || undefined,
          lines: transferLines,
        },
      });
    } else if (isBranchTransfer) {
      if (!toBranchId) {
        toast.error("Vui lòng chọn cửa hàng nhận.");
        return;
      }
      if (toFundKind === CashTransferFundKind.DEPOSIT && !toAccountId) {
        toast.error("Vui lòng chọn tài khoản nhận.");
        return;
      }
      onSave({
        kind: "cashTransfer",
        body: {
          toBranchId,
          toFundKind,
          toAccountId:
            toFundKind === CashTransferFundKind.DEPOSIT ? toAccountId : undefined,
          amount: total,
          docDate: voucherDate,
          note: reason || undefined,
          partnerType: partnerId ? lookupTypeToPartnerType(partnerKind) : undefined,
          partnerId: partnerId || undefined,
          payeeName: personName || undefined,
          address: address || undefined,
          paidBy: staffId || undefined,
          lines: transferLines,
        },
      });
    } else {
      onSave({
        kind: "voucher",
        detail: buildPaymentDetailFromForm({
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
        }),
      });
    }
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
    isCashToDeposit,
    isBranchTransfer,
    autoCreateReceipt,
    toBranchId,
    toFundKind,
    toAccountId,
    documentLines,
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
        scroll="page"
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
                      onChange={(e) =>
                        handleSubOptionChange(
                          e.target.value as PaymentOtherSubOption,
                        )
                      }
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
            {isBranchTransfer ? (
              <FormField
                label="Cửa hàng nhận"
                required
                layout="horizontal"
                labelWidth="8rem"
              >
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
            {isFundMove ? (
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={isBranchTransfer ? true : autoCreateReceipt}
                      disabled={readOnly || isBranchTransfer}
                      onChange={(e) => setAutoCreateReceipt(e.target.checked)}
                    />
                    Tự động sinh phiếu thu tiền ngay sau khi chi
                  </label>
                  {isBranchTransfer ? (
                    <SingleSelect
                      options={RECEIVING_FUND_OPTIONS}
                      value={toFundKind}
                      onValueChange={(v) =>
                        setToFundKind(v as CashTransferFundKind)
                      }
                      className="w-40"
                      disabled={readOnly}
                    />
                  ) : null}
                </div>
                {isBranchTransfer ? (
                  <p className="pl-6 text-xs text-muted-foreground">
                    Chi nhánh đích tự xác nhận nhận tiền sau (trang Chuyển tiền mặt liên
                    chi nhánh).
                  </p>
                ) : !autoCreateReceipt ? (
                  <p className="pl-6 text-xs text-muted-foreground">
                    Tiền sẽ treo ở tài khoản "Tiền đang chuyển" — tự tạo Phiếu thu tiền
                    gửi riêng sau khi ngân hàng báo có.
                  </p>
                ) : null}
              </div>
            ) : null}
            {isCashToDeposit ? (
              <FormField
                label="Tài khoản thu"
                required
                layout="horizontal"
                labelWidth="8rem"
              >
                <DepositAccountSelect
                  value={transferAccountId}
                  onChange={setTransferAccountId}
                  disabled={readOnly}
                />
              </FormField>
            ) : null}
            {isBranchTransfer && toFundKind === CashTransferFundKind.DEPOSIT ? (
              <>
                <FormField
                  label="Tài khoản nhận"
                  required
                  layout="horizontal"
                  labelWidth="8rem"
                >
                  <SingleSelect
                    options={toAccountOptions}
                    value={toAccountId}
                    onValueChange={setToAccountId}
                    placeholder={
                      toBranchId ? "Chọn tài khoản" : "Chọn cửa hàng nhận trước"
                    }
                    disabled={readOnly || !toBranchId}
                  />
                </FormField>
                {showToAccountGap ? (
                  <p className="text-xs text-amber-600">
                    Không thấy tài khoản tiền gửi nào của cửa hàng này — bạn có thể không
                    được gán quyền xem quỹ chi nhánh đích.
                  </p>
                ) : null}
              </>
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
          <div className="flex flex-col gap-2">
            <LineItemGrid
              className="h-auto overflow-visible"
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
                readOnly || lockRowCount
                  ? undefined
                  : () => setLines((prev) => [...prev, emptyFormLine()])
              }
              onDeleteRow={
                readOnly || lockRowCount
                  ? undefined
                  : (idx) =>
                      setLines((prev) =>
                        prev.length > 1
                          ? prev.filter((_, i) => i !== idx)
                          : prev,
                      )
              }
              showAddRow={!readOnly && !lockRowCount}
              showRowActions={!readOnly && !lockRowCount}
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
