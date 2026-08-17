---
feature: return-points-net-basis
adr_count: 3
---

# Logical design — Điểm trả hàng tính trên đúng số tiền khách đã trả

## Approach

Không thêm khái niệm mới, không đổi schema, không đổi hợp đồng API. Đại lượng ròng cần
dùng **đã tồn tại**: `computeReturnedNet` (`checkout-return.service.ts:572`) đã tính
`returnedNet` cho đường tiền từ `promotion-qa-defects/UOW-01`, và `ComputedTotals` đã mang
nó sẵn. Việc phải làm là để hai hàm điểm dùng chung đại lượng đó thay vì tự prorate lại
trên cơ sở gộp.

Mấu chốt là một đẳng thức, không phải một công thức mới. Theo đúng định nghĩa của
`amountDue` trên `invoice.entity.ts:100`:

```
amountDue = subtotal − discountAmount − pointsDiscountAmount − depositAmount
```

và theo cách `computeReturnedNet` dựng mẫu số:

```
Σ netLine      = subtotal − Σ promotionDiscount
headerResidual = pointsDiscountAmount + depositAmount
               + max(0, discountAmount − Σ promotionDiscount)

⟹ Σ netLine − headerResidual
   = subtotal − Σpromo − pointsDiscount − deposit − (discountAmount − Σpromo)
   = subtotal − discountAmount − pointsDiscount − deposit
   = amountDue                                                    ← A-06
```

Nghĩa là `amountDue` **chính là** mẫu số mà `returnedNet` đã được tính trên đó. Hai hệ quả:

1. `reverseBase = amountDue × (returnedNet / amountDue) = returnedNet`. Hàm rút gọn thành
   một phép gán, không còn phép nhân chia nào — và đó cũng là lý do nó đúng: điểm lúc bán
   tích trên `amountDue`, nên điểm lúc trả phải đảo trên đúng phần `amountDue` được trả lại.
2. `creditBack = floor(pointsRedeemed × returnedNet / amountDue)` — cùng một tỷ lệ, dùng cho
   điểm đã tiêu.

Kiểm bằng hai đầu mút: trả toàn bộ cho `returnedNet = amountDue` ⟹ đảo đúng `pointsEarned`
và hoàn đúng `pointsRedeemed`; hoá đơn không khuyến mại cho `returnedNet = returnSubtotal`
và `amountDue = subtotal` ⟹ trùng khít công thức cũ (A-04).

## Alternatives rejected

| Option | Why not |
|---|---|
| Đổi `returnSubtotal` thành ròng ngay tại `computeTotals` | `returnSubtotal` còn được dùng làm cổng điều kiện (`returnSubtotal <= 0`) và làm giá trị hiển thị `invoice.subtotal` (:313). Đổi nghĩa của nó sẽ kéo theo những chỗ không liên quan tới điểm — đúng cái bẫy mà docblock cũ cảnh báo |
| Prorate điểm theo tỷ lệ `returnedNet / Σ netLine` | Mẫu số sai: bỏ sót `headerResidual`, nên trả toàn bộ hoá đơn có tiêu điểm sẽ **không** đảo đủ `pointsEarned`. `amountDue` mới là mẫu số khớp với tử số |
| Tính lại điểm từng dòng từ `point_history` của đơn gốc | `point_history` ghi ở mức hoá đơn, không mức dòng. Sẽ phải thêm cột và backfill — không tương xứng với một bản vá công thức |
| Backfill sửa điểm các phiếu trả cũ | Giao dịch đã post là bất biến; chủ sở hữu đã chốt không sửa lịch sử (A-02) |
| Rút gọn `computeReverseBase` xuống đúng một dòng `return totals.returnedNet` | Xoá mất nhánh trả nhanh không có hoá đơn gốc, vốn là đường sống của luồng QUICK (A-R2) |

## Domain model

Không có thực thể mới. Ba đại lượng trên `ComputedTotals` (`checkout-return.service.ts:57-64`):

| Đại lượng | Nghĩa | Ai dùng sau thay đổi |
|---|---|---|
| `returnSubtotal` | Giá **gộp** của các dòng trả (IN) | Cổng điều kiện `> 0`, `invoice.subtotal` hiển thị. **Không còn** là cơ sở điểm |
| `returnedNet` | Tiền khách **thực trả** cho số hàng trả lại | Tiền hoàn (đã có) **+ cơ sở điểm (mới)** |
| `refundedAmount` | `max(returnedNet − newSubtotal, 0)` | Tiền hoàn thực chi, nhánh thoái lui của trả nhanh |

## Contracts

Không có endpoint nào đổi. Không có DTO nào đổi. Không có migration.
Thay đổi nằm trọn trong hai phương thức `private` của một service.

Giá trị **quan sát được từ bên ngoài** có đổi, và đó là chủ đích:

| Chỗ | Trước | Sau |
|---|---|---|
| `invoices.points_reversed` của phiếu trả | prorate trên gộp | `floor(returnedNet / 10.000)` |
| `invoices.points_balance_after` | dựa trên hai số trên | dựa trên hai số mới |
| Sự kiện đảo điểm (`LoyaltyPointsReversePublisher`) | prorate trên gộp | cùng cơ sở với ảnh chụp |
| Điểm hoàn qua `refundRedeemedPoints` | prorate trên gộp | prorate trên `returnedNet / amountDue` |

## State ownership

| State | Owner | Ghi chú |
|---|---|---|
| `pointsReversed`, `pointsBalanceAfter` | `CheckoutReturnService`, trong transaction chốt phiếu | Ảnh chụp để in, không phải nguồn sự thật |
| Số dư điểm thật | `MembershipCardService` + consumer đảo điểm | Nguồn sự thật; consumer đã kẹp ở số dư khả dụng |
| Cơ sở tiền (`returnedNet`) | `computeTotals` | Một chỗ tính duy nhất, hai đường tiền/điểm cùng đọc (AC-10) |

## Error taxonomy

Feature này không thêm lỗi người dùng thấy được — nó thêm **chốt chặn số học**.

| Condition | Xử lý | Vì sao |
|---|---|---|
| `returnSubtotal <= 0` | Trả 0 điểm, thoát sớm | Cổng đã có, giữ nguyên |
| Không có hoá đơn gốc (QUICK) | Nhánh thoái lui `Math.abs(refundedAmount \|\| returnSubtotal)` | Không có gì để prorate (A-05, A-R2) |
| Có hoá đơn gốc nhưng `originalItems` rỗng | `computeReturnedNet` đã trả `returnSubtotal` | Thoái về hành vi gộp, đúng như hoá đơn v1 |
| `originalInvoice.amountDue <= 0` | `creditBack` thoái về tỷ lệ **gộp** trên `subtotal` | Hoá đơn trả trọn bằng điểm thì không còn cơ sở tiền để chia. Không phải giả thiết: `INV-202608-00010` đang nằm trong DB dev với `amount_due = 0` (A-07) |
| `subtotal <= 0` ở nhánh trên | Trả 0 | Chặn chia cho 0 lần cuối |

## Observability

Dòng log hiện có ở cuối `checkoutReturn` (`:497`) đã in `refunded` và `net`. Bổ sung
`pointsReversed` vào đúng dòng đó — khiếu nại điểm của khách tra được bằng log mà không
phải mở DB. Không thêm sự kiện mới, không thêm metric mới.

## ADRs

### ADR-01 — `amountDue` là mẫu số chung cho cả hai công thức điểm

**Context:** `returnedNet` được tính bằng cách trừ khuyến mại theo dòng rồi trừ tiếp phần
chia của `headerResidual`. Muốn dùng nó làm cơ sở điểm thì phải biết nó đứng trên mẫu số
nào, nếu không thì trả toàn bộ hoá đơn sẽ không đảo đủ số điểm đã tích.

**Decision:** Dùng `originalInvoice.amountDue` làm mẫu số. Đẳng thức
`Σ netLine − headerResidual = amountDue` chứng minh nó là mẫu số mà `returnedNet` đã đứng
trên đó, và cũng đúng là cơ sở mà điểm được tích lúc bán (`floor(amountDue / 10.000)`).

**Consequences:** `computeReverseBase` rút gọn thành `returnedNet` khi có hoá đơn gốc — ít
số học hơn, không phải nhiều hơn. Đổi lại, tính đúng đắn giờ phụ thuộc vào việc định nghĩa
`amountDue` không đổi; nếu sau này có ai thêm một khoản giảm trừ mức hoá đơn mà quên đưa vào
`headerResidual`, đẳng thức gãy. Test AC-03 và AC-07 (trả toàn bộ) chính là chốt chặn đó.

**Status:** accepted

### ADR-02 — Giữ nguyên nhánh thoái lui, không rút gọn hàm

**Context:** Sau ADR-01, thân hàm `computeReverseBase` cho trường hợp có hoá đơn gốc chỉ
còn một phép gán. Cám dỗ rất lớn là rút cả hàm xuống một dòng.

**Decision:** Giữ hai nhánh. Nhánh không có hoá đơn gốc (`Math.abs(refundedAmount ||
returnSubtotal)`) là đường của trả nhanh và không được đụng tới.

**Consequences:** Hàm trông "thừa" so với thân của nó. Docblock phải nói rõ vì sao nhánh kia
tồn tại, nếu không lần dọn dẹp sau sẽ xoá nó (A-R2).

**Status:** accepted

### ADR-03 — Sai số làm tròn được chấp nhận, phân bổ sai thì không

**Context:** Mỗi phiếu trả `floor` riêng, nên `Σ floor(...) ≤ floor(Σ ...)`: trả một hoá đơn
thành nhiều phiếu có thể đảo hụt vài điểm so với trả một lần. Điều này đúng ở **cả** cơ sở
gộp lẫn cơ sở ròng.

**Decision:** Không đuổi theo sai số làm tròn. Bất biến được khoá bằng test là **phần giữ
lại**: sau khi trả một phần, số điểm còn lại từ hoá đơn đó phải bằng số điểm mà phần hàng
khách vẫn đang giữ tự nó mang lại (AC-02).

**Consequences:** Vẫn có thể lệch ±1 điểm do làm tròn khi chia nhỏ phiếu trả, và đó là hành
vi được chấp nhận có tài liệu. Đổi lại, ta không phải mang thêm sổ theo dõi phần dư giữa các
phiếu trả — thứ sẽ cần một cột mới và một khoá chống tranh chấp.

**Status:** accepted
