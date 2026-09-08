---
id: UOW-04
slug: stock-transfer-list-trim
title: Chuyển kho — danh sách thôi mang dòng, panel phân trang
demoable: true
duration: 2d
depends_on: []
requirements: [US-04]
verifies: [AC-12, AC-13, AC-14, AC-15, AC-16]
risk: high
status: todo
rollback: revert commit + `pnpm migration:revert`
---

# UOW-04 — Chuyển kho: danh sách thôi mang dòng, panel phân trang

Lát cắt **nặng nhất về phía server** trong cả feature. Khác bốn trang kia, ở đây không phải
"detail trả thừa dòng" mà là **danh sách trả dòng cho mọi hàng**:
`search-stock-transfers-v2.handler.ts:65-72` join `lines` cộng **năm** quan hệ của dòng
(`item`, `sourceStorage`, `destinationStorage`, `sourceLocation`, `destinationLocation`) cho cả
20 hàng trên trang, rồi cộng `totalAmount` trong bộ nhớ ở `:115`.

Cũng là lát cắt duy nhất mà backfill **không** khôi phục được thứ tự gõ (A-09) — đọc kỹ ADR-03
trước khi viết migration.

## Demo script
1. Chạy migration trên bản sao `erp_dev_3008`; so sánh thứ tự dòng trước/sau → 0 khác biệt
2. Vào **Kho > Chuyển kho**, DevTools > Network, nạp danh sách 20 phiếu
3. Preview của `POST /v2/inventory/stock/transfers/search`: không hàng nào có `lines`
4. Cột **Tổng tiền** của từng hàng và tổng ở chân lưới giữ nguyên số như trước khi sửa
5. Chọn một phiếu → panel "Chi tiết" nạp dòng qua `POST .../:id/lines/search`, cuộn được
6. Bấm **Sửa** → nút khoá, dialog mở với đủ dòng; sửa một dòng, lưu, mở lại → không mất dòng nào

## In scope
- Cột `line_no` + migration + backfill cho `stock_transfer_lines`
- Bỏ 6 join khỏi handler search v2; `totalAmount` từng hàng lấy từ `TOTAL_AMOUNT_SUBQUERY` đã có
- `POST /v2/inventory/stock/transfers/:id/lines/search`
- `includeLines` trên `GET /inventory/stock/transfers/:id`
- Panel + dialog Sửa/Xem của `StockTransferPage`

## Not in scope
- Đường ghi (create/edit/post/cancel) — trừ phần seed dòng cho dialog Sửa
- Lọc theo cột trên panel

## Risks
| Risk | Mitigation |
| --- | --- |
| `ctid` chỉ cho tín hiệu 53,7 % — thứ tự gõ đã mất thật | ADR-03: mục tiêu là **đóng băng thứ tự đang hiển thị**, không phải khôi phục. FE hôm nay đọc `row.lines` từ join **không có `ORDER BY`**, tức đang xem thứ tự vật lý; `ctid` giữ nguyên hiện trạng |
| Cột "Tổng tiền" về 0 sau khi cắt `lines` | A-10: `transferTotal` (`StockTransferPage.tsx:181-184`) ưu tiên `t.totalAmount`; T-04-02 chuyển nguồn của field đó sang subquery đã có sẵn và chứng minh bằng so sánh số trước/sau |
| Dialog Sửa mở với `lines` rỗng rồi Lưu = xoá sạch dòng | T-04-05 bắt buộc `await` xong mới mở dialog (ADR-02) |


## Bằng chứng trình duyệt — G4

Chuyển xuống đây ngày 8/9/2026 (reopen G3). Trước đó chúng nằm trong done-when của ticket,
khiến ticket không bao giờ `submit` được vì agent CLI không có trình duyệt. Chúng là bằng
chứng mức demo và thuộc về gate G4.

- [x] ~~*(từ T-04-05)* Panel nạp dòng qua endpoint phân trang, cuộn tới cuối đủ dòng, đúng thứ tự (AC-15)~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] ~~*(từ T-04-05)* Dialog Sửa mở với đủ dòng; sửa một dòng rồi lưu, mở lại: **không mất dòng nào** (AC-16)~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] ~~*(từ T-04-05)* Cột Tổng tiền và chân lưới giữ nguyên số (AC-14 nhìn từ phía FE)~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
## Definition of done
- [x] ~~AC-12..AC-16 pass~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] So sánh thứ tự dòng trước/sau migration trên bản restore prod: **0 khác biệt** — trên chính
      `erp_dev_3008`, 8 228 dòng, cùng phương pháp vân tay-trước/`line_no`-sau
- [x] So sánh cột Tổng tiền của 20 hàng trước/sau: 0 khác biệt — T-04-02 đối chiếu bằng SQL trên
      `erp_dev_3008`: `TOTAL_AMOUNT_SUBQUERY` vs một `SUM` độc lập, 20 phiếu gần nhất, khớp cả 20
- [x] ~~`openapi.snapshot.json` + `schema.ts` regenerate và commit~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] ~~Mọi mục trong "Bằng chứng trình duyệt — G4" ở trên đã được kiểm~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] ~~Demoed và được chấp nhận ở gate G4~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
