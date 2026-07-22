import type { PromotionProgramRow } from "../programs.types";
import {
  PromotionApplyTo,
  PromotionForm,
  PromotionStatus,
} from "../programs.constants";

/** Dữ liệu giả cho danh sách chương trình khuyến mãi (UI-first, chưa nối API). */
export const MOCK_PROGRAM_ROWS: PromotionProgramRow[] = [
  {
    id: "km-tet",
    name: "km tết",
    applyTo: PromotionApplyTo.ALL_CUSTOMERS,
    form: PromotionForm.INVOICE_DISCOUNT,
    status: PromotionStatus.TRACKING,
  },
  {
    id: "km-8-3",
    name: "Ưu đãi 8/3",
    startDate: "2026-03-01",
    endDate: "2026-03-08",
    applyTo: PromotionApplyTo.CUSTOMER_GROUP,
    form: PromotionForm.PRODUCT_DISCOUNT,
    description: "Giảm 10% cho khách hàng thân thiết",
    status: PromotionStatus.TRACKING,
  },
  {
    id: "km-he",
    name: "Sale hè rực rỡ",
    startDate: "2026-06-01",
    endDate: "2026-08-31",
    applyTo: PromotionApplyTo.ALL_CUSTOMERS,
    form: PromotionForm.TIERED_DISCOUNT,
    description: "Chiết khấu theo tổng giá trị hóa đơn",
    status: PromotionStatus.PAUSED,
  },
  {
    id: "km-mua-2-tang-1",
    name: "Mua 2 tặng 1",
    startDate: "2026-05-01",
    endDate: "2026-05-31",
    applyTo: PromotionApplyTo.SPECIFIC_CUSTOMER,
    form: PromotionForm.BUY_M_GET_N,
    status: PromotionStatus.ENDED,
  },
  {
    id: "km-qua-tang",
    name: "Tặng quà tri ân",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    applyTo: PromotionApplyTo.CUSTOMER_GROUP,
    form: PromotionForm.GIFT,
    description: "Tặng kèm sản phẩm cho đơn từ 500.000đ",
    status: PromotionStatus.TRACKING,
  },
];
