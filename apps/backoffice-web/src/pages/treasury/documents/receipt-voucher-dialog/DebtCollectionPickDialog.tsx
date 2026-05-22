import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppModal,
  Button,
  DateTimeField,
  FormField,
  MoneyInput,
  cn,
  formatMoneyInteger,
} from "@erp/ui";
import { Check, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  LookupField,
  type LookupSearchResult,
} from "../../../../components/forms/LookupField";
import {
  BaseDataTable,
  type TableColumn,
} from "../../../../components/table/BaseDataTable";
import {
  LEDGER_CASH_VI_DATE,
  TABLE_NUM_CLASS,
} from "../../ledger-cash/ledger-cash.constants";
import type { LedgerCashVoucherDocumentLine } from "../../ledger-cash/ledger-cash.types";
import { VoucherEntitySearchModal } from "../_shared/VoucherEntitySearchModal";
import {
  mergePartnerSearchWithSelection,
  type VoucherMergedPartnerOption,
} from "../_shared/voucher-partner-search";
import { VoucherPartnerKindUi } from "../_shared/voucher-partner.constants";
import {
  fetchCustomerOpenDebts,
  mapInvoiceDebtsToPickRows,
} from "./debt-collection.api";
import { searchVoucherDebtCollectionParties } from "./debt-collection-search";

const PARTNER_LOOKUP_COLUMNS = [
  {
    key: "code",
    label: "Mã",
    className: "w-28",
    render: (item: VoucherMergedPartnerOption) => item.code || "—",
  },
  {
    key: "name",
    label: "Tên",
    render: (item: VoucherMergedPartnerOption) => item.name,
  },
  {
    key: "kind",
    label: "Loại",
    className: "w-36",
    render: (item: VoucherMergedPartnerOption) => item.kindLabel,
  },
  {
    key: "phone",
    label: "Điện thoại",
    className: "w-32",
    render: (item: VoucherMergedPartnerOption) => item.phone ?? "—",
  },
];

type PickRow = LedgerCashVoucherDocumentLine & { selected: boolean };

export interface DebtCollectionPickResult {
  partner: VoucherMergedPartnerOption;
  collectionDate: string;
  documentLines: LedgerCashVoucherDocumentLine[];
  totalCollect: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCollectionDate: string;
  initialPartner?: VoucherMergedPartnerOption | null;
  onConfirm: (result: DebtCollectionPickResult) => void;
}

function sumCollect(rows: PickRow[]): number {
  return rows.reduce(
    (s, r) => (r.selected ? s + (Number(r.collectAmount) || 0) : s),
    0,
  );
}

function sumField(rows: PickRow[], key: keyof PickRow): number {
  return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
}

export function DebtCollectionPickDialog({
  open,
  onOpenChange,
  defaultCollectionDate,
  initialPartner,
  onConfirm,
}: Props) {
  const [partner, setPartner] = useState<VoucherMergedPartnerOption | null>(
    null,
  );
  const [partnerCode, setPartnerCode] = useState("");
  const [collectionDate, setCollectionDate] = useState(defaultCollectionDate);
  const [rows, setRows] = useState<PickRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [partnerSearchOpen, setPartnerSearchOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPartner(initialPartner ?? null);
    setPartnerCode(initialPartner?.code ?? "");
    setCollectionDate(defaultCollectionDate);
    setRows([]);
  }, [open, defaultCollectionDate, initialPartner]);

  const selectedPartner = partner;

  const searchParties = useCallback(
    async (query: string, page: number, pageSize?: number) => {
      const raw = await searchVoucherDebtCollectionParties(
        query,
        page,
        pageSize ?? 8,
      );
      return mergePartnerSearchWithSelection(
        raw as LookupSearchResult<VoucherMergedPartnerOption>,
        selectedPartner,
        page,
      );
    },
    [selectedPartner],
  );

  const totalCollect = useMemo(() => sumCollect(rows), [rows]);

  const loadDebts = useCallback(async () => {
    if (!partner) {
      toast.error("Vui lòng chọn đối tượng thu nợ.");
      return;
    }
    if (partner.kind !== VoucherPartnerKindUi.CUSTOMER) {
      toast.message(
        "Đối tác giao hàng chưa có API công nợ mở — hiện chỉ tải được hóa đơn nợ của khách hàng.",
      );
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const debts = await fetchCustomerOpenDebts(partner.id);
      const mapped = mapInvoiceDebtsToPickRows(debts);
      setRows(
        mapped.map((line) => ({
          ...line,
          selected: false,
          collectAmount: line.remainingAmount,
        })),
      );
      if (mapped.length === 0) {
        toast.message("Không có hóa đơn nợ mở cho đối tượng này.");
      }
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Không tải được danh sách công nợ.";
      toast.error(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [partner]);

  const updateRow = useCallback(
    (documentNo: string, patch: Partial<PickRow>) => {
      setRows((prev) =>
        prev.map((r) => (r.documentNo === documentNo ? { ...r, ...patch } : r)),
      );
    },
    [],
  );

  const allSelected = rows.length > 0 && rows.every((r) => r.selected);

  const toggleAll = useCallback(() => {
    const next = !allSelected;
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        selected: next,
        collectAmount: next
          ? r.collectAmount > 0
            ? r.collectAmount
            : r.remainingAmount
          : 0,
      })),
    );
  }, [allSelected]);

  const columns: TableColumn<PickRow>[] = useMemo(
    () => [
      {
        key: "documentDate",
        label: "Ngày chứng từ",
        width: 110,
        render: (r) =>
          r.documentDate.toLocaleDateString("vi-VN", LEDGER_CASH_VI_DATE),
      },
      {
        key: "documentNo",
        label: "Số chứng từ",
        width: 130,
        render: (r) => r.documentNo,
      },
      {
        key: "debtAmount",
        label: "Số nợ",
        width: 120,
        headerClassName: "text-right",
        className: TABLE_NUM_CLASS,
        render: (r) => formatMoneyInteger(r.debtAmount),
      },
      {
        key: "collectedAmount",
        label: "Số đã thu",
        width: 110,
        headerClassName: "text-right",
        className: TABLE_NUM_CLASS,
        render: (r) => formatMoneyInteger(r.collectedAmount),
      },
      {
        key: "remainingAmount",
        label: "Số còn phải thu",
        width: 130,
        headerClassName: "text-right",
        className: TABLE_NUM_CLASS,
        render: (r) => formatMoneyInteger(r.remainingAmount),
      },
      {
        key: "collectAmount",
        label: "Số thu",
        width: 130,
        headerClassName: "text-right",
        className: TABLE_NUM_CLASS,
        render: (r) => (
          <MoneyInput
            value={r.collectAmount}
            disabled={!r.selected}
            className="h-8 text-right"
            onChange={(v) => {
              const amount = v === "" ? 0 : Number(v);
              updateRow(r.documentNo, { collectAmount: amount });
            }}
          />
        ),
      },
    ],
    [updateRow],
  );

  const columnsWithFooter = useMemo(
    () =>
      columns.map((col) => {
        if (col.key === "documentDate") {
          return {
            ...col,
            footer: <span className="font-semibold">Tổng</span>,
          };
        }
        if (col.key === "debtAmount") {
          return {
            ...col,
            footer: (
              <span className={cn("font-semibold", TABLE_NUM_CLASS)}>
                {formatMoneyInteger(sumField(rows, "debtAmount"))}
              </span>
            ),
          };
        }
        if (col.key === "collectedAmount") {
          return {
            ...col,
            footer: (
              <span className={cn("font-semibold", TABLE_NUM_CLASS)}>
                {formatMoneyInteger(sumField(rows, "collectedAmount"))}
              </span>
            ),
          };
        }
        if (col.key === "remainingAmount") {
          return {
            ...col,
            footer: (
              <span className={cn("font-semibold", TABLE_NUM_CLASS)}>
                {formatMoneyInteger(sumField(rows, "remainingAmount"))}
              </span>
            ),
          };
        }
        if (col.key === "collectAmount") {
          return {
            ...col,
            footer: (
              <span className={cn("font-semibold", TABLE_NUM_CLASS)}>
                {formatMoneyInteger(totalCollect)}
              </span>
            ),
          };
        }
        return col;
      }),
    [columns, rows, totalCollect],
  );

  const handleConfirm = useCallback(() => {
    if (!partner) {
      toast.error("Vui lòng chọn đối tượng thu nợ.");
      return;
    }
    const picked = rows.filter(
      (r) => r.selected && Number(r.collectAmount) > 0,
    );
    if (picked.length === 0) {
      toast.error("Vui lòng chọn ít nhất một hóa đơn và nhập số thu.");
      return;
    }
    for (const r of picked) {
      if (r.collectAmount > r.remainingAmount) {
        toast.error(
          `Số thu (${r.documentNo}) không được lớn hơn số còn phải thu.`,
        );
        return;
      }
    }
    const documentLines: LedgerCashVoucherDocumentLine[] = picked.map(
      ({ selected: _s, ...line }) => line,
    );
    const total = sumCollect(picked);
    onConfirm({
      partner,
      collectionDate,
      documentLines,
      totalCollect: total,
    });
    onOpenChange(false);
  }, [partner, rows, collectionDate, onConfirm, onOpenChange]);

  if (!open) return null;

  return (
    <AppModal
      open
      onOpenChange={onOpenChange}
      title="Chọn hóa đơn thu nợ"
      defaultWidth={960}
      defaultHeight={560}
      minWidth={720}
      minHeight={420}
      bodyClassName="flex min-h-0 flex-col gap-3 overflow-hidden p-4"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            <X className="mr-1 h-4 w-4" />
            Hủy bỏ
          </Button>
          <Button type="button" onClick={handleConfirm}>
            <Check className="mr-1 h-4 w-4" />
            Thu nợ
          </Button>
        </div>
      }
    >
      <div className="grid shrink-0 grid-cols-[1fr_auto_auto] items-end gap-3">
        <FormField label="Thu nợ từ" layout="horizontal" labelWidth="8rem">
          <LookupField
            value={partnerCode}
            onValueChange={(code) => {
              setPartnerCode(code);
              if (!code.trim()) setPartner(null);
            }}
            onSelect={(item) => {
              setPartner(item);
              setPartnerCode(item.code);
            }}
            search={searchParties}
            itemKey={(item) => item.lookupKey}
            renderItem={(item) => item.name}
            columns={PARTNER_LOOKUP_COLUMNS}
            placeholder="Chọn khách hàng hoặc đối tác giao hàng"
            portalToBody
            dropdownMinWidth={520}
            onSearchButtonClick={() => setPartnerSearchOpen(true)}
          />
        </FormField>
        <FormField label="Ngày thu nợ" layout="horizontal" labelWidth="8rem">
          <DateTimeField
            value={collectionDate}
            onChange={(e) => setCollectionDate(e.target.value)}
            includeTime={false}
          />
        </FormField>
        <Button
          type="button"
          variant="outline"
          className="mb-0.5 shrink-0"
          onClick={() => void loadDebts()}
          disabled={loading}
        >
          <Search className="mr-1 h-4 w-4" />
          Lấy dữ liệu
        </Button>
        <FormField label="Số thu" layout="horizontal" labelWidth="8rem">
          <MoneyInput
            value={totalCollect}
            onChange={() => {}}
            disabled
            className="bg-muted"
          />
        </FormField>
      </div>

      <BaseDataTable
        className="min-h-0 flex-1"
        columns={columnsWithFooter}
        rows={rows}
        loading={loading}
        emptyLabel="Chưa có dữ liệu — chọn đối tượng và bấm Lấy dữ liệu."
        getRowKey={(r) => r.debtId ?? r.documentNo}
        leadingColumn={{
          width: 40,
          header: (
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Chọn tất cả"
            />
          ),
          cell: (r) => (
            <input
              type="checkbox"
              checked={r.selected}
              onChange={(e) => {
                const checked = e.target.checked;
                updateRow(r.documentNo, {
                  selected: checked,
                  collectAmount: checked
                    ? r.collectAmount > 0
                      ? r.collectAmount
                      : r.remainingAmount
                    : 0,
                });
              }}
              aria-label={`Chọn ${r.documentNo}`}
            />
          ),
        }}
      />
      {partnerSearchOpen ? (
        <VoucherEntitySearchModal
          open
          target="debtCollection"
          onOpenChange={setPartnerSearchOpen}
          onSelectPartner={(item) => {
            setPartner(item);
            setPartnerCode(item.code);
          }}
        />
      ) : null}
    </AppModal>
  );
}
