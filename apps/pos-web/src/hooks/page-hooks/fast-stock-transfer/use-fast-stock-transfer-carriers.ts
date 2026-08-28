import { useCallback, useMemo, useRef } from "react";

import type { SearchSuggestion } from "@erp/pos/components/common/PosSearchPopover/PosSearchPopover";
import {
  usePreloadTempWarehouseCarriers,
  useSearchTempWarehouseCarriers,
} from "@erp/pos/hooks/react-query/use-query-temp-warehouse";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { usePosFastStockTransferPickerStore } from "@erp/pos/stores/page-stores/fast-stock-transfer/fast-stock-transfer-picker.store";
import type { TempWarehousePublicUser } from "@erp/shared-interfaces";

type Updater<T> = T | ((prev: T) => T);

interface CarrierToolbarState {
  query: string;
}

interface UseFastStockTransferCarriersResult {
  carriersLoading: boolean;
  carrierToolbar: CarrierToolbarState;
  setCarrierToolbar: (value: Updater<CarrierToolbarState>) => void;
  carrierSearchAdapter: (
    q: string,
  ) => Promise<SearchSuggestion<TempWarehousePublicUser>[]>;
  carrierLoadMore: (
    q: string,
  ) => Promise<SearchSuggestion<TempWarehousePublicUser>[]>;
  /**
   * Tra ứng viên cho một chuỗi, phục vụ đường Enter tự chọn. Cố tình không chạm
   * `pagingRef`/`searchSeqRef`: hai ref đó thuộc về danh sách đang hiển thị của
   * popover, còn đây là một lượt tra rời.
   */
  resolveCarrierCandidates: (q: string) => Promise<TempWarehousePublicUser[]>;
  resolveCarrierById: (userId: string) => TempWarehousePublicUser | null;
}

export function useFastStockTransferCarriers(): UseFastStockTransferCarriersResult {
  const branchId = usePosBranchStore((s) => s.branchId);
  const searchCarriers = useSearchTempWarehouseCarriers();

  const { isLoading: carriersLoading } =
    usePreloadTempWarehouseCarriers(branchId);
  const carrierToolbar = usePosFastStockTransferPickerStore(
    (s) => s.carrierToolbar,
  );
  const setCarrierToolbar = usePosFastStockTransferPickerStore(
    (s) => s.setCarrierToolbar,
  );
  const upsertCarriers = usePosFastStockTransferPickerStore(
    (s) => s.upsertCarriers,
  );
  const getCarrierById = usePosFastStockTransferPickerStore(
    (s) => s.getCarrierById,
  );

  /**
   * Danh sách hiển thị là **đúng những gì server trả về cho query hiện tại**,
   * không phải cache gộp trong store.
   *
   * Bản cũ lọc lại rows của store bằng tên/email, và đó là hai lỗi cùng lúc:
   * dòng server khớp bằng **mã nhân viên** bị loại ngay vì mã không nằm trong
   * tên lẫn email, còn phân trang thì lấy nhầm cả kết quả của những lần tìm
   * trước vì store gộp mọi query. Store vẫn được upsert, nhưng chỉ để
   * `resolveCarrierById` dịch `carrierUserId` đã lưu trên line thành tên.
   */
  const fetchPage = useCallback(
    async (query: string, page: number) => {
      if (!branchId) return null;
      const result = await searchCarriers(branchId, query, page);
      upsertCarriers(result.data);
      return result;
    },
    [branchId, searchCarriers, upsertCarriers],
  );

  /**
   * Con trỏ phân trang của query đang mở: trang kế tiếp cần xin, và bao nhiêu
   * dòng đã lấy trên tổng bao nhiêu.
   *
   * Không suy số trang ra từ `loadedCount / pageSize` — cách đó chỉ đúng khi mọi
   * trang đều đầy. Trang cuối luôn ngắn, nên với chi nhánh có 45 người thì sau
   * 20+20+5 phép chia lại rơi về trang 3 và xin lại đúng 5 dòng vừa lấy, lặp cho
   * tới khi `loadedCount` vượt qua mốc chia hết cho 20. `total` từ server cho
   * biết đã hết chính xác, không cần một request rỗng để dò.
   */
  const pagingRef = useRef({ query: "", nextPage: 2, fetched: 0, total: 0 });
  /**
   * Số thứ tự lượt tra của riêng hook này.
   *
   * `PosSearchPopover` đã có `searchSeqRef` cho danh sách hiển thị, nhưng con trỏ
   * phân trang là state **ngoài** nó, nên không được nó bảo vệ. Không có chốt
   * này: gõ "a" rồi "ab", phản hồi của "ab" về trước, sau đó phản hồi cũ của "a"
   * về và ghi đè `pagingRef.query = "a"` — lần `carrierLoadMore("ab")` kế tiếp
   * thấy query lệch, trả rỗng, và popover chốt `exhausted` cho một query còn dữ
   * liệu. Không lỗi, không dấu hiệu, chỉ là danh sách lặng lẽ dừng giữa đường.
   */
  const searchSeqRef = useRef(0);

  const carrierSearchAdapter = useCallback(
    async (
      query: string,
    ): Promise<SearchSuggestion<TempWarehousePublicUser>[]> => {
      const seq = ++searchSeqRef.current;
      const result = await fetchPage(query, 1);
      // Lượt đã bị thay thế: không chạm con trỏ. Rows trả về đằng nào cũng bị
      // `searchSeqRef` của popover loại, nên cứ trả cho đúng kiểu.
      if (seq === searchSeqRef.current) {
        pagingRef.current = result
          ? {
              query,
              nextPage: 2,
              fetched: result.data.length,
              total: result.total,
            }
          : { query, nextPage: 2, fetched: 0, total: 0 };
      }
      return (result?.data ?? []).map((item) => ({ item }));
    },
    [fetchPage],
  );

  /**
   * `loadedCount` của popover bị bỏ qua có chủ ý: nó đếm dòng đã nhận, còn
   * server phân trang theo số trang, và hai con số đó lệch nhau ngay khi có một
   * trang ngắn. `pagingRef` là nguồn đúng.
   */
  const carrierLoadMore = useCallback(
    async (
      query: string,
    ): Promise<SearchSuggestion<TempWarehousePublicUser>[]> => {
      const seq = searchSeqRef.current;
      const cursor = pagingRef.current;
      // Chốt cuối, không tới được trên đường thật: popover chặn `loadNextPage`
      // khi `runSearch` còn đang bay, nên trang 1 của query hiện tại luôn đã ghi
      // con trỏ trước khi tới đây. Trả rỗng là hướng an toàn — popover dừng,
      // `runSearch` kế tiếp dựng lại con trỏ.
      if (cursor.query !== query) return [];
      // Đây thì ngược lại: đường kết thúc **bình thường**, chạy mỗi lần người
      // dùng cuộn hết một query. Chính nó là lý do mang `total` từ server về —
      // xoá nó đi là quay lại phải dò bằng một request rỗng mới biết đã hết.
      if (cursor.fetched >= cursor.total) return [];

      const result = await fetchPage(query, cursor.nextPage);
      if (!result) return [];
      // Cùng lý do như trong adapter: query đổi giữa lúc trang đang bay thì con
      // trỏ thuộc về query mới, không phải trang này.
      if (seq === searchSeqRef.current) {
        pagingRef.current = {
          query,
          nextPage: cursor.nextPage + 1,
          fetched: cursor.fetched + result.data.length,
          total: result.total,
        };
      }
      return result.data.map((item) => ({ item }));
    },
    [fetchPage],
  );

  const resolveCarrierCandidates = useCallback(
    async (query: string): Promise<TempWarehousePublicUser[]> => {
      const result = await fetchPage(query, 1);
      return result?.data ?? [];
    },
    [fetchPage],
  );

  const resolveCarrierById = useCallback(
    (userId: string) => getCarrierById(userId),
    [getCarrierById],
  );

  return useMemo(
    () => ({
      carriersLoading,
      carrierToolbar,
      setCarrierToolbar,
      carrierSearchAdapter,
      carrierLoadMore,
      resolveCarrierCandidates,
      resolveCarrierById,
    }),
    [
      carriersLoading,
      carrierToolbar,
      setCarrierToolbar,
      carrierSearchAdapter,
      carrierLoadMore,
      resolveCarrierCandidates,
      resolveCarrierById,
    ],
  );
}
