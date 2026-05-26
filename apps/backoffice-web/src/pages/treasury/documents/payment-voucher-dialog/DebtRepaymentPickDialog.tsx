import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import type { VoucherPartnerOption } from "../_shared/voucher-partner-search";
import {
  useSupplierOpenDebts,
  mapSupplierDebtsToPickRows,
} from "./supplier-debt.api";
import { useSupplierDebtSearch } from "./supplier-debt-search";

const PARTNER_LOOKUP_COLUMNS = [
  {
    key: "code",
    label: "Mã",
    className: "w-32",
    render: (item: VoucherPartnerOption) => item.code,
  },
  {
    key: "name",
    label: "Tên",
    className: "flex-1 min-w-[120px]",
    render: (item: VoucherPartnerOption) => item.name,
  },
  {
    key: "kindLabel",
    label: "Loại",
    className: "w-32",
    render: (item: VoucherPartnerOption) => item.kindLabel,
  },
  {
    key: "phone",
    label: "Điện thoại",
    className: "w-32",
    render: (item: VoucherPartnerOption) => item.phone ?? "—",
  },
];

type PickRow = LedgerCashVoucherDocumentLine & { selected: boolean };

export interface DebtRepaymentPickResult {
  partner: VoucherPartnerOption;
  repaymentDate: string;
  documentLines: LedgerCashVoucherDocumentLine[];
  totalRepay: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultRepaymentDate: string;
  initialPartner?: VoucherPartnerOption | null;
  onConfirm: (result: DebtRepaymentPickResult) => void;
}

function sumRepay(rows: PickRow[]): number {
  return rows.reduce(
    (s, r) => (r.selected ? s + (Number(r.collectAmount) || 0) : s),
    0,
  );
}

function sumField(rows: PickRow[], key: keyof PickRow): number {
  return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
}

export function DebtRepaymentPickDialog({
  open,
  onOpenChange,
  defaultRepaymentDate,
  initialPartner,
  onConfirm,
}: Props) {
  const searchSuppliersWithDebt = useSupplierDebtSearch();
  const fetchSupplierDebts = useSupplierOpenDebts();
  const [partner, setPartner] = useState<VoucherPartnerOption | null>(null);
  const [partnerCode, setPartnerCode] = useState("");
  const [repaymentDate, setRepaymentDate] = useState(defaultRepaymentDate);
  const [rows, setRows] = useState<PickRow[]>([]);
  const [loading, setLoading] = useState(false);

  const prevPartnerId = useRef(partner?.id);
  useEffect(() => {
    if (partner?.id !== prevPartnerId.current) {
      prevPartnerId.current = partner?.id;
      setRows([]);
    }
  }, [partner?.id]);

  useEffect(() => {
    if (open && initialPartner && !partner) {
      setPartner(initialPartner);
      setPartnerCode(initialPartner.code);
    }
  }, [open, initialPartner, partner]);

  const searchSuppliers = useCallback(
    async (query: string, page: number, pageSize?: number) =>
      searchSuppliersWithDebt(query, page, pageSize),
    [searchSuppliersWithDebt],
  );

  const loadDebts = useCallback(async () => {
    if (!partner) {
      toast.error("Vui lòng chọn nhà cung cấp.");
      return;
    }
    setLoading(true);
    try {
      const debts = await fetchSupplierDebts(partner.id);
      const docLines = mapSupplierDebtsToPickRows(debts);
      setRows(docLines.map((d) => ({ ...d, selected: true })));
      if (docLines.length === 0) {
        toast.info("Nhà cung cấp không có nợ mở.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi tải công nợ NCC.");
    } finally {
      setLoading(false);
    }
  }, [partner, fetchSupplierDebts]);

  const updateRow = useCallback(
    (documentNo: string, patch: Partial<PickRow>) => {
      setRows((prev) =>
        prev.map((r) =>
          r.documentNo === documentNo ? { ...r, ...patch } : r,
        ),
      );
    },
    [],
  );

  const totalRepay = useMemo(() => sumRepay(rows), [rows]);

  const columns: TableColumn<PickRow>[] = useMemo(
    () => [
      {
        key: "documentDate",
        label: "Ngày chứng từ",
        width: 110,
        render: (r) =>
          r.documentDate
            ? new Date(r.documentDate).toLocaleDateString(
                "vi-VN",
                LEDGER_CASH_VI_DATE,
              )
            : "",
      },
      {
        key: "documentNo",
        label: "Số chứng từ",
        width: 140,
        render: (r) => (
          <span className="font-medium text-primary">{r.documentNo}</span>
        ),
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
        label: "Số đã trả",
        width: 110,
        headerClassName: "text-right",
        className: TABLE_NUM_CLASS,
        render: (r) => formatMoneyInteger(r.collectedAmount),
      },
      {
        key: "remainingAmount",
        label: "Số còn phải trả",
        width: 130,
        headerClassName: "text-right",
        className: TABLE_NUM_CLASS,
        render: (r) => formatMoneyInteger(r.remainingAmount),
      },
      {
        key: "collectAmount",
        label: "Số trả",
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
                {formatMoneyInteger(totalRepay)}
              </span>
            ),
          };
        }
        return col;
      }),
    [columns, rows, totalRepay],
  );

  const handleConfirm = useCallback(() => {
    if (!partner) {
      toast.error("Vui lòng chọn nhà cung cấp.");
      return;
    }
    const picked = rows.filter(
      (r) => r.selected && Number(r.collectAmount) > 0,
    );
    if (picked.length === 0) {
      toast.error("Vui lòng chọn ít nhất một hóa đơn và nhập số trả.");
      return;
    }
    for (const r of picked) {
      if (r.collectAmount > r.remainingAmount) {
        toast.error(
          `Số trả (${r.documentNo}) không được lớn hơn số còn phải trả.`,
        );
        return;
      }
    }
    const documentLines: LedgerCashVoucherDocumentLine[] = picked.map(
      ({ selected: _s, ...line }) => line,
    );
    onConfirm({
      partner,
      repaymentDate,
      documentLines,
      totalRepay: sumRepay(picked),
    });
    onOpenChange(false);
  }, [partner, rows, repaymentDate, onConfirm, onOpenChange]);

  if (!open) return null;

  return (
    <AppModal
      open
      onOpenChange={onOpenChange}
      title="Chọn hóa đơn trả nợ"
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
            Trả nợ
          </Button>
        </div>
      }
    >
      <div className="grid shrink-0 grid-cols-[1fr_auto_auto] items-end gap-3">
        <FormField label="Trả nợ cho" layout="horizontal" labelWidth="8rem">
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
            search={searchSuppliers}
            itemKey={(item) => item.lookupKey}
            renderItem={(item) => item.name}
            columns={PARTNER_LOOKUP_COLUMNS}
            placeholder="Chọn nhà cung cấp"
            portalToBody
            dropdownMinWidth={520}
          />
        </FormField>
        <FormField label="Ngày trả nợ" layout="horizontal" labelWidth="8rem">
          <DateTimeField
            value={repaymentDate}
            onChange={(e) => setRepaymentDate(e.target.value)}
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
        <FormField label="Số trả" layout="horizontal" labelWidth="8rem">
          <MoneyInput
            value={totalRepay}
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
        emptyLabel="Chọn nhà cung cấp và bấm Lấy dữ liệu."
        getRowKey={(r) => r.debtId ?? r.documentNo}
        leadingColumn={{
          width: 40,
          header: (
            <input
              type="checkbox"
              checked={rows.length > 0 && rows.every((r) => r.selected)}
              onChange={(e) =>
                setRows((prev) =>
                  prev.map((r) => ({ ...r, selected: e.target.checked })),
                )
              }
            />
          ),
          cell: (row) => (
            <input
              type="checkbox"
              checked={row.selected}
              onChange={(e) =>
                updateRow(row.documentNo, { selected: e.target.checked })
              }
            />
          ),
        }}
      />
    </AppModal>
  );
}
