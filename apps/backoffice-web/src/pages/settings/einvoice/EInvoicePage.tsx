import { useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { DocumentListShell } from "@erp/ui";
import { AdminPageShell } from "../../../components/layout/AdminPageShell";
import { Tabs } from "../../../components/tabs/Tabs";
import { useColumnFilters } from "../../../components/table/useColumnFilters";
import { EINVOICE_TABS } from "../../../store/page-stores/einvoice/einvoice.constant";
import {
  useEInvoiceActions,
  useEInvoiceStore,
} from "../../../store/page-stores/einvoice/einvoice.store";
import { InvoiceDetailDialog } from "../../treasury/documents/invoice-detail-dialog/InvoiceDetailDialog";
import { EINVOICE_MOCK_BRANCHES, findEInvoiceRecord } from "./_mock/einvoice.mock";
import { ISSUED_COLUMN_KEYS, UNISSUED_COLUMN_KEYS } from "./_lib/einvoice-columns";
import { toInvoiceDetail } from "./_lib/einvoice-detail";
import { fetchEInvoices } from "./_lib/einvoice-query";
import { EINVOICE_QUERY_KEY } from "./_lib/useEInvoiceMutations";
import { EInvoiceEditModal } from "./EInvoiceEditModal/EInvoiceEditModal";
import { EInvoicePageFilterBar } from "./EInvoicePageFilterBar/EInvoicePageFilterBar";
import { EInvoicePagePagination } from "./EInvoicePagePagination/EInvoicePagePagination";
import { EInvoiceTable } from "./EInvoiceTable/EInvoiceTable";

/**
 * "Phát hành hóa đơn điện tử" (menu Cấu hình). Backend chưa có HĐĐT nên toàn bộ
 * dữ liệu là mock (`_mock/`), đọc qua TanStack Query như API thật.
 *
 * `?branchId=` do nút "Kiểm tra" ở modal HĐĐT của trang Tổng quan gắn vào.
 */
export function EInvoicePage() {
  const tab = useEInvoiceStore((s) => s.tab);
  const applied = useEInvoiceStore((s) => s.applied);
  const page = useEInvoiceStore((s) => s.page);
  const pageSize = useEInvoiceStore((s) => s.pageSize);
  const editingId = useEInvoiceStore((s) => s.editingId);
  const detailId = useEInvoiceStore((s) => s.detailId);
  const { setTab, setPage, setEditingId, setDetailId } = useEInvoiceActions();

  const [searchParams, setSearchParams] = useSearchParams();
  const branchId = searchParams.get("branchId");
  const branchName = EINVOICE_MOCK_BRANCHES.find((b) => b.id === branchId)?.name ?? null;

  const resetPage = useCallback(() => setPage(1), [setPage]);
  // Vào từ "Kiểm tra" của chi nhánh khác → trang cũ có thể vượt quá số trang mới.
  useEffect(resetPage, [branchId, resetPage]);
  const unissuedFilters = useColumnFilters(UNISSUED_COLUMN_KEYS, { onChange: resetPage });
  const issuedFilters = useColumnFilters(ISSUED_COLUMN_KEYS, { onChange: resetPage });
  const { filters, control } = tab === "unissued" ? unissuedFilters : issuedFilters;

  const query = useQuery({
    queryKey: [EINVOICE_QUERY_KEY, tab, applied, branchId, filters, page, pageSize],
    queryFn: () =>
      fetchEInvoices({
        tab,
        from: applied.from,
        to: applied.to,
        branchId,
        columnFilters: filters,
        page,
        pageSize,
      }),
  });

  const editing = editingId ? findEInvoiceRecord(editingId) : undefined;
  const detail = detailId ? findEInvoiceRecord(detailId) : undefined;

  return (
    <AdminPageShell>
      <DocumentListShell
        tabs={<Tabs tabs={EINVOICE_TABS} activeTab={tab} onTabChange={setTab} />}
        filters={
          <EInvoicePageFilterBar
            branchName={branchName}
            onClearBranch={() => setSearchParams({}, { replace: true })}
          />
        }
        pagination={
          <EInvoicePagePagination
            total={query.data?.total ?? 0}
            onRefresh={() => void query.refetch()}
          />
        }
      >
        <EInvoiceTable
          tab={tab}
          rows={query.data?.rows ?? []}
          totalAmount={query.data?.totalAmount ?? 0}
          loading={query.isFetching}
          columnFilterControl={control}
        />
      </DocumentListShell>

      {editing ? (
        // `key` để form khởi tạo lại từ đúng hóa đơn mỗi lần mở.
        <EInvoiceEditModal key={editing.id} record={editing} onClose={() => setEditingId(null)} />
      ) : null}

      <InvoiceDetailDialog
        open={Boolean(detail)}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
        detail={detail ? toInvoiceDetail(detail) : null}
      />
    </AdminPageShell>
  );
}
