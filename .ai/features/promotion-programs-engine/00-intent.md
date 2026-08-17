---
feature: promotion-programs-engine
slug: promotion-programs-engine
owner: Akenzy
created: 2026-08-03
status: in_construction   # draft | approved | in_construction | done | abandoned
---

# Intent — Khuyến mại (promotion programs engine)

Nguồn: `tickets/epics/EPIC-22072026-promotion-programs-engine.md`,
`docs/promotions/25-promotion-req.md` (REQ-KM-001), `docs/26-promotion-design.md`.
Bản kế hoạch này **cắt lại** 16 ticket `TKT-KM-01..16` thành lát cắt dọc; ticket cũ vẫn là
đặc tả chi tiết, không bị xóa hay sửa.

## Problem

Cửa hàng chạy 5 hình thức khuyến mại (giảm giá hóa đơn, giảm giá hàng hóa, giảm giá theo mức,
tặng hàng hóa, mua m tặng n) nhưng hệ thống không đỡ được cái nào cho ra hồn:

- **Backend là stub.** `promotions` lưu `conditions`/`benefits` dạng `jsonb` không kiểu.
  `PromotionApplyService.computePromotionAmount` chỉ hiểu `percentage` / `discount_amount`
  phẳng trên `subtotal`, và **trả về `0` cho mọi CTKM `gift_product` / `buy_x_get_y`**.
  Không có bậc thang, không có giảm giá cấp dòng, không có quà tặng, không có khái niệm ưu tiên.
- **Frontend dựng xong khung nhưng chạy trên mock.** 5 variant form đã có trong
  `pages/promotions/programs/ProgramFormPage/PromotionVariant/`, nhưng dữ liệu lấy từ
  `_mock/mock-programs.ts` và nút Lưu chỉ `console.log`.
- **Khi hai CTKM chồng nhau, không ai biết cái nào thắng.** Điểm đau số 1 trong khảo sát MISA
  eShop (`docs/promotions/promotion-misa-eshop-survey.md` mục 7.4): thu ngân thấy CTKM không
  chạy mà không có bất kỳ lý do nào hiển thị.

Hệ quả: marketing không tạo được chương trình nào ngoài giảm giá phẳng, và mọi con số khuyến
mại phức tạp phải tính tay ngoài hệ thống.

## Affected personas

| Persona             | Hành vi hiện tại                                                        | Hành vi mong muốn                                                        |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Nhân viên marketing | Chỉ tạo được giảm giá phẳng; hình thức khác phải nhờ IT sửa `jsonb` tay | Tự tạo, sửa, nhân bản, ngừng theo dõi cả 5 hình thức từ backoffice       |
| Thu ngân (POS)      | CTKM không chạy mà không rõ lý do                                       | Thấy CTKM nào đã áp, số tiền giảm, và **lý do** CTKM khác bị bỏ qua      |
| Kế toán             | Số tiền giảm tính tay ngoài hệ thống, lệch với hóa đơn                  | Số tiền giảm do một engine duy nhất tính, làm tròn về đồng, tái lập được |
| Developer           | Logic khuyến mại rải trong service phụ thuộc DB, không test được        | Engine thuần TS, mọi AC kiểm chứng bằng unit test chạy trong mili-giây   |

## Success signal

Đo được, không phải cảm tính:

1. Tạo và lưu được **cả 5 hình thức** từ `/promotions/programs`; mở lại từ danh sách
   round-trip đúng mọi trường — đặc biệt `tierGroups` nhiều nhóm và hai lưới của
   `BUY_M_GET_N`.
2. `POST /v2/promotions/evaluate` trả đúng số tiền đối chiếu tay cho AC-01…AC-09 của
   REQ-KM-001. Mốc chuẩn: SKU `685.000` giảm 30% → giảm `205.500`, còn `479.500`.
3. Hai CTKM cùng SKU, `priority` 10 (30%) và 20 (50%) → CTKM 30% thắng; CTKM 50% xuất hiện
   trong `skippedPrograms` kèm `reason = RESOURCE_TAKEN` và `takenBy`.
4. Không CTKM nào "biến mất im lặng": mọi chương trình bị loại đều có một dòng trong
   `skippedPrograms` với `reason` thuộc union có kiểu.

## Out of scope

- **Tích hợp POS checkout.** Engine chỉ có mặt qua `evaluate`; hóa đơn chưa gọi. Lý do: định
  giá lại dòng hóa đơn đụng `checkout-invoice.service.ts` và `invoice_items` (không có cột
  `isGift`/`promotionId`) — đủ lớn cho một epic riêng.
- **Trừ kho quà tặng và ghi giá vốn quà.** Engine chỉ trả `gifts[]` dạng đề xuất (BR-006).
  Lý do: kho là hệ quả của việc ghi hóa đơn, thuộc epic POS.
- **Nhập/xuất Excel danh sách hàng hóa KM** (FR-025/026, mức *Should*). Lý do: cần thêm giá
  trị `ImportJobType` + migration pg enum, không chặn luồng chính.
- **Báo cáo hiệu quả khuyến mại, khuyến mại kênh online, quản lý hạng thẻ.** Lý do: hạng thẻ
  chỉ được *tham chiếu* (`membership_card_types`), không quản lý ở đây.
- **Bảng `promotions` cũ, `discount_codes`, `invoice_promotions`, `PromotionApplyService`.**
  Không đụng tới; drop là migration riêng sau khi xác nhận hết dữ liệu.

## Constraints

| Kind        | Detail                                                                                                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dữ liệu     | `synchronize: false` — schema chỉ đổi qua migration viết tay; `migration:generate` sinh drift khổng lồ trên repo này                                                        |
| Đa tổ chức  | Mọi truy vấn lọc `actor.organizationId`; phạm vi chi nhánh nằm ở bảng nối `promotion_branches` (rỗng = toàn chuỗi), **không** phải cột `branch_id` của `promotion_programs` |
| Hợp đồng FE | `ProgramFormState` trong `pages/promotions/programs/program-form.types.ts` là contract backend phải đáp ứng — khung form đã dựng trước backend                              |
| Ngôn ngữ    | Chuỗi hiển thị tiếng Việt; source backend (lỗi, comment, Swagger, log) tiếng Anh; enum/ID giữ tiếng Anh                                                                     |
| Làm tròn    | Về **đồng**, một helper `roundVnd` duy nhất — FE và BE lệch quy tắc làm tròn là loại bug rất khó truy                                                                       |
| Test        | `apps/backoffice-web` **không có test runner thật** (`"test": "echo test"`); lưới an toàn của FE là type-check + unit test mapper + click-through tay                       |
| E2E         | DB riêng `erp_test`, tuần tự `maxWorkers: 1`, `forceExit: true`; kafkajs để hở handle nên teardown treo có thể giả dạng "suite failed" — phải đọc output thật               |

## Existing surface touched

- **Tái dùng (backend):** `FilterBuilder` + filter sub-DTO (`common/filters/`) — 5 toán tử text
  của FR-003 map thẳng vào `StringOperator`; `@Actor()` / `ActorContext`;
  `DocumentNumberingService.generate`; global `IdempotencyInterceptor`; `BranchScopeGuard`;
  URI versioning đã bật ở `main.ts`; khuôn CQRS query của `search-invoices-v2.handler.ts`.
- **Tái dùng (frontend):** `components/shared/product-select/ProductSelectDialog.tsx` (đã có
  `categoryFilter`, mở rộng product → variant, `ProductSelectResult`);
  `lib/erp-api` (`erpApi` / `requireErpData` / `requireErpSuccess`); `@erp/ui`;
  `DocumentListShell` / `PageToolbar` / `PaginationControls`.
- **Feature liền kề:** `modules/inventory` (`ItemEntity` — `code` chính là SKU, `ProductEntity`,
  `ItemCategoryEntity` cây qua `parentGroupId`), `modules/customer` (`CustomerGroupEntity`,
  `MembershipCardTypeEntity`, `CustomerEntity.birthDate`), `modules/rbac` (3 permission key mới).
- **Điểm vào mới:** 8 route `/v2/promotions/*` + 5 route `/v2/vouchers/*`; route backoffice
  `/promotions/programs`, `/new`, `/:id/edit`, `/promotions/vouchers` (đã có sẵn trong
  `App.tsx`, không tạo route mới).
