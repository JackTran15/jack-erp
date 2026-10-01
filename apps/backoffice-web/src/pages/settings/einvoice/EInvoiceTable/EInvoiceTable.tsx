import { useMemo } from "react";
import { Eye, Pencil, Send } from "lucide-react";
import { BaseDataTable, type TableColumn } from "../../../../components/table/BaseDataTable";
import type { useColumnFilters } from "../../../../components/table/useColumnFilters";
import {
  RowSelectCheckbox,
  SelectAllCheckbox,
} from "../../../../components/document/RowSelectCheckbox";
import {
  useEInvoiceActions,
  useEInvoiceStore,
} from "../../../../store/page-stores/einvoice/einvoice.store";
import { buildEInvoiceColumns } from "../_lib/build-einvoice-columns";
import { ISSUED_COLUMNS, UNISSUED_COLUMNS } from "../_lib/einvoice-columns";
import type { EInvoiceRecord, EInvoiceTab } from "../_lib/einvoice.interface";
import { notifyNotSupported } from "../_lib/useEInvoiceMutations";

interface Props {
  tab: EInvoiceTab;
  rows: EInvoiceRecord[];
  totalAmount: number;
  loading: boolean;
  columnFilterControl: ReturnType<typeof useColumnFilters>["control"];
}

const ICON_BUTTON =
  "inline-flex h-7 w-7 items-center justify-center rounded hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-blue/40 disabled:opacity-50";

/**
 * Lưới của cả 2 tab: tick chọn, lọc cột, dòng Tổng. Tab "chưa phát hành" có thêm
 * cột hành động Sửa / Phát hành / Xem ở cuối (cuộn theo bảng như ảnh chụp).
 */
export function EInvoiceTable({ tab, rows, totalAmount, loading, columnFilterControl }: Props) {
  const checkedIds = useEInvoiceStore((s) => s.checkedIds);
  const { toggleChecked, setCheckedIds, setEditingId, setDetailId } = useEInvoiceActions();

  const columns = useMemo<TableColumn<EInvoiceRecord>[]>(() => {
    const unissued = tab === "unissued";
    const base = buildEInvoiceColumns(unissued ? UNISSUED_COLUMNS : ISSUED_COLUMNS, {
      totalAmount,
      onOpenDetail: (row) => setDetailId(row.id),
    });
    if (!unissued) return base;

    const actions: TableColumn<EInvoiceRecord> = {
      key: "actions",
      label: "",
      width: 112,
      filterKind: "none",
      render: (row) => (
        <div className="flex items-center justify-center gap-1">
          <button
            type="button"
            aria-label="Sửa hóa đơn"
            title="Sửa hóa đơn"
            className={ICON_BUTTON}
            onClick={() => setEditingId(row.id)}
          >
            <Pencil className="h-4 w-4 text-primary-blue" />
          </button>
          <button
            type="button"
            aria-label="Phát hành hóa đơn"
            title="Phát hành hóa đơn"
            className={ICON_BUTTON}
            onClick={notifyNotSupported}
          >
            <Send className="h-4 w-4 text-primary-blue" />
          </button>
          <button
            type="button"
            aria-label="Xem hóa đơn"
            title="Xem hóa đơn"
            className={ICON_BUTTON}
            onClick={notifyNotSupported}
          >
            <Eye className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      ),
    };
    return [...base, actions];
  }, [tab, totalAmount, setDetailId, setEditingId]);

  const pageIds = rows.map((r) => r.id);
  const checkedOnPage = pageIds.filter((id) => checkedIds.includes(id));
  const allChecked = pageIds.length > 0 && checkedOnPage.length === pageIds.length;

  return (
    <BaseDataTable
      columns={columns}
      rows={rows}
      loading={loading}
      emptyLabel="Không có dữ liệu."
      getRowKey={(row) => row.id}
      isRowSelected={(row) => checkedIds.includes(row.id)}
      sortBy={tab === "unissued" ? "invoiceDate" : "issuedDate"}
      sortOrder="desc"
      leadingColumn={{
        width: 48,
        header: (
          <SelectAllCheckbox
            checked={allChecked}
            indeterminate={checkedOnPage.length > 0 && !allChecked}
            disabled={rows.length === 0}
            onToggle={() =>
              setCheckedIds(
                allChecked
                  ? checkedIds.filter((id) => !pageIds.includes(id))
                  : [...new Set([...checkedIds, ...pageIds])],
              )
            }
          />
        ),
        cell: (row) => (
          <RowSelectCheckbox
            checked={checkedIds.includes(row.id)}
            onToggle={() => toggleChecked(row.id)}
          />
        ),
      }}
      columnFilterControl={columnFilterControl}
    />
  );
}
