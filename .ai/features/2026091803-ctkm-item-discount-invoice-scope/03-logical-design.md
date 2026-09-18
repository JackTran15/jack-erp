---
feature: ctkm-item-discount-invoice-scope
adr_count: 5
---

# Logical design — CTKM: Giảm giá hàng hóa + phạm vi giảm giá hóa đơn

## Approach

Ba thay đổi nhỏ, độc lập nhau, không cái nào cần migration. Điểm chung: **engine
không sai, đường ghi mới sai** — nên phần lớn công việc là gỡ một cái khóa và
chứng minh bằng test, không phải viết logic tính tiền mới.

**1. Mở lối vào (FE, 1 dòng).** `ADD_NEW_TYPE_OPTIONS` đang `.filter()` menu *Thêm
mới* xuống còn `INVOICE_DISCOUNT`. Cho phép thêm `PRODUCT_DISCOUNT`. Variant form,
lưới chọn hàng và registry đã có sẵn từ epic gốc — không dựng gì mới. Rủi ro thật
nằm ở chỗ đường này đã tắt đèn 5 tuần, nên phần lớn UOW-01 là test round-trip.

**2. Gỡ khóa phạm vi (FE, 3 chỗ + 1 test).**
- `ApplyScopePromotionSection` từ nhãn chết trở lại thành `RadioGroup` đọc/ghi `form.applyScope`, kèm dòng cảnh báo khi giá trị đang là `ALL_ITEMS` (A-14).
- `emptyForm.applyScope` đổi `ALL_ITEMS` → `NON_PROMO_ONLY` (đây là nơi *mặc định* thuộc về — xem ADR-03).
- `invoiceDiscountToDto` bỏ hardcode, dùng `applyScopeToApi(form.applyScope)`.
- `promotion.mapper.spec.ts` sửa kỳ vọng — có chủ ý, xem ADR-01 và A-15.

Backend **không đổi gì** cho phần này: `CreatePromotionDto.invoiceScope` đã tồn tại,
`dtoToProgramProps` đã truyền thẳng, và cả `create` lẫn `update` đều dùng chung nó.
Vì A-01 là *radio* chứ không phải *bất biến*, không có chỗ nào cần ép giá trị ở
handler — ép ở handler sẽ giết chính cái lựa chọn vừa khôi phục.

**3. Mở rộng "đã được giảm" sang giảm tay (domain, 2 chỗ).** Thêm
`CartState.discountFreeLines(cart)` — dòng vừa **chưa bị CTKM chiếm** vừa **không có
giảm tay**. `InvoiceDiscountStrategy` dùng hàm mới cho nhánh `NON_PROMO_ONLY`.
`unclaimedLines()` giữ nguyên chữ ký và nghĩa vì `condition-evaluator` đang dựa vào
nó cho `calc_basis = NON_PROMO_ITEMS` (ADR-02).

```ts
// cart-state.ts — thêm, không sửa unclaimedLines()
/** Cơ sở BR-002: chưa bị CTKM dòng chiếm VÀ chưa bị giảm tay ở quầy (A-02). */
discountFreeLines(cart: CartContext): CartLine[] {
  return cart.lines.filter(
    (line) => !this.isLineClaimed(line.lineId) && (line.manualLineDiscount ?? 0) <= 0,
  );
}
```

```ts
// invoice-discount.strategy.ts — đổi đúng một biểu thức
const base =
  program.invoiceScope === PromotionInvoiceScope.NON_PROMO_ONLY
    ? state.discountFreeLines(cart)
    : cart.lines;
```

Phép lọc là **phép hợp của hai điều kiện loại trừ**, nên một dòng vừa bị chiếm vừa
giảm tay chỉ rơi ra một lần (A-05) — không có đường nào trừ tiền hai lượt.

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Sửa thẳng `unclaimedLines()` để nó loại luôn dòng giảm tay | `condition-evaluator` dùng chung hàm đó cho `calc_basis = NON_PROMO_ITEMS`. Đổi nghĩa ở đây là âm thầm đổi cách *điều kiện* của CTKM được đánh giá — ngoài phạm vi, và AC-21 sẽ đỏ |
| Ép `NON_PROMO_ONLY` ở `CreatePromotionHandler` (bất biến phía backend) | Đúng với phương án "bất biến" ở vòng hỏi 1, nhưng Akenzy chốt lại là **radio** ở vòng 2. Ép ở handler thì radio thành đồ trang trí |
| Đảo mặc định của `undefined`/`NULL` trong `InvoiceDiscountStrategy` sang `NON_PROMO_ONLY` | Đổi cách tính của mọi CTKM cũ chưa đặt giá trị — vi phạm A-03, và là thay đổi tiền bạc không ai yêu cầu |
| Viết migration backfill `ALL_ITEMS` → `NON_PROMO_ONLY` | A-03: không backfill. Số thật chỉ 1 dòng mỗi DB, và cảnh báo UI (AC-23) đủ để người dùng tự quyết |
| Giữ `ApplyScopePromotionSection` là nhãn chết, chỉ đổi nhãn sang "Chỉ hàng chưa khuyến mại" | Nhãn sẽ nói dối với đúng những CTKM đang là `ALL_ITEMS` — tức là chính nhóm cần cảnh báo nhất |
| Mở lại cả 5 hình thức cùng lúc | A-04. Ba hình thức còn lại kéo theo lưới riêng, validate riêng và ~3× số AC, trong khi không ai yêu cầu |

## Domain model

| Entity | Fields | Notes |
| --- | --- | --- |
| `CartLine` | `lineId`, `itemId`, `quantity`, `unitPrice`, `manualLineDiscount?` | Không đổi. `manualLineDiscount` đã có sẵn, do `evaluate-promotion.step.ts` bơm từ `item.lineDiscount` |
| `CartState` | `lineOwners`, `giftSlotOwnerId`, `invoiceDiscountOwnerId` | **Thêm** `discountFreeLines(cart)`. Không đổi trường, không đổi `unclaimedLines()` |
| `PromotionProgram.invoiceScope` | `NON_PROMO_ONLY \| ALL_ITEMS \| undefined` | Không đổi kiểu. `undefined` tiếp tục hành xử như `ALL_ITEMS` (ADR-04) |
| `ProgramFormState.applyScope` | `ApplyScope` | Không đổi kiểu; đổi **giá trị mặc định** trong `emptyForm` |

## Contracts

Không có endpoint mới, không đổi chữ ký nào. Ghi lại để khẳng định điều đó:

### POST /v2/promotions
`invoiceScope?: 'NON_PROMO_ONLY' | 'ALL_ITEMS'` — đã tồn tại trong `CreatePromotionDto`.
Thay đổi duy nhất: FE bắt đầu gửi `NON_PROMO_ONLY` thay vì luôn `ALL_ITEMS`.
Bỏ trống vẫn hợp lệ và vẫn lưu `NULL`.

### POST /v2/promotions/evaluate
`EvaluateCartRequest.lines[].manualLineDiscount?: number` — đã tồn tại. Thay đổi là
**ý nghĩa**: từ nay một dòng có giá trị `> 0` bị loại khỏi cơ sở tính của CTKM hóa
đơn `NON_PROMO_ONLY`. `modules/mobile` dùng chung DTO nên hưởng thay đổi này, và
đó là chủ ý.

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| `applyScope` đang chọn trên form | `ProgramFormPage` (`ProgramFormState`) | Màn hình form; nạp từ `toFormState(detail)` khi sửa |
| Dòng nào đã bị chiếm | `CartState` | Một lần gọi `PromotionResolver.resolve()`; không rò ra ngoài |
| `invoice_scope` đã lưu | `promotion_programs` | Vĩnh viễn, cho tới khi người dùng chủ động đổi |

## Error taxonomy

| Condition | Failure | UI |
| --- | --- | --- |
| `invoiceScope` không thuộc enum | 400 `ValidationPipe` (global, `forbidNonWhitelisted`) | Lỗi tại ô, không phải toast chung |
| CTKM hóa đơn mà mọi dòng đều đã giảm | Không phải lỗi — `status: 'not_met'` | `skippedPrograms[].reason = 'CONDITION_NOT_MET'`; POS không hiện CTKM đó |
| CTKM lưu thiếu `groups[0]` (dữ liệu hỏng) | `status: 'not_met'` nhờ guard QA #8 sẵn có | Quầy vẫn bán được; một CTKM hỏng không làm treo máy tính tiền |
| Đổi `type` khi sửa | 400 `PROMOTION_TYPE_IMMUTABLE` | Đã có từ FR-006 |
| Thiếu `promotion.write` | 403 | Đã có |
| Trùng `X-Idempotency-Key` khác body | 409 `CONFLICT` | Do `IdempotencyInterceptor` toàn cục |

## Cache & offline

Không có cache mới. TanStack Query đang giữ danh sách CTKM dưới prefix
`["promotions", ...]`; sau khi lưu phải invalidate theo prefix như các màn hình khác
— hành vi sẵn có, không đổi. Engine không cache: `PromotionResolver` thuần và tất
định theo `cart.at`.

## Observability

Không thêm event mới. Hai thứ đáng nhìn khi nghi ngờ:
- `EvaluateCartResponse.skippedPrograms[].reason` — `CONDITION_NOT_MET` trên một CTKM hóa đơn giờ có thể nghĩa là "mọi dòng đã được giảm", không chỉ "không đủ điều kiện". Đây là điểm mơ hồ đã có sẵn trong taxonomy, không mở rộng ở feature này.
- `promotion_programs.invoice_scope` — truy vấn đối chiếu nhanh:
  `SELECT type, invoice_scope, count(*) FROM promotion_programs WHERE deleted_at IS NULL GROUP BY 1,2;`

## ADRs

### ADR-01 — Đảo quyết định khóa phạm vi của 2026-08-17
**Context:** Feature `promotion-scope-points-toggle` (2026-08-17, owner Akenzy) ghi ở
ADR-01 đã **accepted**: *"The business wants the choice removed — it should always
behave as `ALL_ITEMS` going forward"*, và success signal của nó là *"the
`NON_PROMO_ONLY` branch … is never reached again"*. Yêu cầu hôm nay là ngược lại.
Đếm thật trên DB cho thấy phần lớn CTKM đang lưu (`erp_dev` 6/7) vẫn là
`NON_PROMO_ONLY` từ trước khóa, nên khóa tháng 8 mới là thứ tạo ra nhóm lệch.
**Decision:** Khôi phục radio 2 lựa chọn, mặc định `NON_PROMO_ONLY`. ADR này
**supersede ADR-01 của `promotion-scope-points-toggle`**; phần B của feature đó
(checkbox `accruePoints`) **không** bị ảnh hưởng. Test
`promotion.mapper.spec.ts` đang khẳng định hành vi cũ được sửa có chủ ý (A-15), và
được khai trong cả `tests:` lẫn `touches:` của T-02-02 để không bị đóng băng.
**Consequences:** Nhánh `NON_PROMO_ONLY` của engine sống lại thay vì thành dead code
như tháng 8 dự tính. Ai đọc lại lịch sử sẽ thấy hai quyết định trái nhau — đó là lý
do ADR này tồn tại thay vì sửa lặng lẽ. Nếu business tháng 8 có lý do chưa được ghi
lại, việc đảo cần quay lại họ; Akenzy đã xác nhận đảo sau khi được trình bày rõ
mâu thuẫn này (2026-09-18).
**Status:** accepted

### ADR-02 — Thêm `discountFreeLines()`, không sửa `unclaimedLines()`
**Context:** A-02 mở rộng "đã được giảm" sang giảm tay. `unclaimedLines()` đang được
hai nơi dùng: `InvoiceDiscountStrategy` (cơ sở tính) và `condition-evaluator`
(`calc_basis = NON_PROMO_ITEMS`, tức *điều kiện* để CTKM chạy).
**Decision:** Thêm một hàm mới trên `CartState` cho nghĩa mới; `unclaimedLines()`
giữ nguyên chữ ký và nghĩa.
**Consequences:** Hai khái niệm gần nhau cùng tồn tại trên một lớp, cần docblock rõ
để người sau không dùng nhầm. Đổi lại, nghĩa của tab *Điều kiện áp dụng* không đổi
(AC-21), và blast radius gói gọn trong đúng một biểu thức.
**Status:** accepted

### ADR-03 — Mặc định thuộc về `emptyForm`, không thuộc mapper
**Context:** Cần "thêm mới thì `NON_PROMO_ONLY`" nhưng "sửa thì giữ nguyên giá trị
đang lưu" (A-08). Có thể nhét cả hai vào mapper bằng một cờ `isCreate`.
**Decision:** Mặc định đặt ở `emptyForm.applyScope`; mapper chỉ dịch thẳng
`applyScopeToApi(form.applyScope)`, không biết gì về create/update.
**Consequences:** `toCreateDto` và đường update dùng chung một nhánh, không cần cờ
và không có ngã rẽ nào để quên. Điều kiện ngầm: đường sửa **phải** nạp
`applyScopeFromApi(detail.invoiceScope)` trước khi render — việc này đã có sẵn ở
`invoiceDiscountFromDetail`, và AC-17 khóa nó lại bằng test.
**Status:** accepted

### ADR-04 — `undefined`/`NULL` tiếp tục hành xử như `ALL_ITEMS`
**Context:** Engine hiện chỉ rẽ nhánh khi `=== NON_PROMO_ONLY`. Có CTKM cũ lưu `NULL`
(đếm được: các dòng `ITEM_DISCOUNT`/`GIFT_ITEM` trên `erp_dev`).
**Decision:** Không đổi. `NULL` vẫn rơi vào `cart.lines`.
**Consequences:** Giữ A-03 đúng nguyên văn — không CTKM cũ nào đổi cách tính tiền vì
lần ship này. Giá phải trả: `NULL` mang nghĩa ngầm, đã được AC-16 ghim lại bằng test
để không ai "dọn dẹp" nó mà không đọc ADR này.
**Status:** accepted

### ADR-05 — Cảnh báo `ALL_ITEMS` là văn bản cạnh radio, không phải cửa chặn
**Context:** A-03 không backfill, nên vẫn còn CTKM `ALL_ITEMS` chạy. Người mở nó ra
cần hiểu hệ quả mà không bị cản trở công việc đang làm.
**Decision:** Hiện dòng giải thích cạnh radio khi giá trị đang là `ALL_ITEMS`; không
dialog, không chặn lưu (A-14).
**Consequences:** Không ép ai đổi dữ liệu họ không muốn đổi, vẫn xóa được điểm mù.
Nếu sau này muốn cứng rắn hơn, đây là một component nhỏ đổi riêng — A-14 còn để
`pending` đúng vì lý do đó.
**Status:** accepted
