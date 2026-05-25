import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  DocumentFormDialog,
  FormField,
  Input,
  LineItemGrid,
  Textarea,
  formatMoneyInteger,
  type ToolbarItem,
} from "@erp/ui";
import { DocumentType } from "@erp/shared-interfaces";
import {
  CloudUpload,
  Pencil,
  Plus,
  Save,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Tabs } from "../../../../components/tabs";
import type { TabItem } from "../../../../components/tabs";
import { ConfirmActionModal } from "../../../../components/table/ConfirmActionModal";
import { useGenerateDocumentNumber } from "../../../../hooks/document-numbering/useGenerateDocumentNumber";
import {
  READONLY_INPUT_CLASS,
  VOUCHER_FORM_LABEL_WIDTH,
} from "../../ledger-cash/ledger-cash.constants";

const DOCUMENT_LABEL_WIDTH = "7.5rem";
const SUMMARY_LABEL_WIDTH = "11rem";
import { CashCountDenominationTable } from "./CashCountDenominationTable";
import {
  CashCountDialogModeEnum,
  CashCountStatusEnum,
  type CashCountCreateDraft,
  type CashCountParticipant,
  type CashCountRecord,
} from "./cash-count.types";
import {
  computeTotals,
  emptyDenominationLines,
  emptyParticipant,
  mockBookBalanceForDate,
  syncLineAmounts,
  todayIsoDate,
} from "./cash-count.utils";
import { useCashCountParticipantColumns } from "./useCashCountParticipantColumns";

enum DetailTabEnum {
  LINES = "lines",
  PARTICIPANTS = "participants",
}

const DETAIL_TABS: readonly TabItem<DetailTabEnum>[] = [
  { id: DetailTabEnum.LINES, label: "Chi tiết" },
  { id: DetailTabEnum.PARTICIPANTS, label: "Thành viên tham gia" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: CashCountDialogModeEnum;
  initial: CashCountRecord | null;
  createDraft?: CashCountCreateDraft | null;
  onSaved: (record: CashCountRecord) => void;
  onProcess: (id: string) => void;
  onDelete?: (id: string) => void;
  onRequestEdit?: () => void;
  onRequestCreate?: () => void;
}

export function CashCountFormDialog({
  open,
  onOpenChange,
  mode,
  initial,
  createDraft,
  onSaved,
  onProcess,
  onDelete,
  onRequestEdit,
  onRequestCreate,
}: Props) {
  const isCreate = mode === CashCountDialogModeEnum.CREATE;
  const isView = mode === CashCountDialogModeEnum.VIEW;
  const isProcessed = initial?.status === CashCountStatusEnum.PROCESSED;
  const isLocked = isProcessed || isView;

  const [purpose, setPurpose] = useState("");
  const [inventoryUntilDate, setInventoryUntilDate] = useState("");
  const [countDate, setCountDate] = useState(todayIsoDate());
  const [countTime, setCountTime] = useState("12:00");
  const [voucherNo, setVoucherNo] = useState("");
  const { mutateAsync: generateDocNumber } = useGenerateDocumentNumber();
  const [lines, setLines] = useState(() =>
    syncLineAmounts(emptyDenominationLines()),
  );
  const [participants, setParticipants] = useState<CashCountParticipant[]>(
    () => [emptyParticipant()],
  );
  const [conclusion, setConclusion] = useState("");
  const [detailTab, setDetailTab] = useState<DetailTabEnum>(
    DetailTabEnum.LINES,
  );

  const resetKey = `cc-${mode}-${initial?.id ?? "new"}`;
  useEffect(() => {
    if (!open) return;
    if (mode === CashCountDialogModeEnum.CREATE) {
      setPurpose("");
      setInventoryUntilDate(createDraft?.inventoryUntilDate ?? "");
      setCountDate(todayIsoDate());
      setCountTime("12:00");
      setVoucherNo("");
      setLines(syncLineAmounts(emptyDenominationLines()));
      setParticipants([emptyParticipant()]);
      setConclusion("");
      setDetailTab(DetailTabEnum.LINES);
      return;
    }
    if (initial) {
      setPurpose(initial.purpose ?? "");
      setInventoryUntilDate(initial.inventoryUntilDate ?? "");
      setCountDate(initial.countDate ?? todayIsoDate());
      setCountTime(initial.countTime ?? "12:00");
      setVoucherNo(initial.documentNumber ?? "");
      setLines(
        syncLineAmounts(
          initial.lines?.length ? initial.lines : emptyDenominationLines(),
        ),
      );
      setParticipants(
        initial.participants?.length
          ? [...initial.participants]
          : [emptyParticipant()],
      );
      setConclusion(initial.conclusion ?? "");
      setDetailTab(DetailTabEnum.LINES);
    }
  }, [resetKey, open, mode, initial, createDraft]);

  const reference = initial?.reference ?? "";
  const [confirmProcess, setConfirmProcess] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const bookBalance = useMemo(
    () =>
      initial?.bookBalance ||
      mockBookBalanceForDate(
        inventoryUntilDate || createDraft?.inventoryUntilDate || "",
      ),
    [initial?.bookBalance, inventoryUntilDate, createDraft?.inventoryUntilDate],
  );

  const { actualAmount, variance } = useMemo(
    () => computeTotals(lines, bookBalance),
    [lines, bookBalance],
  );

  const documentNumber = initial?.documentNumber || voucherNo || "";

  useEffect(() => {
    if (!open || mode !== CashCountDialogModeEnum.CREATE) return;
    let cancelled = false;
    void generateDocNumber({ documentType: DocumentType.CASH_COUNT })
      .then((no) => {
        if (!cancelled) setVoucherNo(no);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Không sinh được số phiếu KK. Vui lòng thử lại.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, mode, generateDocNumber]);

  const handleLineChange = useCallback(
    (index: number, patch: { quantity?: number; description?: string }) => {
      setLines((prev) =>
        syncLineAmounts(
          prev.map((l, i) => (i === index ? { ...l, ...patch } : l)),
        ),
      );
    },
    [],
  );

  const handleParticipantChange = useCallback(
    (index: number, patch: Partial<CashCountParticipant>) => {
      setParticipants((prev) =>
        prev.map((p, i) => (i === index ? { ...p, ...patch } : p)),
      );
    },
    [],
  );

  const participantColumns = useCashCountParticipantColumns(
    isLocked,
    handleParticipantChange,
  );

  const buildPayload = useCallback((): Omit<
    CashCountRecord,
    "id" | "documentNumber"
  > & {
    id?: string;
    documentNumber?: string;
  } => {
    const synced = syncLineAmounts(lines);
    const totals = computeTotals(synced, bookBalance);
    return {
      id: initial?.id,
      documentNumber: initial?.documentNumber || voucherNo || undefined,
      countDate,
      inventoryUntilDate,
      countTime,
      purpose,
      reference,
      status: initial?.status ?? CashCountStatusEnum.UNPROCESSED,
      lines: synced,
      participants,
      bookBalance,
      conclusion,
      ...totals,
    };
  }, [
    lines,
    bookBalance,
    countDate,
    inventoryUntilDate,
    countTime,
    purpose,
    reference,
    initial,
    participants,
    conclusion,
    voucherNo,
  ]);

  const handleSave = useCallback(() => {
    if (!inventoryUntilDate) {
      toast.error("Vui lòng chọn kiểm kê đến ngày.");
      return;
    }
    if (!countDate) {
      toast.error("Ngày kiểm kê là bắt buộc.");
      return;
    }
    if (!countTime) {
      toast.error("Giờ kiểm kê là bắt buộc.");
      return;
    }
    const payload = buildPayload();
    onSaved(payload as CashCountRecord);
    toast.success("Đã lưu phiếu kiểm kê.");
  }, [buildPayload, inventoryUntilDate, countDate, countTime, onSaved]);

  const toolbarItems: ToolbarItem[] = useMemo(() => {
    if (isProcessed) return [];

    const items: ToolbarItem[] = [];

    if (isView && initial?.id) {
      items.push({
        id: "edit",
        label: "Sửa",
        icon: Pencil,
        onClick: () => onRequestEdit?.(),
      });
    }

    if (!isView) {
      items.push({
        id: "save",
        label: "Lưu",
        icon: Save,
        onClick: handleSave,
      });
    }

    if (initial?.id) {
      items.push({
        id: "delete",
        label: "Xóa",
        icon: Trash2,
        variant: "danger",
        onClick: () => setConfirmDelete(true),
      });
    }

    items.push({
      id: "close",
      label: "Đóng",
      icon: X,
      onClick: () => onOpenChange(false),
    });
    return items;
  }, [
    isProcessed,
    isView,
    initial,
    handleSave,
    onOpenChange,
    onRequestCreate,
    onRequestEdit,
  ]);

  const title = isCreate
    ? "Thêm mới kiểm kê tiền mặt"
    : isView
      ? `Kiểm kê tiền mặt ${documentNumber}`
      : `Sửa kiểm kê tiền mặt`;

  const canProcess =
    !!initial?.id &&
    initial.status === CashCountStatusEnum.UNPROCESSED &&
    !isCreate;

  return (
    <>
      <DocumentFormDialog
        open={open}
        onOpenChange={onOpenChange}
        title={title}
        toolbarItems={toolbarItems}
        defaultWidth={1180}
        defaultHeight={760}
        generalInfo={
          <>
            <FormField
              label="Mục đích"
              layout="horizontal"
              labelWidth={VOUCHER_FORM_LABEL_WIDTH}
            >
              <Input
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                disabled={isLocked}
                className={`h-8 ${isLocked ? READONLY_INPUT_CLASS : ""}`}
              />
            </FormField>
            <FormField
              label="Kiểm kê đến ngày"
              layout="horizontal"
              labelWidth={VOUCHER_FORM_LABEL_WIDTH}
            >
              <Input
                type="date"
                value={inventoryUntilDate}
                onChange={(e) => setInventoryUntilDate(e.target.value)}
                disabled={isLocked || isCreate}
                readOnly={isCreate}
                className={`h-8 ${
                  isLocked || isCreate ? READONLY_INPUT_CLASS : ""
                }`}
              />
            </FormField>
            {reference ? (
              <FormField
                label="Tham chiếu"
                layout="horizontal"
                labelWidth={VOUCHER_FORM_LABEL_WIDTH}
              >
                <span className="flex h-8 items-center text-sm">
                  {reference}
                </span>
              </FormField>
            ) : null}
            <FormField
              label="Tài liệu đính kèm"
              layout="horizontal"
              labelWidth={VOUCHER_FORM_LABEL_WIDTH}
            >
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isLocked}
                onClick={() => toast.info("Tải tệp chưa được hỗ trợ.")}
              >
                <CloudUpload className="mr-1 h-4 w-4" />
                Tải tệp...
              </Button>
            </FormField>
          </>
        }
        documentInfo={
          <>
            <FormField
              label="Số phiếu KK"
              layout="horizontal"
              labelWidth={DOCUMENT_LABEL_WIDTH}
            >
              <Input
                value={documentNumber}
                disabled
                className={`h-8 font-mono ${READONLY_INPUT_CLASS}`}
              />
            </FormField>
            <FormField
              label="Ngày kiểm kê"
              required
              layout="horizontal"
              labelWidth={DOCUMENT_LABEL_WIDTH}
            >
              <Input
                type="date"
                value={countDate}
                onChange={(e) => setCountDate(e.target.value)}
                disabled={isLocked}
                className={`h-8 ${isLocked ? READONLY_INPUT_CLASS : ""}`}
              />
            </FormField>
            <FormField
              label="Giờ kiểm kê"
              required
              layout="horizontal"
              labelWidth={DOCUMENT_LABEL_WIDTH}
            >
              <Input
                type="time"
                value={countTime}
                onChange={(e) => setCountTime(e.target.value)}
                disabled={isLocked}
                className={`h-8 ${isLocked ? READONLY_INPUT_CLASS : ""}`}
              />
            </FormField>
          </>
        }
        detail={
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Tabs
              tabs={DETAIL_TABS}
              activeTab={detailTab}
              onTabChange={setDetailTab}
              className="mb-2 shrink-0"
            />
            {detailTab === DetailTabEnum.LINES ? (
              <CashCountDenominationTable
                lines={lines}
                readOnly={isLocked}
                onChangeLine={isLocked ? undefined : handleLineChange}
              />
            ) : (
              <LineItemGrid
                className="min-h-0 flex-1"
                columns={participantColumns}
                rows={participants}
                showAddRow={!isLocked}
                showRowActions={!isLocked}
                onAddRow={() =>
                  setParticipants((prev) => [...prev, emptyParticipant()])
                }
                onDeleteRow={(idx) =>
                  setParticipants((prev) =>
                    prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev,
                  )
                }
                emptyText="Nhập vào họ tên"
              />
            )}

            <div className="mt-3 grid shrink-0 grid-cols-1 gap-4 border-t bg-muted/10 px-2 py-3 lg:grid-cols-2">
              <div className="space-y-1 text-sm">
                <FormField
                  label="I. Số kiểm kê thực tế"
                  layout="horizontal"
                  labelWidth={SUMMARY_LABEL_WIDTH}
                >
                  <Input
                    value={formatMoneyInteger(actualAmount)}
                    disabled
                    className={`h-8 ${READONLY_INPUT_CLASS}`}
                  />
                </FormField>
                <FormField
                  label="II. Số dư theo quỹ tiền mặt"
                  layout="horizontal"
                  labelWidth={SUMMARY_LABEL_WIDTH}
                >
                  <Input
                    value={formatMoneyInteger(bookBalance)}
                    disabled
                    className={`h-8 ${READONLY_INPUT_CLASS}`}
                  />
                </FormField>
                <FormField
                  label="III. Chênh lệch (I-II)"
                  layout="horizontal"
                  labelWidth={SUMMARY_LABEL_WIDTH}
                >
                  <Input
                    value={formatMoneyInteger(variance)}
                    disabled
                    className={`h-8 ${READONLY_INPUT_CLASS}`}
                  />
                </FormField>
              </div>
              <FormField label="Kết luận">
                <Textarea
                  rows={4}
                  value={conclusion}
                  onChange={(e) => setConclusion(e.target.value)}
                  disabled={isLocked}
                  placeholder="Nhập kết luận sau khi kiểm kê…"
                  className="min-h-[5.5rem]"
                />
              </FormField>
            </div>

            {canProcess ? (
              <div className="flex shrink-0 items-center justify-between gap-4 border-t px-2 py-3">
                <p className="text-xs text-muted-foreground">
                  Bấm &apos;Xử lý&apos; phần mềm sẽ tự động sinh phiếu thu/chi
                  tương ứng với số tiền chênh lệch thừa/thiếu sau kiểm kê.
                </p>
                <Button type="button" onClick={() => setConfirmProcess(true)}>
                  <Settings2 className="mr-1 h-4 w-4" />
                  Xử lý
                </Button>
              </div>
            ) : null}
          </div>
        }
      />

      {confirmProcess && initial?.id ? (
        <ConfirmActionModal
          title="Xử lý phiếu kiểm kê"
          message={`Xác nhận xử lý ${initial.documentNumber}? Hệ thống sẽ ghi nhận trạng thái Đã xử lý.`}
          confirmLabel="Xử lý"
          cancelLabel="Quay lại"
          onCancel={() => setConfirmProcess(false)}
          onConfirm={() => {
            onProcess(initial.id);
            setConfirmProcess(false);
            toast.success(
              "Đã xử lý — phiếu thu/chi sẽ được sinh khi tích hợp API.",
            );
            onOpenChange(false);
          }}
        />
      ) : null}

      {confirmDelete && initial?.id ? (
        <ConfirmActionModal
          title="Xóa phiếu kiểm kê"
          message={`Xác nhận xóa ${initial.documentNumber}?`}
          confirmLabel="Xóa"
          cancelLabel="Quay lại"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            onDelete?.(initial.id);
            setConfirmDelete(false);
            onOpenChange(false);
          }}
        />
      ) : null}
    </>
  );
}
