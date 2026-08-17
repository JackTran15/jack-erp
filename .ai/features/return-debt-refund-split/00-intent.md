---
feature: return-debt-refund-split
slug: return-debt-refund-split
owner: Akenzy
created: 2026-08-16
status: draft
---

# Intent — Trả hàng trên hoá đơn còn nợ: tách khoản hoàn giữa công nợ và tiền mặt

## Problem

Trả hàng cho một hoá đơn bán chịu đang còn nợ làm cửa hàng mất tiền hai lần trên cùng
một chứng từ.

Báo cáo hiện trường (QA, lỗi #8):

- `INV-202608-00022`: phải thu 765.000, khách mới trả 300.000, còn nợ 465.000.
- Thu ngân trả hàng toàn bộ → quỹ **chi ra 765.000 tiền mặt**, công nợ 465.000 **vẫn open**.
- Khách cầm về 465.000 chưa từng trả **và** vẫn nợ 465.000 → cửa hàng âm **930.000** trên
  một hoá đơn 765.000.

Đây không phải lỗi lẻ: không có bất kỳ trần nào theo số tiền thực thu. Hoá đơn nợ toàn
phần (đã trả 0đ) vẫn hoàn 100% giá trị hàng trả.

Chiều ngược lại cũng sai. Nếu thu ngân *có* tích "Tính vào công nợ"
(`refundMethod = OFFSET`), toàn bộ khoản hoàn đi cấn trừ công nợ:
`applied = min(765.000, 465.000) = 465.000`, phần chênh **300.000 khách đã thực trả bị
nuốt** — không chi ra, không ghi nợ, không store credit. Khách mất tiền thật.

Nói cách khác: hệ thống chỉ biết **toàn tiền mặt** hoặc **toàn cấn trừ**, không bao giờ
biết **tách**. Và việc chọn nhánh nào lại phụ thuộc vào việc thu ngân có nhớ tích một ô
checkbox hay không.

Gốc rễ đã định vị trong mã nguồn (`apps/api/src/modules/pos/services/checkout-return.service.ts`):

| Vị trí | Hành vi hiện tại |
|---|---|
| `computeTotals` / `computeReturnedNet` (L534–623) | `refundedAmount = returnedNet` — giá trị ròng của hàng trả, **không tham chiếu số tiền đã thu** |
| Chú thích L523–528 | Ghi nhận có chủ ý: không kẹp theo `invoices.total_paid`, và "chi vượt số đã thu vẫn có thể xảy ra — thu ngân tự chọn OFFSET cho ca đó" |
| `wantsOffset` (L181–202) | `OFFSET` chỉ bật khi FE gửi, tức khi thu ngân tích "Tính vào công nợ" |
| `offsetOriginalDebt` (L813–849) | `applied = min(refundedAmount, remainingAmount)`, phần dư trả về nhưng **không ai chi ra** |
| `fanOutEvents` (L970–1013) | `CASH_REFUND` / `DEPOSIT_REFUND` chi **toàn bộ** `refundedAmount`, chỉ khi method = CASH/BANK |

Lý do lịch sử của việc không kẹp là đúng và phải giữ:
`invoices.total_paid` **không** được cập nhật khi khách trả nợ — tiền trả sau chỉ nằm ở
`debt_payments` (xem `invoice-debt.service.ts`). Kẹp theo `total_paid` đơn thuần sẽ hoàn
**0đ** cho khách bán chịu đã trả hết nợ — một lỗi tệ hơn lỗi đang sửa. Số tiền thực thu
phải cộng `total_paid + Σ debt_payments`.

## Affected personas

| Persona | Hành vi hiện tại | Hành vi mong muốn |
|---|---|---|
| Thu ngân POS | Trả hàng đơn còn nợ → chi đủ tiền mặt, phải tự nhớ tích "Tính vào công nợ" mới cấn trừ, và khi tích thì khách mất phần đã trả | Bấm trả hàng, hệ thống tự tách: trừ công nợ trước, chi tiền phần khách đã thực trả; màn hình hiện rõ hai con số trước khi xác nhận |
| Chủ cửa hàng | Mất tiền trên mỗi lần trả hàng đơn bán chịu, không có cảnh báo | Chi ra không bao giờ vượt số đã thực thu trên hoá đơn đó |
| Kế toán | Quỹ chi 765.000 nhưng công nợ vẫn treo 465.000 — sổ quỹ và sổ công nợ mâu thuẫn | Một chứng từ trả hàng sinh đúng hai chân: giảm công nợ + phiếu chi (nếu có), tổng khớp giá trị hàng trả |

## Success signal

Trên mọi phiếu trả hàng/đổi hàng có hoá đơn gốc:

```
tiền thực chi (mặt + gửi)  ≤  số tiền khách đã thực trả cho hoá đơn gốc
                              (total_paid + Σ debt_payments − Σ đã hoàn trước đó)

công nợ giảm + tiền thực chi = refundedAmount
```

Kiểm chứng: dựng lại đúng ca của QA (hoá đơn 765.000, đã trả 300.000, còn nợ 465.000),
trả toàn bộ → công nợ về 0, phiếu chi **300.000**, không phải 765.000. Bất biến trên đúng
với 100% phiếu trả có hoá đơn gốc trong test suite.

## Out of scope

- **Trả hàng QUICK (không có hoá đơn gốc)** — không có công nợ để tra, giữ nguyên hành vi
  hoàn theo giá trị hàng.
- **Huỷ hoá đơn (`cancelInvoice`)** — đường chi hoàn riêng, đã có feature
  `cancel-invoice-refund`; chỉ mở rộng nếu chủ sở hữu xác nhận (xem A-04).
- **Sửa dữ liệu các phiếu trả đã post sai trước đây** — chỉ làm nếu chủ sở hữu xác nhận
  (xem A-05).
- **Đổi cách tính `returnedNet`** — công thức ròng vừa được chốt ở feature
  `return-points-net-basis` (ADR-01 ở đó), không đụng lại.
- **Điểm thưởng** — `computeReverseBase` / `computeRedeemedCreditBack` đứng trên
  `returnedNet`, không đổi theo cách chia tiền.

## Constraints

| Kind | Detail |
|---|---|
| Dữ liệu | `invoices.total_paid` đóng băng ở thời điểm checkout; tiền trả nợ chỉ có ở `debt_payments` — mọi phép tính "đã thực thu" phải cộng cả hai |
| Bất biến | Chứng từ đã post là bất biến; sửa sai bằng bút toán đảo, không sửa tại chỗ |
| Kiến trúc | Đường trả hàng đi qua `checkout-return.service.ts` (không phải saga v2); phát sự kiện Kafka cho phiếu chi / bút toán, phải giữ idempotent |
| Kế toán | `journal-return.consumer` hiện phân nhánh theo **một** `refundMethod` cho cả chứng từ — tách tiền đồng nghĩa chứng từ có thể có hai chân cùng lúc |
| UI | Chuỗi hiển thị tiếng Việt; số tiền định dạng `vi-VN` |

## Existing surface touched

- **API**: `apps/api/src/modules/pos/services/checkout-return.service.ts` (`computeTotals`,
  `wantsOffset`/`effectiveRefundMethod`, `offsetOriginalDebt`, `createReturnDebtAdjustment`,
  `validateRefundMatrix`, `fanOutEvents`), `dto/checkout-return.dto.ts`
- **Công nợ**: `modules/pos/services/invoice-debt.service.ts`, bảng `invoice_debts`,
  `debt_payments`
- **Kế toán**: `modules/accounting/consumers/journal-return.consumer.ts`,
  `publishers/{cash-refund,deposit-refund,journal-return}.publisher.ts`
- **POS FE**: `lib/page-libs/checkout/returnInvoicePayloadMapper.ts`,
  `hooks/page-hooks/checkout/use-checkout-actions.ts`, `use-checkout-payment.ts`,
  `components/.../PaymentSection/` (ô "Tính vào công nợ" — `RefundToDebtRow`)
- **Tính năng liền kề**: `return-points-net-basis` (nguồn của `returnedNet`),
  `exchange-net-positive-debt` (đường ghi nợ khi đổi hàng net>0),
  `debt-tab-collection-ledger` (tab Công nợ hiển thị các dòng này)
