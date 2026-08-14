---
feature: footer-grand-totals-pos
environments: [local-pos]
viewports: [desktop]
---

# Verification — Footer tổng toàn tập (POS)

Thư mục này **chỉ giữ bằng chứng POS**. Lý do tách khỏi `footer-grand-totals-standard`:
`verify.py` nhân chéo *mọi* bước với *mọi* environment khai ở frontmatter — không khai được
environment theo từng bước. Trộn bước backoffice và bước POS vào một file thì mỗi bên sẽ chạy nhầm
ở app kia và đỏ hết. Ticket và thiết kế vẫn nằm ở `footer-grand-totals-standard`.

## Mốc đối chiếu

`erp_dev` **thay đổi trong lúc làm** (thao tác POS, chạy kiểm thử… đều sinh hoá đơn), nên trước khi
sửa assert phải hỏi API con số hiện tại rồi đối chiếu SQL:

```sql
-- Trang mặc định lọc "Hôm nay", nên đối chiếu đúng phạm vi đó
SELECT COUNT(*), SUM(CASE WHEN type IN ('RETURN','EXCHANGE') THEN net_amount ELSE amount_due END)
FROM invoices
WHERE branch_id = '69982b87-3fda-47ae-aa27-9ad947917de6'
  AND created_at::date = CURRENT_DATE;   -- 3 phiếu đổi, tổng -215.000
```

Tập "còn trả được" của Đổi trả hàng (S2–S4) đối chiếu bằng:

```sql
SELECT COUNT(*), SUM(CASE WHEN i.type IN ('RETURN','EXCHANGE') THEN i.net_amount ELSE i.amount_due END)
FROM invoices i
WHERE i.branch_id = '69982b87-3fda-47ae-aa27-9ad947917de6'
  AND i.type = 'SALE' AND i.status IN ('paid','debt','partial_debt') AND i.is_draft = false
  AND EXISTS (SELECT 1 FROM invoice_items ii
              WHERE ii.invoice_id = i.id AND ii.quantity > ii.returned_quantity);
-- 2026-08-14: 5 hoá đơn / 24.888.000
```

Con số này **tụt dần** khi có thêm phiếu trả: mỗi lần trả hết một hoá đơn là nó rời khỏi tập
(trước đó từng là 7 / 26.117.000). Chạy lại SQL trước khi sửa assert, đừng bám số cũ.

Điểm mấu chốt: đơn RETURN/EXCHANGE mang **dấu âm** vì `computeAmountDue` clamp `amount_due` về 0 cho
phiếu hoàn. Một bản `SUM(amount_due)` ngây thơ sẽ ra **0** cho đúng tập này (và 28.927.000 cho toàn
bộ hoá đơn) — nên một con số **âm** ở footer là bằng chứng trực tiếp rằng biểu thức có dấu đang chạy,
không phải phép cộng ngây thơ.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Danh sách hóa đơn (bộ lọc mặc định "Hôm nay"): footer "Tổng tiền" = **−215.000** — âm, vì cả 3 hoá đơn hôm nay là phiếu đổi | `/invoices` | — | AC-05, AC-06 | `text=-215.000` |
| S2 | Đổi trả hàng, đổi bộ lọc sang "Toàn bộ": footer "Tổng tiền" = **24.888.000**, đúng bằng tổng SQL của 5 hoá đơn còn trả được | `/return-goods` | `click [aria-label="Lọc theo khoảng thời gian"]; click [role="option"]:has-text("Toàn bộ"); click button:has-text("Áp dụng")` | AC-09 | `text=24.888.000` |
| S3 | Cùng màn hình: thanh phân trang đọc `total` của server (5 kết quả), không còn ghim cứng 1 trang | `/return-goods` | `click [aria-label="Lọc theo khoảng thời gian"]; click [role="option"]:has-text("Toàn bộ"); click button:has-text("Áp dụng")` | AC-10 | `text=1-5/5 kết quả` |
| S4 | Lọc cột "Tổng thanh toán" ≤ 1.500.000: lưới còn 3 dòng **và** footer tụt còn 3.888.000 — footer bám tập đã lọc phía server, không phải tổng trang | `/return-goods` | `click [aria-label="Lọc theo khoảng thời gian"]; click [role="option"]:has-text("Toàn bộ"); click button:has-text("Áp dụng"); fill thead tr:nth-child(2) td:nth-child(5) input = 1500000` | AC-08, AC-09 | `text=3.888.000` |

| S5 | Lịch sử mua hàng (Thu ngân → chọn khách "Khách quen" → tab Lịch sử mua hàng): "Tổng hóa đơn: 9" và footer **13.178.000** cùng nói về một tập — trước đây FE loại dòng sau khi fetch nên hai số lệch nhau | `/` | `fill input[placeholder="(F4) SDT, tên khách hàng"] = Khách quen; wait [role="option"]; click [role="option"]:has-text("Khách quen"); click [aria-label^="Xem chi tiết khách"]; click text=Lịch sử mua hàng` | AC-13 | `text=13.178.000` |
| S6 | Cùng tab: thanh phân trang đọc `total` thật của server | `/` | `click [aria-label^="Xem chi tiết khách"]; click text=Lịch sử mua hàng` | AC-10 | `text=1-9/9 kết quả` |
| S7 | Ô lọc "Tổng thanh toán" ≤ 1.500.000 lọc theo **con số đang hiển thị**: còn 8 dòng / 2.678.000. Bản cũ lọc `inv.totalPaid` (tiền đã thu) nên đơn ghi nợ lọt qua mọi ngưỡng | `/` | `click [aria-label^="Xem chi tiết khách"]; click text=Lịch sử mua hàng; fill thead tr:nth-child(2) td:nth-child(5) input = 1500000` | AC-14 | `text=2.678.000` |

**S6/S7 phụ thuộc thứ tự**: khách đã chọn ở S5 nằm trong store phiên (zustand-persisted) nên vẫn còn
ở các bước sau — ô tìm khách biến mất, thay bằng thẻ khách đã chọn. Vì vậy S6/S7 mở dialog thẳng từ
thẻ đó. Mỗi lần chạy đều gieo lại `.ai/.auth/local-pos.json` về trạng thái chưa chọn khách, nên S5
luôn bắt đầu từ ô tìm kiếm.

## Not verified here

- Bất biến theo `limit` (AC-07) và **bất biến trang** (AC-12) — không có bề mặt UI để phân biệt
  (xem gạch đầu dòng dưới). Xác nhận bằng cách gọi thẳng API: `09-api-probe.md`, chạy lại bằng
  `python3 .ai/features/footer-grand-totals-pos/probe-totals.py` (ép `limit=2`, duyệt hết trang cho
  cả ba endpoint — 8 / 3 / 5 trang, cùng `totals`, dòng không trùng). Thêm unit test ba handler.
- **Cảnh lật trang trên UI (AC-11, AC-12)**: với cỡ trang thật (nhỏ nhất 50) và dữ liệu hiện tại
  (5 và 9 dòng) thì lưới luôn vừa một trang. Đã chụp riêng bằng một **bản vá tạm đặt cỡ trang = 1,
  revert ngay sau khi chạy**: `.ai/features/footer-grand-totals-pos-pagesize1/` — 7 bước, gồm cảnh
  lật sang trang 2 (footer không đổi) và cảnh đang ở trang cuối rồi đổi bộ lọc → về trang 1. Sau khi
  revert đã chạy lại đủ 7 bước ở thư mục này, vẫn xanh.
- **Dòng có trạng thái ngoài bảng nhãn (AC-15)**: sau khi whitelist trạng thái xuống server, tập trả
  về đúng bằng 4 trạng thái mà `STATUS_MAP` có nhãn ⇒ nhánh `status = null` không dựng được bằng dữ
  liệu thật. Vẫn giữ nhánh render `—` để nếu whitelist nới ra thì dòng **hiện**, thay vì biến mất im
  lặng như trước.

## Notes

- **Phiên POS phải gieo sẵn chi nhánh HCM.** `post_login` trong `.ai/aidlc.yaml` bấm radio chi nhánh
  **đầu tiên** ("Chi nhánh kiểm thử", không có dữ liệu). Không sửa file config dùng chung — thay vào
  đó gieo phiên trước mỗi lần chạy: login → `switch-branch` → ghi `refresh_token`, `access_token` và
  khoá `pos-branch` (zustand-persisted, chứa `branchId`) vào `.ai/.auth/local-pos.json`.
  Refresh token xoay vòng mỗi lần dùng nên phải gieo lại trước *mỗi* lần chạy.
- POS lưu `access_token` trong localStorage (khác backoffice giữ trong bộ nhớ), nên phải gieo cả hai.
