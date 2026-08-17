---
feature: return-points-net-basis
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | **Cả hai** công thức điểm khi trả hàng chuyển sang cơ sở ròng: `computeReverseBase` (điểm bị trừ) và `computeRedeemedCreditBack` (điểm hoàn lại) | high | yes | Nếu chỉ sửa một thì phiếu trả vẫn còn hai cơ sở tiền khác nhau — đúng cái triệu chứng đang chữa, chỉ đổi chỗ | confirmed | Akenzy chọn "Sửa cả hai về returnedNet" 2026-08-14. Lưu ý đã nêu trước khi chọn: `computeRedeemedCreditBack` hiện hoàn **dư** điểm cho khách, sửa xong sẽ hoàn **ít** hơn hiện tại |
| A-02 | Không sửa lại điểm đã trừ/hoàn sai của các phiếu trả cũ; chỉ đúng từ nay về sau | high | yes | Khách đã bị trừ dư giữ nguyên số dư sai, không có đường đối soát tự động | confirmed | Akenzy chọn "Không sửa lịch sử" 2026-08-14, cùng tiền lệ `A-04` của `promotion-qa-defects` |
| A-03 | Cặp số "49 điểm thay vì 46" trong báo cáo hiện trường **không tái dựng được** trên DB dev: DB chỉ có một phiếu trả (`RTN-202607-00024`, 895.000₫, không dính khuyến mại) và mọi hoá đơn KM đang có (`INV-202608-00006..11`) đều giảm giá **đều tay** — mà KM đều tay thì tỷ lệ gộp bằng tỷ lệ ròng và lỗi không biểu hiện. Cơ chế đã xác nhận đúng bằng đọc code + đối chiếu số thật; con số 49/46 phụ thuộc hoá đơn cụ thể của người báo | medium | no | Chỉ ảnh hưởng cách viết test tái hiện. Test phải **cố ý dựng** hoá đơn KM không đều tay, không lấy hoá đơn KM có sẵn | pending | — |
| A-04 | Với hoá đơn v1 (mọi `invoice_items.promotion_discount = 0`) cơ sở ròng **thoái về đúng** cơ sở gộp hiện hành, nên hành vi không đổi và test cũ phải vẫn xanh | high | no | Nếu sai thì đây là thay đổi hành vi trên toàn bộ hoá đơn cũ, không phải một bản vá | pending | — |
| A-05 | Trả nhanh (QUICK, `originalInvoice = null`) giữ nguyên nhánh thoái lui hiện có — không có hoá đơn gốc thì không có gì để prorate, và `computeReturnedNet` đã trả thẳng `returnSubtotal` cho case này | high | no | Chia cho 0 hoặc trừ 0 điểm ở luồng trả nhanh | pending | — |
| A-06 | `originalInvoice.amountDue` là mẫu số đúng cho cả hai công thức, vì `Σ netLine − headerResidual = amountDue` theo đúng định nghĩa `amountDue = subtotal − discountAmount − pointsDiscountAmount − depositAmount`. Hệ quả: `reverseBase` rút gọn thành **chính `returnedNet`** | high | no | Nếu đẳng thức không đúng trong một trường hợp biên nào đó thì trả toàn bộ hoá đơn sẽ không đảo đúng `pointsEarned` — bất biến ở `02-requirements.md` sẽ bắt được | pending | — |
| A-07 | Hoá đơn có `amountDue = 0` (tiêu điểm trả hết, ví dụ có thật `INV-202608-00010`: subtotal 750.000, KM 150.000, điểm 600.000, `amount_due = 0`) là trường hợp biên bắt buộc phải chặn chia-cho-0 trong `computeRedeemedCreditBack` | high | no | Chia cho 0 → `NaN` điểm ghi vào thẻ khách. Đây là hoá đơn thật đang nằm trong DB, không phải giả thiết | pending | — |
| A-08 | Bộ test hiện có khoá hành vi gộp ở một số case (`checkout-return.service.spec.ts:1247` khẳng định proration trên `returnSubtotal`). Những case đó phải được **đọc và sửa có chủ đích**, không sửa cho xanh | high | no | Sửa bừa test là cách đánh mất chính bất biến feature này dựng lên | pending | — |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
|----|----------------|----------------------|-------------|
| A-R1 | Lỗi biểu hiện trên mọi phiếu trả có khuyến mại | Chỉ biểu hiện khi trả **một phần** của hoá đơn có khuyến mại **không đều tay** giữa các dòng. Trả toàn bộ luôn đúng (tỷ lệ = 1). KM đều tay luôn đúng (tỷ lệ gộp = tỷ lệ ròng) | Test tái hiện phải dựng hoá đơn hai dòng, một dòng KM một dòng không. Lấy hoá đơn KM có sẵn trên dev sẽ cho kết quả **xanh giả** và kết luận "không có lỗi" |
| A-R2 | `computeReverseBase` sai ở mọi trường hợp nên thay thẳng bằng `returnedNet` là đủ | Đúng là rút gọn được thành `returnedNet`, nhưng **chỉ khi có hoá đơn gốc**. Nhánh không có hoá đơn gốc (`Math.abs(refundedAmount \|\| returnSubtotal)`) là đường sống của trả nhanh và phải giữ | Ticket sửa phải giữ hai nhánh, không rút gọn hàm xuống một dòng |
| A-R3 | Có thể lấy con số 49/46 của báo cáo làm acceptance criterion | Không dựng lại được từ code và dữ liệu dev (xem A-03); ép số vào AC là bịa | AC viết theo **bất biến** (tổng điểm trừ của các phiếu trả từng phần = `points_earned`) cộng một hoá đơn tái hiện tự dựng có số tự kiểm chứng được |
