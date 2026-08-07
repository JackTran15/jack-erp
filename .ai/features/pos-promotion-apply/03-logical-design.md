---
feature: pos-promotion-apply
adr_count: 6
---

# Logical design — Áp dụng khuyến mại & voucher tại POS

## Approach

POS giữ **một nguồn sự thật duy nhất cho phần khuyến mại của giỏ hàng**: một slice mới
`promotionPreview` trong `checkout-session.store.ts`, được nạp lại bởi một hook
`use-checkout-promotion-preview` mỗi khi giỏ hàng, khách hàng, danh sách CTKM đã chọn, quà
đã chọn hoặc voucher đổi. Hook gọi `POST /v2/promotions/evaluate` (debounce 300ms, huỷ lời
gọi cũ) và ghi nguyên `EvaluateCartResponse` vào slice. Mọi thành phần UI — panel tổng tiền,
`PromotionSelectionModal`, dialog chọn quà — chỉ **đọc** slice đó, không tự tính lại số nào.

Voucher đi đường riêng vì `evaluate` không biết gì về voucher: `VoucherDialog` gọi
`GET /v2/vouchers/lookup?code=` để lấy mệnh giá và trạng thái hiệu lực, ghi kết quả vào
`draft.promotion.appliedVoucher`, và panel trừ mệnh giá đó **ở tầng hiển thị** khỏi
`amountAfterPromotion`. Con số thật vẫn do saga chốt lúc checkout.

Lúc bấm Thu tiền, `invoiceService.checkout()` forward 4 thứ FE đang giữ:
`selectedProgramIds`, `selectedGifts`, `voucherCode`, `manualDiscount`. Không gửi số tiền
nào (A-07) — server tính lại toàn bộ.

Phía backend, thay đổi được giữ ở mức **thêm trường optional** cho cả `EvaluateCartDto` và
`CheckoutV2Dto` để hai đường (xem trước và chốt đơn) nhận cùng một bộ đầu vào, nếu không thì
số xem trước và số chốt đơn sẽ lệch nhau ngay khi có quà hoặc giảm giá tay.

## Alternatives rejected

| Option                                                       | Why not                                                                                                                                                                                    |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dùng `dryRun: true` trên `POST /v2/pos/checkout` để xem trước | Chạy toàn bộ preflight (khoá hoá đơn, cấp số, giải ngân quỹ) chỉ để biết tiền giảm — quá nặng cho một lời gọi chạy mỗi lần quét mã. Cần draft invoice tồn tại trước, trong khi khách còn đang chọn hàng thì chưa có. Akenzy chọn `evaluate` (A-02) |
| FE tự tính tiền giảm từ định nghĩa CTKM tải sẵn              | Nhân đôi engine 5 strategy ở client; lệch làm tròn giữa FE và BE là loại bug rất khó truy. Vi phạm ADR-06 của `checkout-saga`                                                             |
| Thêm `/v3` cho các trường mới                                | Toàn bộ trường thêm vào đều optional, client cũ không vỡ (A-14). Một version mới chỉ để thêm field optional là chi phí không đổi lấy gì                                                    |
| Trường riêng `overrideProgramIds` tách khỏi `selectedProgramIds` | Thu ngân không phân biệt được "chọn CTKM tùy chọn" với "đè lên priority" — với họ chỉ là tick một dòng. Hai trường sẽ đẩy sự phân biệt kỹ thuật đó ra UI                          |
| Bắt chước "tính lại lười" của MISA                          | Akenzy loại ở câu hỏi phạm vi (A-10). Giữ KM cũ khi số lượng đã đổi là hiển thị số sai một cách có chủ đích                                                                                 |
| Dựng vitest cho `pos-web` trong phạm vi feature này          | Là việc hạ tầng cho cả app, không riêng khuyến mại; kéo vào đây làm UoW đầu phình và chặn mọi thứ phía sau. Thay vào đó: ADR-06 chốt cách kiểm chứng mà không cần runner                    |

## Domain model

Không có entity mới. Ba phần mở rộng trên cấu trúc sẵn có:

| Entity / type                          | Fields thêm                                                                       | Notes                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `EvaluateCartDto` (BE)                 | `selectedGifts?: GiftChoice[]`, `manualDiscount?: ManualDiscountInput`             | Để số xem trước khớp số chốt đơn, hai đường phải nhận cùng đầu vào                                          |
| `CheckoutV2Dto` (BE)                   | `selectedGifts?: GiftChoice[]`, `manualDiscount?: ManualDiscountInput`             | `selectedProgramIds` và `voucherCode` đã có sẵn, chỉ là FE chưa gửi                                          |
| `GiftChoice` (value object, shared)    | `programId: string`, `itemId: string`                                              | Một lựa chọn cho một CTKM tặng quà `ONE_OF`. Server validate itemId nằm trong danh sách ứng viên của program |
| `ManualDiscountInput` (value object)   | `mode: 'PERCENT' \| 'AMOUNT'`, `value: number`, `reason: string`, `scope: 'ALL' \| 'NOT_DISCOUNTED'` | `reason` bắt buộc, không rỗng sau trim (AC-23)                                             |
| `invoices.manual_discount_reason` (cột mới) | `varchar(255) null`                                                            | `discount_amount` đã tồn tại nên chỉ thiếu chỗ ghi lý do; không thêm bảng                                    |
| `promotionPreview` (slice FE)          | `EvaluateCartResponse \| null`, `status`, `error`                                  | Sống trong `checkout-session.store.ts`, thuộc về draft đang mở, xoá khi chuyển tab hoá đơn                   |

## Contracts

### POST /v2/promotions/evaluate — mở rộng đầu vào

Request (thêm vào `EvaluateCartDto` hiện có):
```json
{
  "lines": [{ "lineId": "L1", "itemId": "...", "quantity": 1, "unitPrice": 1495000 }],
  "selectedProgramIds": ["P1"],
  "selectedGifts": [{ "programId": "P2", "itemId": "G2" }],
  "manualDiscount": { "mode": "PERCENT", "value": 10, "reason": "Khách quen", "scope": "NOT_DISCOUNTED" }
}
```
Response 200: `EvaluateCartResponse` (không đổi shape).
Failure: 400 → `reason` rỗng / `selectedGifts.itemId` không thuộc ứng viên của program;
403 → thiếu quyền (xem ADR-05); 422 → `selectedProgramIds` chứa id không tồn tại.

### GET /v2/vouchers/lookup?code=<string> — mới

Response 200:
```json
{ "voucherId": "...", "code": "VC001", "programName": "TEST VOUCHER 100K", "faceValue": 100000, "status": "USABLE" }
```
`status`: `USABLE` | `NOT_FOUND` | `EXPIRED` | `ALREADY_REDEEMED` | `NOT_STARTED`.
Trả **200 kèm status** thay vì 404 cho mã sai — POS cần phân biệt "mã không tồn tại" với
"mạng lỗi", và một mã gõ nhầm không phải lỗi HTTP.
Failure: 403 → thiếu quyền; 5xx → `ServerFailure`.

### POST /v2/pos/checkout — mở rộng đầu vào

Thêm `selectedGifts` và `manualDiscount` (cùng shape trên). `selectedProgramIds` và
`voucherCode` giữ nguyên. Response không đổi.

## State ownership

| State                                        | Owner                                             | Lifetime                                    |
| -------------------------------------------- | ------------------------------------------------- | ------------------------------------------- |
| Kết quả `evaluate` (`promotionPreview`)      | `checkout-session.store.ts`, slice mới            | Theo draft hoá đơn đang mở; xoá khi đóng tab |
| `selectedProgramIds`, `selectedGifts`        | `checkout-session.store.ts`, slice `promotion`    | Theo draft; gửi lên lúc checkout            |
| `appliedVoucher` (code + mệnh giá tra được)  | `checkout-session.store.ts`, slice `promotion`    | Theo draft                                  |
| `manualDiscount`                             | `checkout-session.store.ts`, slice `promotion`    | Theo draft                                  |
| Trạng thái mở/đóng dialog, announcement      | `checkout-ui.store.ts` (đã có)                    | Màn hình                                    |
| Số tiền giảm **cuối cùng**                   | Server (saga)                                     | Vĩnh viễn, trên `invoice_checkout_promotions` |

## Error taxonomy

| Condition                                      | Failure subtype              | UI                                                                                  |
| ---------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| `evaluate` timeout / 5xx                       | `PreviewUnavailable`         | Chỉ báo "chưa tính được khuyến mại" ở panel; **không** chặn nút Thu tiền (AC-03)     |
| `evaluate` 403                                 | `PreviewForbidden`           | Cùng chỉ báo, kèm log rõ để phân biệt lỗi cấu hình quyền với lỗi mạng                |
| `lookup` trả `NOT_FOUND` / `EXPIRED` / …       | `VoucherUnusable`            | Thông báo tiếng Việt trong `VoucherDialog`, không ghi gì vào draft (AC-19)           |
| `lookup` 5xx                                   | `ServerFailure`              | "Không tra được mã lúc này, thử lại"; cho phép bỏ qua và checkout không voucher      |
| Checkout 409 voucher đã bị tiêu ở quầy khác    | `VoucherAlreadyRedeemed`     | Banner đỏ, tự bỏ voucher khỏi draft, chạy lại preview, giữ nguyên giỏ hàng           |
| Chưa chọn quà cho CTKM `ONE_OF`                | `GiftSelectionRequired`      | Chặn tại chỗ trước khi gửi request (AC-17), mở thẳng dialog chọn quà                 |
| Giảm giá tay thiếu lý do                       | `ManualDiscountReasonMissing`| Validate ở form, không gửi request (AC-23)                                            |

## Cache & offline

Không cache kết quả `evaluate` — giỏ hàng đổi thì kết quả cũ vô nghĩa, và cache một con số
tiền là cách chắc chắn nhất để hiển thị sai. Lời gọi đang bay bị **huỷ** (AbortController)
khi có lời gọi mới, nên kết quả về trễ của giỏ hàng cũ không bao giờ ghi đè kết quả mới
(AC-02). POS không có chế độ offline cho khuyến mại: mất mạng thì rơi vào
`PreviewUnavailable` và server vẫn là nơi chốt số lúc checkout.

## Observability

- Log mỗi lần `evaluate` trả `PreviewForbidden` ở mức `warn` kèm role của actor — đây là
  triệu chứng của A-05 tái phát sau khi ai đó sửa seed quyền.
- Đếm số lần `VoucherAlreadyRedeemed` — cao bất thường nghĩa là hai quầy đang dùng chung mã.
- Ghi lại độ lệch giữa `promotionDiscount` lúc preview và số saga ghi khi commit; kỳ vọng
  luôn bằng 0, khác 0 là lỗi contract giữa hai đường (chính là thứ NFR "Chính xác" đo).

## ADRs

### ADR-01 — Xem trước bằng `evaluate`, không phải `dryRun`
**Context:** Hai đường đều cho ra số tiền giảm. `dryRun` chạy trong saga nên chính xác tuyệt
đối, nhưng phải có draft invoice và chạy toàn bộ preflight; `evaluate` nhẹ, không cần draft,
nhưng mù voucher.
**Decision:** Dùng `POST /v2/promotions/evaluate` cho xem trước. Voucher tra riêng bằng
`GET /v2/vouchers/lookup`.
**Consequences:** Preview rẻ, gọi được ngay khi khách còn đang chọn hàng. Đổi lại phải giữ
hai đầu vào đồng bộ (ADR-02) và tự cộng trừ mệnh giá voucher ở tầng hiển thị — rủi ro lệch
số nếu quên, nên NFR "Chính xác" đo đúng chỗ đó.
**Status:** accepted

### ADR-02 — `evaluate` và `checkout` nhận cùng một bộ đầu vào khuyến mại
**Context:** Nếu `evaluate` không biết về quà đã chọn và giảm giá tay, số xem trước sẽ khác
số chốt đơn ngay khi dùng hai tính năng đó.
**Decision:** Mọi trường khuyến mại mới thêm đồng thời vào `EvaluateCartDto` và
`CheckoutV2Dto`, cùng tên, cùng kiểu, dùng chung value object trong `@erp/shared-interfaces`.
**Consequences:** Thêm một trường là sửa hai DTO — chấp nhận, vì cái giá của việc quên là
hai con số khác nhau trên cùng một màn hình.
**Status:** accepted

### ADR-03 — `selectedProgramIds` mang thêm nghĩa "đè priority"
**Context:** Thu ngân cần đổi CTKM thắng khi hai chương trình tranh một dòng (AC-11). Hiện
`selectedProgramIds` chỉ dùng để bật CTKM `auto_apply=false`.
**Decision:** Mở rộng ngữ nghĩa: chương trình có id trong `selectedProgramIds` **thắng tài
nguyên đang tranh chấp bất kể `priority`**. Không thêm trường thứ hai.
**Consequences:** Phải sửa `PromotionResolver` — nơi đang xanh 31/31 ticket — nên rủi ro hồi
quy cao nhất trong feature này; UOW-04 gánh trọn và phải giữ nguyên toàn bộ test cũ.
Ngược lại UI đơn giản: thu ngân chỉ tick một dòng, không phải hiểu hai khái niệm.
**Status:** accepted

### ADR-04 — Giảm giá tay tái dùng `invoices.discount_amount`, chỉ thêm cột lý do
**Context:** Cần lưu một khoản giảm giá tay mức hoá đơn kèm lý do bắt buộc.
**Decision:** Dùng lại cột `discount_amount` đã có; thêm đúng một cột
`manual_discount_reason varchar(255) null`. Không tạo bảng mới, không đụng
`invoice_checkout_promotions` (bảng đó là snapshot của **chương trình**, giảm giá tay không
phải chương trình).
**Consequences:** Migration nhỏ nhất có thể. Đổi lại không lưu được nhiều khoản giảm giá tay
trên một hoá đơn — chấp nhận, MISA cũng chỉ cho một.
**Status:** accepted

### ADR-05 — Thêm `pos.promotion.evaluate` và `pos.voucher.read`, cấp cho `STAFF`
**Context:** `STAFF` không có key nào thuộc module `promotion` (A-05), mà `evaluate` đang đòi
`promotion.read` — key vốn dành cho backoffice quản trị CTKM.
**Decision:** Thêm hai key POS-scoped mới vào `permissions.seed.ts`, cấp cho
`STAFF_PERMISSION_KEYS`. `evaluate` chấp nhận `promotion.read` **hoặc**
`pos.promotion.evaluate`; `lookup` đòi `pos.voucher.read`.
**Consequences:** Thu ngân không được thừa hưởng quyền đọc toàn bộ danh mục CTKM của
backoffice — đúng nguyên tắc quyền tối thiểu. Đổi lại `PermissionGuard` phải hỗ trợ "một
trong nhiều key", cần kiểm tra guard hiện có làm được chưa (ticket đầu của UOW-01).
**Status:** accepted

### ADR-06 — Kiểm chứng logic thuần bằng test backend, không dựng runner cho `pos-web`
**Context:** `pos-web` không có test runner (A-06); 4 file `*.test.ts` sẵn có chưa từng chạy.
Dựng vitest là việc hạ tầng cho cả app.
**Decision:** Mọi quy tắc **tính toán** nằm ở backend và được test ở đó (engine + saga đã có
Jest thật). Phía `pos-web` chỉ giữ phần nối dây và hiển thị, kiểm chứng bằng type-check
(`tsc --noEmit`) cộng click-through tay theo Demo script của từng UoW. Không ticket nào
được ghi "unit test FE xanh" như tiêu chí hoàn thành.
**Consequences:** Lưới an toàn FE mỏng — chấp nhận có ý thức, và là lý do mỗi UoW bắt buộc
có Demo script chi tiết. Dựng runner cho `pos-web` nên là một feature hạ tầng riêng.
**Status:** accepted
