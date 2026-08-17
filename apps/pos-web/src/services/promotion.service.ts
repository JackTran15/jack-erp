import { http } from "@erp/pos/lib/common/http";
import type {
  EvaluateCartBody,
  EvaluateCartResponse,
} from "@erp/pos/dtos/promotion.dto";

export const promotionService = {
  /**
   * `POST /v2/promotions/evaluate` — định giá giỏ hàng: CTKM nào áp được, giảm
   * bao nhiêu, quà gì, và **vì sao** chương trình khác bị bỏ qua.
   *
   * Không ghi gì và không cần draft hoá đơn, nên gọi được ngay khi khách còn
   * đang chọn hàng. Đổi lại nó **không biết gì về voucher** — mệnh giá voucher
   * tra riêng qua `GET /v2/vouchers/lookup` (ADR-01).
   *
   * Số tiền trả về chỉ để hiển thị: server tự tính lại toàn bộ lúc checkout,
   * nên đừng bao giờ gửi ngược con số này lên.
   */
  evaluate: (
    body: EvaluateCartBody,
    opts?: { signal?: AbortSignal },
  ): Promise<EvaluateCartResponse> =>
    http.post<EvaluateCartResponse>("/v2/promotions/evaluate", body, opts),
};
