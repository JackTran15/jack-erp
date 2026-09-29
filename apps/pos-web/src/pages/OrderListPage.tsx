import { PosPaginationBar } from "@erp/pos/components/common/PosPaginationBar/PosPaginationBar";
import { OrderFilterBar } from "@erp/pos/components/page-components/OrderList/OrderFilterBar";
import { OrderStatusTabs } from "@erp/pos/components/page-components/OrderList/OrderStatusTabs";
import { OrderTable } from "@erp/pos/components/page-components/OrderList/OrderTable";
import { OrderToolbar } from "@erp/pos/components/page-components/OrderList/OrderToolbar";
import { ORDER_LIST_PAGE_SIZE } from "@erp/pos/constants/order-list.constant";
import { useOrderList } from "@erp/pos/hooks/page-hooks/order-list/use-order-list";

/**
 * Trang "Đơn hàng" (`/orders`) — lưới đơn giao hàng của chi nhánh. Shell:
 * tab → bộ lọc + nút thao tác → lưới 24 cột → phân trang (100/trang). Toàn bộ
 * logic ở `use-order-list`.
 */
export function OrderListPage() {
  const {
    tab,
    setTab,
    dateField,
    setDateField,
    datePreset,
    setDatePreset,
    filters,
    setFilter,
    filterOperators,
    setFilterOperator,
    rows,
    page,
    pageSize,
    total,
    totalPages,
    setPage,
    refetch,
    selectedIds,
    selectedRows,
    toggleRow,
    toggleAllRows,
    clearSelection,
  } = useOrderList();

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden px-4 py-4">
        <div className="mb-3">
          <OrderStatusTabs value={tab} onChange={setTab} />
        </div>

        {/* Một hàng: bộ lọc rồi nút thao tác; hẹp quá thì xuống dòng liền mạch. */}
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <OrderFilterBar
            dateField={dateField}
            onDateFieldChange={setDateField}
            datePreset={datePreset}
            onDatePresetChange={setDatePreset}
            label={filters.label}
            onLabelChange={(next) => setFilter("label", next)}
          />
          <OrderToolbar
            selectedRows={selectedRows}
            onActionDone={clearSelection}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
          <div className="min-h-0 flex-1">
            <OrderTable
              rows={rows}
              filters={filters}
              filterOperators={filterOperators}
              onFilterChange={setFilter}
              onFilterOperatorChange={setFilterOperator}
              selectedIds={selectedIds}
              onToggleRow={toggleRow}
              onToggleAll={toggleAllRows}
            />
          </div>

          <PosPaginationBar
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
            total={total}
            pageSizeOptions={[ORDER_LIST_PAGE_SIZE]}
            onPageChange={setPage}
            onRefresh={refetch}
          />
        </div>
      </div>
    </div>
  );
}
