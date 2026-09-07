import { useCallback, useEffect, useRef, type Ref } from "react";
import {
  PosSearchPopover,
  type PosSearchPopoverHandle,
} from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import { useFastStockTransferActions } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-actions";
import { useFastStockTransferCarriers } from "@erp/pos/hooks/page-hooks/fast-stock-transfer/use-fast-stock-transfer-carriers";
import { resolveCarrierForQuery } from "@erp/pos/lib/page-libs/fast-stock-transfer/fast-stock-transfer-carrier-resolve";
import { formatCarrierName } from "@erp/pos/lib/page-libs/fast-stock-transfer/temp-warehouse-mappers";
import type { TempWarehousePublicUser } from "@erp/shared-interfaces";
import { usePosFastStockTransferWorkflowStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-workflow.store";

export interface FastStockTransferCarrierSearchInputProps {
  disabled?: boolean;
  placeholder?: string;
  minChars?: number;
  debounceMs?: number;
  inputRef?: Ref<HTMLInputElement>;
  onAfterSelect?: () => void;
}

export function FastStockTransferCarrierSearchInput({
  disabled,
  placeholder = "Chọn người vận chuyển",
  minChars = 0,
  debounceMs = 150,
  inputRef,
  onAfterSelect,
}: FastStockTransferCarrierSearchInputProps) {
  const toolbarDraft = usePosFastStockTransferWorkflowStore(
    (s) => s.toolbarDraft,
  );
  const {
    carriersLoading,
    carrierToolbar,
    setCarrierToolbar,
    carrierSearchAdapter,
    carrierLoadMore,
    resolveCarrierCandidates,
  } = useFastStockTransferCarriers();
  const { handleToolbarDraftCarrier } = useFastStockTransferActions();
  const popoverRef = useRef<PosSearchPopoverHandle>(null);
  // Chuỗi mới nhất trong ô, đọc được sau `await`: lượt tra của Enter chạy bất
  // đồng bộ, người dùng gõ tiếp trong lúc đó thì kết quả cũ không được phép ghi đè.
  const queryRef = useRef(carrierToolbar.query);
  queryRef.current = carrierToolbar.query;

  useEffect(() => {
    setCarrierToolbar({
      query: toolbarDraft.carrier ? formatCarrierName(toolbarDraft.carrier) : "",
    });
  }, [toolbarDraft.carrier, setCarrierToolbar]);

  const selectCarrier = useCallback(
    (carrier: TempWarehousePublicUser) => {
      handleToolbarDraftCarrier(carrier);
      setCarrierToolbar({ query: formatCarrierName(carrier) });
      onAfterSelect?.();
    },
    [handleToolbarDraftCarrier, onAfterSelect, setCarrierToolbar],
  );

  /**
   * Enter khi chưa có dòng nào đang nổi: tra lại chuỗi rồi tự chọn nếu chỉ còn
   * một khả năng (xem `resolveCarrierForQuery`). Không tái dùng danh sách đang
   * hiện của popover — nó chỉ cập nhật sau debounce, nên người gõ nhanh rồi Enter
   * sẽ đọc phải kết quả của chuỗi cũ.
   */
  const handleSubmitQuery = useCallback(
    (q: string): boolean => {
      if (!q.trim()) {
        if (!toolbarDraft.carrier) return false;
        onAfterSelect?.();
        return true;
      }
      void resolveCarrierCandidates(q).then((rows) => {
        if (queryRef.current.trim() !== q) return;
        const picked = resolveCarrierForQuery(q, rows);
        if (!picked) return;
        // Đường này không đi qua `selectItem` của popover nên phải tự đóng.
        popoverRef.current?.close();
        selectCarrier(picked);
      });
      return true;
    },
    [
      onAfterSelect,
      resolveCarrierCandidates,
      selectCarrier,
      toolbarDraft.carrier,
    ],
  );

  return (
    <PosSearchPopover<TempWarehousePublicUser>
      value={carrierToolbar.query}
      onValueChange={(q) => setCarrierToolbar({ query: q })}
      search={carrierSearchAdapter}
      loadMore={carrierLoadMore}
      onSelect={selectCarrier}
      onSubmitQuery={handleSubmitQuery}
      onClear={() => {
        handleToolbarDraftCarrier(null);
        setCarrierToolbar({ query: "" });
      }}
      itemKey={(c) => c.id}
      renderItem={(c) => formatCarrierName(c)}
      // Tìm được theo mã nhân viên mà không hiện mã thì dòng khớp trông như kết
      // quả sai. Chưa có hồ sơ HR thì rơi về email.
      renderMeta={(c) => c.employeeCode ?? c.email}
      placeholder={placeholder}
      ariaLabel="Người vận chuyển"
      variant="boxed"
      disabled={disabled || carriersLoading}
      minChars={minChars}
      debounceMs={debounceMs}
      containerClassName="w-full min-w-0"
      inputRef={inputRef}
      popoverRef={popoverRef}
    />
  );
}
