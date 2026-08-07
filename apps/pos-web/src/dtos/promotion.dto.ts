import type { EvaluateCartResponse } from "@erp/shared-interfaces";

/**
 * Một dòng giỏ hàng gửi cho `POST /v2/promotions/evaluate`.
 * Mirror `EvaluateCartLineInputDto`
 * (`apps/api/src/modules/promotion/application/dto/evaluate-cart.dto.ts`).
 */
export interface EvaluateCartLineBody {
  /**
   * Id dòng phía client. Server echo lại nguyên văn trong `lineDiscounts`, nhờ
   * đó map kết quả về đúng dòng mà không phải đoán theo thứ tự mảng.
   */
  lineId: string;
  itemId: string;
  quantity: number;
  unitPrice: number;
  /** Giảm giá tay ở mức dòng thu ngân đã nhập, nếu có. */
  manualLineDiscount?: number;
}

/** Body cho `POST /v2/promotions/evaluate`. Mirror `EvaluateCartDto`. */
export interface EvaluateCartBody {
  /** Bỏ trống với khách vãng lai. */
  customerId?: string;
  /** ISO datetime; bỏ trống = giờ server. */
  at?: string;
  /** Id các CTKM `auto_apply=false` thu ngân chọn tay. */
  selectedProgramIds?: string[];
  lines: EvaluateCartLineBody[];
}

export type { EvaluateCartResponse };
