import { StockMovementType } from '@erp/shared-interfaces';

export type MovementDirection = 'IN' | 'OUT';

export type InSubcategory =
  | 'PURCHASE'
  | 'TRANSFER_IN'
  | 'RETURN_IN'
  | 'ADJUSTMENT_IN'
  | 'OTHER_IN';

export type OutSubcategory =
  | 'SALE'
  | 'TRANSFER_OUT'
  | 'RETURN_OUT'
  | 'ADJUSTMENT_OUT'
  | 'DISPOSAL'
  | 'OTHER_OUT';

export interface MovementClassification {
  direction: MovementDirection;
  subcategory: InSubcategory | OutSubcategory;
  /** Vietnamese label for report breakdown columns. */
  label: string;
}

/**
 * Map a `StockMovementType` (and optional `referenceType`) to a coarse IN/OUT
 * direction plus a fine-grained subcategory + vi-VN label.
 *
 * Keep in sync with `StockMovementType` from `@erp/shared-interfaces`.
 */
export function classifyMovement(
  movementType: StockMovementType,
  _referenceType?: string,
): MovementClassification {
  switch (movementType) {
    case StockMovementType.PURCHASE_RECEIPT:
      return { direction: 'IN', subcategory: 'PURCHASE', label: 'Mua hàng' };

    case StockMovementType.SALE_ISSUE:
      return { direction: 'OUT', subcategory: 'SALE', label: 'Bán hàng' };

    case StockMovementType.TRANSFER_IN:
      return { direction: 'IN', subcategory: 'TRANSFER_IN', label: 'Điều chuyển nhận' };

    case StockMovementType.TRANSFER_OUT:
      return { direction: 'OUT', subcategory: 'TRANSFER_OUT', label: 'Điều chuyển xuất' };

    case StockMovementType.RETURN_IN:
      return { direction: 'IN', subcategory: 'RETURN_IN', label: 'Trả lại từ KH' };

    case StockMovementType.ADJUSTMENT_INCREASE:
      return { direction: 'IN', subcategory: 'ADJUSTMENT_IN', label: 'Kiểm kê tăng' };

    case StockMovementType.ADJUSTMENT_DECREASE:
      return { direction: 'OUT', subcategory: 'ADJUSTMENT_OUT', label: 'Kiểm kê giảm' };

    case StockMovementType.GOODS_ISSUE:
      return { direction: 'OUT', subcategory: 'OTHER_OUT', label: 'Xuất khác' };

    case StockMovementType.EXCHANGE_IN:
      return { direction: 'IN', subcategory: 'OTHER_IN', label: 'Đổi hàng (nhận)' };

    case StockMovementType.EXCHANGE_OUT:
      return { direction: 'OUT', subcategory: 'OTHER_OUT', label: 'Đổi hàng (xuất)' };

    default: {
      // Exhaustiveness guard — extending StockMovementType requires updating this map.
      const _exhaustive: never = movementType;
      return {
        direction: 'OUT',
        subcategory: 'OTHER_OUT',
        label: `Khác (${String(_exhaustive)})`,
      };
    }
  }
}
