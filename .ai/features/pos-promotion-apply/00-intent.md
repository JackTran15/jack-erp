---
feature: pos-promotion-apply
slug: pos-promotion-apply
owner: Akenzy
created: 2026-08-06
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Áp dụng khuyến mại & voucher tại POS

Nối nốt phần cuối của hai epic đã xong phía server:

- `promotion-programs-engine` (G3, 31/31 ticket) — engine 5 hình thức + `/v2/promotions/evaluate`.
  Intent của nó **ghi rõ "Tích hợp POS checkout" là out of scope**.
- `checkout-saga` (G3, 38/39 ticket) — `evaluate-promotion.step`, `redeem-voucher.step`,
  cột quà trên `invoice_items`, `selectedProgramIds`/`voucherCode`/`dryRun` trên `CheckoutV2Dto`.

Đầu vào bổ sung: đợt click-through hệ tham chiếu **MISA eShop** ngày 06/08/2026
(`docs/promotions/promotion-misa-eshop-survey.md`, memory `project_promotion_req_from_misa`),
tạo thật 5 CTKM + 1 voucher + 4 hóa đơn để quan sát hành vi từng hình thức.
Gap FE↔BE đã liệt kê sẵn tại `docs/promotions/promotion-voucher-pos-fe-be-gaps.md` (PV-1..PV-6).

## Problem

POS-web **có đủ UI nhưng chưa nối dây nào**. Thu ngân bấm vào thì thấy giao diện phản hồi,
nhưng không có gì rời khỏi máy:

- `PaymentSummaryPanel.tsx:185` truyền `promotions={[]}` **hard-code** vào
  `PromotionSelectionModal` — modal chọn CTKM vĩnh viễn rỗng.
- `use-checkout-promotion.ts:74` ghi voucher vào Zustand kèm comment *"BE chưa có endpoint
  apply-voucher"* — comment viết trước khi `redeem-voucher.step.ts` tồn tại, nay đã sai.
- `invoice.service.ts:89-104` build `CheckoutV2Body` chỉ với 4 trường; `selectedProgramIds`,
  `voucherCode`, `dryRun` bị bỏ hoàn toàn dù server đã nhận từ lâu.
- `grep "/promotions/evaluate"` trong `apps/pos-web/src` → **0 kết quả**.

Hệ quả cụ thể: khách đưa voucher 100.000₫, thu ngân nhập mã, chip hiện lên ở panel phải,
**khách vẫn trả đủ giá**. Và thu ngân không biết tổng tiền sau KM cho tới khi bấm "Thu tiền".

Ba khoảng trống nữa lộ ra khi đối chiếu MISA — hệ tham chiếu làm được, ta chưa:

- **Chọn quà tặng.** Engine trả `gifts[]` kèm `mode: ONE_OF`, nhưng `CheckoutV2Dto` không có
  chỗ gửi "khách chọn quà nào", nên saga tự lấy ứng viên đầu (A-11 của `checkout-saga`).
  MISA bật dialog radio cho thu ngân chọn.
- **Giảm giá tay mức hóa đơn.** MISA có "Khuyến mại khác": %/VNĐ, **bắt buộc nhập lý do**,
  và radio phạm vi `Tất cả hàng hóa` | `Chỉ hàng hóa chưa áp dụng khuyến mãi`. Ta không có.
- **Tranh chấp CTKM.** Hai CTKM cùng trỏ 1 SKU: MISA hỏi thu ngân *"đổi sang chương trình A?"*;
  jack-erp để `priority` tự quyết, thu ngân không có tiếng nói.

Ngược lại, có một chỗ ta **hơn** MISA và cần giữ: engine trả `skippedPrograms` kèm `reason`
có kiểu. MISA để CTKM biến mất im lặng — đúng điểm đau số 1 trong khảo sát (mục 7.4).

## Affected personas

| Persona           | Hành vi hiện tại                                                                  | Hành vi mong muốn                                                                        |
| ----------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Thu ngân          | Nhập voucher/chọn CTKM → chip hiện lên, tổng tiền không đổi; chỉ biết số cuối sau khi bấm Thu tiền | Thấy ngay số tiền giảm khi giỏ hàng đổi; nhập mã voucher biết liền mệnh giá và hạn dùng |
| Thu ngân          | Không biết vì sao CTKM khách nhắc lại không chạy                                   | Đọc được lý do từng CTKM bị bỏ qua ngay trong dialog                                     |
| Thu ngân          | Quà ONE_OF do server tự chọn, khách không được đổi                                | Mở dialog chọn quà, khách lấy đúng món mình muốn                                          |
| Khách hàng        | Voucher đưa ra không được trừ                                                      | Voucher trừ đúng mệnh giá, không tiêu được hai lần                                        |
| Quản lý cửa hàng  | Không cho phép giảm giá ngoài CTKM, nhân viên tự thương lượng ngoài hệ thống       | Giảm giá tay có kiểm soát: bắt buộc lý do, ghi lại được ai giảm bao nhiêu vì sao          |

## Success signal

Đo được, không phải cảm tính. Mốc chuẩn lấy từ chính 4 hóa đơn đã bán thật trên MISA
ngày 06/08/2026 để đối chiếu số:

1. **Voucher trừ tiền thật.** Giỏ 1.046.500₫ + voucher mệnh giá 100.000₫ → còn phải thu
   946.500₫ trên màn hình POS **trước khi** bấm Thu tiền, và hóa đơn ghi đúng số đó
   (đối chiếu HĐ MISA `2608050002`).
2. **Preview khớp kết quả.** Số `promotionDiscount` hiển thị lúc xem trước bằng đúng số
   saga ghi khi commit — sai lệch 0₫ trên toàn bộ AC.
3. **Không CTKM nào biến mất im lặng.** Mọi chương trình đủ điều kiện nhưng không chạy đều
   có một dòng trong dialog kèm lý do đọc được bằng tiếng Việt.
4. **Chọn quà có tác dụng.** Với CTKM `ONE_OF` nhiều ứng viên, quà thu ngân chọn chính là
   dòng quà trên hóa đơn đã chốt — không phải ứng viên đầu danh sách.
5. **Giảm giá tay chặn được đơn thiếu lý do.** Submit không có `reason` → 400, không có
   đường nào tạo được khoản giảm giá tay ẩn danh.

## Out of scope

- **Tính lại lười kiểu MISA** (giữ KM cũ khi đổi số lượng, hỏi xác nhận rồi mới cập nhật).
  Lý do: user đã chọn không bắt chước — POS ta tính lại ngay khi giỏ hàng đổi.
- **Điểm tích lũy / hạng thẻ ("Mã ưu đãi" của MISA).** Lý do: màn riêng, gắn vòng đời khách
  hàng; `pointsRedeemed` đã có đường đi riêng ở `finalizeCheckoutAndPrint`, không đụng.
- **Backoffice CTKM/voucher.** Lý do: đã DONE, xác nhận trong gap doc §1.
- **CTKM auto-apply.** Lý do: đã chạy đúng server-side, xác nhận bằng `INV-202608-00001`
  (gap doc §3.3) — không cần FE làm gì thêm.
- **Đổi/trả hàng có KM.** Lý do: `checkout-return.service.ts` là luồng khác, hoàn KM khi trả
  hàng là bài toán riêng đủ lớn cho epic sau.
- **Báo cáo hiệu quả khuyến mại.** Lý do: thuộc `reporting`, cần dữ liệu tích lũy trước.

## Constraints

| Kind         | Detail                                                                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server chốt số | ADR-06 của `checkout-saga`: server luôn tự tính lại tiền giảm, bỏ số client gửi. FE chỉ gửi **lựa chọn** (id chương trình, mã voucher, id quà), không bao giờ gửi số tiền   |
| Cờ tính năng | Đường v2 nằm sau `VITE_CHECKOUT_V2`; 3 trường KM chỉ tồn tại trên `/v2/pos/checkout` nên tính năng này thừa hưởng cùng cờ, không thêm cờ mới                                 |
| Test FE      | `apps/pos-web` **không có test runner**: `package.json` là `"test": "echo test"`, vitest không có trong dependency nào. Có sẵn 4 file `*.test.ts` dưới `lib/page-libs/checkout/` nhưng **chưa bao giờ được chạy**. Muốn có lưới an toàn thì phải tự dựng runner (xem A-06) |
| Quyền        | ⚠️ Role `STAFF` (thu ngân, `org-role-permissions.ts`) **không có `promotion.read` lẫn `pos.promotion.read`** → gọi `/v2/promotions/evaluate` sẽ 403. Sửa RBAC là điều kiện tiên quyết, không phải việc phụ |
| Đa tổ chức   | Mọi truy vấn lọc `actor.organizationId`; `evaluate` đã gắn `@RequireBranchScope()`                                                                                            |
| Làm tròn     | Về đồng, dùng đúng helper `roundVnd` của engine; FE **không** tự làm tròn lại                                                                                                 |
| Ngôn ngữ     | Chuỗi POS tiếng Việt; source backend (lỗi, comment, Swagger, log) tiếng Anh                                                                                                   |
| OpenAPI      | Đổi DTO backend ⇒ chạy lại `pnpm openapi:generate`, commit `openapi.snapshot.json` + `schema.ts`                                                                              |
| Song song    | UOW-03..06 là anh em cùng nhánh nhưng đều ghi vào cùng vài file FE (`PaymentSummaryPanel.tsx`, `invoice.service.ts`, `checkout-session.store.ts`, `use-checkout-promotion.ts`) — `uow_graph.py` cảnh báo 28 lần về việc này. Tách file ra chỉ để tránh cảnh báo thì tệ hơn xung đột. **Chạy tuần tự theo wave là an toàn; nếu chạy song song nhiều agent thì phải tự lo merge 4 file đó** |

## Existing surface touched

- **Tái dùng (pos-web):** `PromotionSelectionModal` + `PromotionTable/PromotionRow`,
  `VoucherDialog`, `DiscountPointDialog/VoucherSearchPanel`, `use-checkout-promotion.ts`,
  `checkout-session.store.ts` (slice `promotion` đã có `appliedPromotion`/`appliedVoucher`/
  `pointsRedeemed`), `checkout-ui.store.ts` (`setAnnouncement`), `lib/page-libs/checkout/
  promotionPresentation.ts`, `http` client trong `services/`.
- **Tái dùng (backend):** `PromotionResolver` + 5 strategy (không sửa logic, chỉ mở rộng đầu
  vào), `EvaluateCartQuery`/`handler`, `CheckoutSagaOrchestrator` + `CheckoutStep`,
  `redeem-voucher.step.ts`, `IdempotencyInterceptor`, `@Actor()`, `PermissionGuard`.
- **Feature liền kề:** `promotion-programs-engine` (contract `EvaluateCartResponse`,
  `PromotionEvaluation`), `checkout-saga` (`CheckoutV2Dto`, `CheckoutContext`),
  `modules/rbac` + `database/seeds/org-role-permissions.ts` (cấp quyền cho `STAFF`:
  key mới cho lookup voucher **và** quyền gọi `evaluate` mà hiện role này chưa có).
- **Điểm vào mới:** 1 route BE `GET /v2/vouchers/lookup`; **không** route FE mới —
  toàn bộ nằm trong `CheckoutPage` đã có.
