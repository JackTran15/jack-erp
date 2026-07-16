import type { PromotionProgramRow } from "../programs.types";

/** Dữ liệu giả cho danh sách chương trình khuyến mãi (UI-first, chưa nối API). */
export const MOCK_PROGRAM_ROWS: PromotionProgramRow[] = [
  {
    id: "km-tet",
    name: "km tết",
    applyTo: "ALL_CUSTOMERS",
    form: "INVOICE_DISCOUNT",
    status: "TRACKING",
  },
  {
    id: "km-8-3",
    name: "Ưu đãi 8/3",
    startDate: "2026-03-01",
    endDate: "2026-03-08",
    applyTo: "CUSTOMER_GROUP",
    form: "PRODUCT_DISCOUNT",
    description: "Giảm 10% cho khách hàng thân thiết",
    status: "TRACKING",
  },
  {
    id: "km-he",
    name: "Sale hè rực rỡ",
    startDate: "2026-06-01",
    endDate: "2026-08-31",
    applyTo: "ALL_CUSTOMERS",
    form: "TIERED_DISCOUNT",
    description: "Chiết khấu theo tổng giá trị hóa đơn",
    status: "PAUSED",
  },
  {
    id: "km-mua-2-tang-1",
    name: "Mua 2 tặng 1",
    startDate: "2026-05-01",
    endDate: "2026-05-31",
    applyTo: "SPECIFIC_CUSTOMER",
    form: "BUY_M_GET_N",
    status: "ENDED",
  },
  {
    id: "km-qua-tang",
    name: "Tặng quà tri ân",
    startDate: "2026-09-01",
    endDate: "2026-09-30",
    applyTo: "CUSTOMER_GROUP",
    form: "GIFT",
    description: "Tặng kèm sản phẩm cho đơn từ 500.000đ",
    status: "TRACKING",
  },
];
