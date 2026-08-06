# Chênh lệch FE ↔ BE — Khuyến mại & Voucher tại POS (2026-08-06)

> Phạm vi: 3 mặt trận — **Backoffice: Danh sách CTKM**, **Backoffice: Danh sách Voucher**, **POS-web: màn Bán hàng**.
> Backend tham chiếu: `promotion-programs-engine` (`/v2/promotions/*`, `/v2/vouchers/*`) + `checkout-saga` (`/v2/pos/checkout`, nhánh `feat/promotions`, uncommitted).
> Kết luận một dòng: **Backoffice đã nối API thật, hết mock. POS-web có đủ UI nhưng chưa gọi bất kỳ API khuyến mại/voucher nào — mọi lựa chọn của thu ngân chỉ đổi state cục bộ, không đổi tổng tiền, không gửi lên server.**

---

## 1 — Trạng thái tổng quan

| Màn                                                           | Trạng thái                   | Ghi chú                                                                                                                                          |
| ------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backoffice — Danh sách CTKM (`pages/promotions/programs/`)    | ✅ DONE                       | `ProgramsPage.tsx` dùng `usePromotionsQuery` thật, `ProgramFormPage.tsx` save qua mutation thật, đủ 5 hình thức, không còn `_mock/`              |
| Backoffice — Danh sách Voucher (`pages/promotions/vouchers/`) | ✅ DONE                       | `VouchersPage.tsx` dùng `useVouchersQuery` thật, create/edit/duplicate/deactivate qua mutation thật (commit `e9d9e0dc`), không còn `_mock/`      |
| Backoffice — Item/Category picker cho form CTKM               | ✅ DONE                       | `PromotionTargetPicker` bọc lại `ProductSelectDialog`/`CategorySelectDialog` có sẵn, đúng kế hoạch TKT-KM-15                                     |
| **POS-web — màn Bán hàng (Checkout)**                         | ⛔ **UI shell, chưa gọi API** | `PromotionSelectionModal`/`VoucherDialog` render thật, nhưng data vào là mảng rỗng cứng và kết quả chọn không rời khỏi state cục bộ — xem §3, §4 |

Backoffice không nằm trong phạm vi gap document này (đã xong) — liệt kê ở trên chỉ để đối chiếu. Phần còn lại của tài liệu tập trung vào POS-web.

---

## 2 — Backend đã sẵn sàng những gì

Contract phía server **đã đầy đủ hơn** những gì POS-web đang dùng — đây không phải trường hợp "chờ BE", mà là dây chưa được nối.

### 2.1 `POST /v2/pos/checkout` (checkout-saga) — endpoint chính POS đã gọi

`CheckoutV2Dto` (`apps/api/src/modules/pos/checkout-saga/interface/dto/checkout-v2.dto.ts`) khai báo đủ các trường sau **từ khi ticket bắt đầu**, kể cả những trường UOW sau mới tiêu thụ, để hợp đồng ổn định:

| Trường                   | Kiểu                                                     | BE tiêu thụ ở                                                                                                                                                          | POS-web (`CheckoutV2Body`, `invoice.dto.ts:96`) có gửi? |
| ------------------------ | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `invoiceId`              | uuid                                                     | —                                                                                                                                                                      | ✅                                                       |
| `payments[]`             | `{paymentMethod, amount, paymentAccountId?, reference?}` | —                                                                                                                                                                      | ✅                                                       |
| `dueDate` / `creditDays` | string / int                                             | `create-debt.step.ts`                                                                                                                                                  | ✅                                                       |
| `selectedProgramIds`     | uuid[]                                                   | `evaluate-promotion.step.ts` — chọn CTKM nào chạy khi `auto_apply=false` (ONE_OF/tùy chọn); server luôn tự tính lại số tiền, danh sách này chỉ chọn *chương trình nào* | ❌ **không có trong `CheckoutV2Body`**                   |
| `voucherCode`            | string                                                   | `resolve-funds.step.ts` (preflight validate) → `redeem-voucher.step.ts` (transactional, T-05-01)                                                                       | ❌ **không có trong `CheckoutV2Body`**                   |
| `dryRun`                 | boolean                                                  | Chạy toàn bộ preflight, trả `totals`/`appliedPrograms` mà **không ghi gì** — dùng để xem trước                                                                         | ❌ **`invoiceService.checkout()` không có tham số này**  |

`invoice.service.ts:89-104` (`checkout()`) build `v2Body` chỉ với 4 trường đầu — `selectedProgramIds`, `voucherCode`, `dryRun` bị bỏ hoàn toàn khi build request, dù kiểu `CheckoutV2Body` (nếu có khai báo đủ) hoàn toàn có thể forward chúng.

### 2.2 `POST /v2/promotions/evaluate` — endpoint xem trước, độc lập với checkout

`PromotionV2Controller.evaluate()` (`interface/promotion-v2.controller.ts:45-51`) nhận `EvaluateCartDto` (`customerId?`, `at?`, `selectedProgramIds?`, danh sách dòng hàng `{lineId, itemId, quantity, unitPrice, manualLineDiscount?}`) và trả về danh sách CTKM áp được + số tiền giảm + quà tặng — **không cần có draft invoice, không ghi gì**. Đây đúng là endpoint để POS hiển thị "CTKM nào sẽ áp dụng" ngay khi khách còn đang chọn hàng, trước khi bấm thanh toán.

**0 lần gọi trong `apps/pos-web/src`** (`grep -r "EvaluateCartQuery\|/promotions/evaluate"` → không có kết quả).

### 2.3 Voucher — không có endpoint "validate" riêng ở v2

`VoucherV2Controller` (`voucher-v2.controller.ts`) chỉ có `search`/`create`/`update`/`duplicate`/`deactivate` — toàn bộ là API **quản trị** (backoffice), yêu cầu quyền `promotion.write`/`promotion.delete` mà tài khoản thu ngân thường không có. Không có `GET /v2/vouchers/:code` hay `POST /v2/vouchers/:code/validate` công khai cho POS tra cứu mệnh giá/hiệu lực trước khi áp.

→ Cách khớp với thiết kế hiện tại: dùng `dryRun: true` trên chính `POST /v2/pos/checkout` (đã có sẵn, xem §2.1) làm bước "xem trước" — vừa validate voucher (`resolve-funds.step.ts`) vừa validate CTKM (`evaluate-promotion.step.ts`) trong cùng một lời gọi, không cần thêm endpoint mới.

---

## 3 — POS-web hiện trạng: UI có, dây chưa nối

### 3.1 Luồng dữ liệu hiện tại

```
PromotionSelectionModal / VoucherDialog (render thật, có trong PaymentSummaryPanel)
        │  onSelect / onSubmit
        ▼
useCheckoutPromotion() (use-checkout-promotion.ts)
        │  updateDraftSlice("promotion", …)
        ▼
checkout-session.store.ts — draft.promotion = { appliedPromotion, appliedVoucher, pointsRedeemed }
        │
        ▼
   (KHÔNG có bước nào đọc draft.promotion khi build CheckoutV2Body)
        ▼
invoiceService.checkout() → POST /v2/pos/checkout { invoiceId, payments, dueDate, creditDays }
```

`appliedPromotion`/`appliedVoucher` sống trong Zustand store, hiển thị lại thành chip ở right pane, nhưng **không có node nào trên sơ đồ nối nó vào request thật**.

### 3.2 Bằng chứng cụ thể (file:line)

- `PaymentSummaryPanel.tsx:185-188` — `<PromotionSelectionModal … promotions={[]} …>`: mảng CTKM truyền vào modal là **rỗng, hard-code**, không phải kết quả của một query nào.
- `use-checkout-promotion.ts:30-33` (docblock của chính file) — *"Promotion + voucher handlers — đọc ui store và phát announce. Hiện `promotions` list ở Page là static `[]` nên không expose từ đây."*
- `use-checkout-promotion.ts:74-78` — *"Lưu voucher vào draft local — BE chưa có endpoint apply-voucher, nên số liệu trên grand total không đổi; chip hiển thị ở right pane lấy từ slice này."* — comment này viết **trước** khi `checkout-saga` (voucherCode trong `CheckoutV2Dto`, T-05-01) tồn tại; nay đã lỗi thời.
- `interfaces/promotion.interface.ts:7-13` — docblock: *"Loose by design — the modal renders an empty state when no promotions are provided, so callers can wire real backend data later"* — `PromotionItem` là type placeholder cục bộ, không import từ `@erp/shared-interfaces`, không có `discountAmount`/`priority`/`type` như `PromotionProgramSummary` thật.
- `dtos/voucher.dto.ts` (`VoucherFormResult`) — cũng là type cục bộ, không map sang `voucherCode?: string` của `CheckoutV2Dto` backend dù tên trường trùng nhau.

### 3.3 CTKM tự động (auto-apply) vẫn chạy đúng dù FE chưa làm gì

Cần phân biệt rõ: **CTKM có `auto_apply=true`** (không cần thu ngân chọn) vẫn được áp đúng, vì `evaluate-promotion.step.ts` chạy **server-side, bên trong chính saga checkout**, không phụ thuộc FE gọi gì thêm — xác nhận bằng bán hàng thật ngày 2026-08-06 (`INV-202608-00001`, xem `.ai/features/checkout-saga/04-units-of-work/UOW-05-voucher-and-cutover/tickets/T-05-04.md`): bán một đôi giày có CTKM tặng hàng đang bật, hóa đơn tự thêm dòng quà mà không thao tác gì ở POS UI.

Phần thiếu chỉ nằm ở:
1. **Xem trước** CTKM sẽ áp + số tiền giảm **trước khi** bấm "Thu tiền" (hiện chỉ biết sau khi server tính xong).
2. Cho thu ngân **chọn** giữa các CTKM tùy chọn khi có nhiều chương trình `auto_apply=false` cùng đủ điều kiện (ONE_OF).
3. **Áp mã voucher thật** — nhập mã, server trừ tiền, ghi `redeemed_invoice_id`.

---

## 4 — Bảng gap chi tiết

| ID   | Vấn đề                                                                                                        | Ảnh hưởng                                                                                                                                                                                      | Fix ở                                 | Approach                                                                                                                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PV-1 | `invoiceService.checkout()` không forward `voucherCode`                                                       | Nhập mã voucher ở `VoucherDialog` không có tác dụng gì lên hóa đơn thật — khách vẫn trả đủ giá                                                                                                 | **FE**                                | Thêm `voucherCode?: string` vào `CheckoutV2Body` (`invoice.dto.ts`), forward từ `draft.promotion.appliedVoucher.voucherCode` trong `invoice.service.ts:89-97`                                                              |
| PV-2 | `invoiceService.checkout()` không forward `selectedProgramIds`                                                | CTKM tùy chọn (`auto_apply=false`, nhiều ứng viên) không bao giờ được chọn — server tự lấy ứng viên đầu (`ONE_OF` fallback đã ghi ở A-11 của checkout-saga), thu ngân không có quyền chọn khác | **FE**                                | Forward `draft.promotion.appliedPromotion?.id` (hoặc mảng nếu cho chọn nhiều) vào `selectedProgramIds`                                                                                                                     |
| PV-3 | Không xem trước được CTKM/voucher trước khi thanh toán                                                        | Thu ngân chỉ biết tổng tiền cuối cùng sau khi bấm "Thu tiền" — không thể báo khách trước, không phát hiện voucher hết hạn/sai mã tới lúc chốt đơn                                              | **FE + BE (đã có sẵn)**               | Gọi `POST /v2/pos/checkout` với `dryRun: true` (đã hỗ trợ từ UOW-01) mỗi khi giỏ hàng/voucher/CTKM đổi, hoặc gọi thẳng `POST /v2/promotions/evaluate` (§2.2) cho phần CTKM riêng nếu muốn tách khỏi vòng đời draft invoice |
| PV-4 | `PromotionSelectionModal` luôn nhận `promotions={[]}`                                                         | Modal chọn CTKM tùy chọn không có dữ liệu thật để hiển thị — không thể demo/test tay được luồng chọn ONE_OF                                                                                    | **FE**                                | Thay `promotions={[]}` bằng kết quả preview (PV-3) lọc còn các CTKM `auto_apply=false` đủ điều kiện                                                                                                                        |
| PV-5 | `PromotionItem`/`VoucherFormResult` là type cục bộ, không khớp `PromotionProgramSummary`/response thật của BE | Khi nối dữ liệu thật (PV-4) sẽ cần một tầng map thủ công, dễ lệch tên trường (đã từng xảy ra ở TKT-KM-12 theo `01-assumptions.md` của promotion-programs-engine)                               | **FE**                                | Map response `evaluate`/`dryRun` sang `PromotionItem`/`VoucherOption` ngay tại hook (`use-checkout-promotion.ts`), không đổi type của 2 dialog (giữ "loose by design" cho tái sử dụng)                                     |
| PV-6 | Không có endpoint public để POS tra mệnh giá/hiệu lực voucher theo mã, ngoài checkout thật                    | Muốn hiện mệnh giá voucher trong `VoucherDialog` ngay khi gõ mã (trước khi submit) thì chưa có API nhẹ để gọi                                                                                  | **BE** (tùy chọn, không chặn PV-1..4) | Cân nhắc thêm `GET /vouchers/lookup?code=` quyền `pos.voucher.read` (khác `promotion.read`/`write` hiện có), hoặc chấp nhận chỉ biết kết quả qua `dryRun` (PV-3) — không cần endpoint riêng nếu chấp nhận độ trễ đó        |

---

## 5 — Việc không nằm trong gap này (đã xác nhận đúng)

- **Auto-apply CTKM tại POS**: đã chạy đúng, server-side, không cần sửa gì (§3.3).
- **Chống tiêu voucher hai lần khi hai quầy đua nhau**: đã có `redeem-voucher.step.ts` + conditional update, kiểm bằng e2e (`checkout-saga-voucher.e2e-spec.ts`, AC-21) — vấn đề ở đây thuần là POS-web chưa *gửi* mã voucher lên, không phải server xử lý sai khi nhận được mã.
- **Server tự tính lại số tiền, bỏ số client gửi** (AC-19 của checkout-saga): đã đúng thiết kế — khi nối PV-1/PV-2, FE chỉ cần gửi *lựa chọn* (mã voucher, id chương trình), không tự tính discount.

---

## 6 — Việc cần làm nếu muốn nối nốt (tóm tắt thứ tự)

1. PV-1 + PV-2 (nhanh nhất, ít rủi ro nhất): thêm 2 trường vào `CheckoutV2Body`, forward trong `invoice.service.ts`. Không đổi UI.
2. PV-3: thêm một React Query hook gọi `dryRun: true` (debounce theo thay đổi giỏ hàng/voucher/CTKM chọn), lưu kết quả vào một slice mới của `checkout-session.store.ts`.
3. PV-4 + PV-5: đổ kết quả (2) vào `PromotionSelectionModal`/`VoucherDialog` qua một hàm map nhỏ.
4. PV-6: chỉ làm nếu UX cần phản hồi tức thời khi gõ mã voucher (trước khi có đủ giỏ hàng để dry-run).
