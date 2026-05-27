import { PosPaginationBar } from "@erp/pos/components/common/PosPaginationBar/PosPaginationBar";
import { InvoiceListFilterBar } from "@erp/pos/components/page-components/InvoiceList/InvoiceListFilterBar/InvoiceListFilterBar";
import { InvoiceListTable } from "@erp/pos/components/page-components/InvoiceList/InvoiceListTable/InvoiceListTable";
import { InvoiceColumnSettingsDialog } from "@erp/pos/components/page-components/InvoiceList/InvoiceColumnSettingsDialog/InvoiceColumnSettingsDialog";
import { InvoiceReceiptDialog } from "@erp/pos/components/page-components/Checkout/CheckoutDialogs/CustomerDetailDialog/PurchaseHistoryTab/InvoiceReceiptDialog/InvoiceReceiptDialog";
import { useInvoiceList } from "@erp/pos/hooks/page-hooks/invoice-list/use-invoice-list";

/**
 * Trang "Danh sách hóa đơn" (`/invoices`). Shell: filter bar → bảng → phân
 * trang; dialog thiết lập cột + biên lai chi tiết. Toàn bộ logic ở
 * `use-invoice-list`. Header app-shell do `PosLayout` cấp.
 */
export function InvoiceListPage() {
  const {
    dateType,
    setDateType,
    dateRange,
    setDateRange,
    filters,
    setFilter,
    visibleColumns,
    columnSettingsOpen,
    openColumnSettings,
    closeColumnSettings,
    applyVisibleColumns,
    rows,
    grandTotal,
    page,
    pageSize,
    total,
    totalPages,
    setPage,
    setPageSize,
    refetch,
    selectedInvoice,
    openInvoice,
    closeInvoice,
  } = useInvoiceList();

  return (
    <div className="flex h-screen flex-col bg-white">
      <div className="flex flex-1 flex-col overflow-hidden px-4 py-4">
        <div className="mb-3">
          <InvoiceListFilterBar
            dateType={dateType}
            onDateTypeChange={setDateType}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            onOpenColumnSettings={openColumnSettings}
          />
        </div>

        <div className="flex flex-1 min-h-0 flex-col overflow-hidden bg-white">
          <div className="min-h-0 flex-1">
            <InvoiceListTable
              rows={rows}
              filters={filters}
              visibleColumns={visibleColumns}
              grandTotal={grandTotal}
              onFilterChange={setFilter}
              onOpenInvoice={openInvoice}
            />
          </div>

          <PosPaginationBar
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onRefresh={refetch}
          />
        </div>
      </div>

      <InvoiceColumnSettingsDialog
        open={columnSettingsOpen}
        visibleColumns={visibleColumns}
        onApply={applyVisibleColumns}
        onClose={closeColumnSettings}
      />

      <InvoiceReceiptDialog
        open={Boolean(selectedInvoice)}
        invoiceId={selectedInvoice?.id ?? null}
        customerName={selectedInvoice?.customerName || undefined}
        customerPhone={selectedInvoice?.customerPhone || undefined}
        onClose={closeInvoice}
      />
    </div>
  );
}
