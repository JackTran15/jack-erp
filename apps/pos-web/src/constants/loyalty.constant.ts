/**
 * Hằng số loyalty mirror từ BE (`apps/api/src/modules/customer/loyalty.constants.ts`).
 * 1 điểm = 500đ khi đổi. FE dùng để hiển thị "số tiền giảm từ điểm" — BE vẫn
 * là nguồn sự thật khi POST /invoices/:id/redeem-points (tính lại `pointsDiscountAmount`).
 */
export const POINT_REDEMPTION_VALUE_VND = 500;
