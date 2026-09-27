import { PosPaginationBar } from "@erp/pos/components/common/PosPaginationBar/PosPaginationBar";
import { OnlineOrderChannelSidebar } from "@erp/pos/components/page-components/OnlineOrderList/OnlineOrderChannelSidebar";
import { OnlineOrderFilterBar } from "@erp/pos/components/page-components/OnlineOrderList/OnlineOrderFilterBar";
import { OnlineOrderTable } from "@erp/pos/components/page-components/OnlineOrderList/OnlineOrderTable";
import { useOnlineOrderList } from "@erp/pos/hooks/page-hooks/online-order-list/use-online-order-list";

/**
 * Trang "Đơn hàng Online" (`/online-orders`). Shell: sidebar kênh → thanh lọc
 * → lưới → phân trang. Toàn bộ logic ở `use-online-order-list`. Ô tick + nút
 * "Nhận xử lý" chỉ dùng được khi có quyền `pos.sales-order.approve`.
 */
export function OnlineOrderListPage() {
  const {
    channels,
    channelsLoading,
    selectedChannelId,
    selectChannel,
    datePreset,
    setDatePreset,
    selectedDate,
    setSelectedDate,
    status,
    setStatus,
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
    setPageSize,
    refetch,
    selectedIds,
    toggleRow,
    toggleAllRows,
    canProcess,
    processEnabled,
    processSelected,
  } = useOnlineOrderList();

  return (
    <div className="flex min-h-0 flex-1 bg-white">
      <OnlineOrderChannelSidebar
        channels={channels}
        selectedChannelId={selectedChannelId}
        loading={channelsLoading}
        onSelect={selectChannel}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden px-4 py-4">
        <div className="mb-3">
          <OnlineOrderFilterBar
            datePreset={datePreset}
            onDatePresetChange={setDatePreset}
            selectedDate={selectedDate}
            onSelectedDateChange={setSelectedDate}
            status={status}
            onStatusChange={setStatus}
            showProcess={canProcess}
            processDisabled={!processEnabled}
            onProcess={processSelected}
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
          <div className="min-h-0 flex-1">
            <OnlineOrderTable
              rows={rows}
              filters={filters}
              filterOperators={filterOperators}
              onFilterChange={setFilter}
              onFilterOperatorChange={setFilterOperator}
              selectedIds={selectedIds}
              selectionDisabled={!canProcess}
              onToggleRow={toggleRow}
              onToggleAll={toggleAllRows}
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
    </div>
  );
}
