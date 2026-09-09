---
id: UOW-05
slug: stock-take-line-pagination
title: Kiểm kê — phân trang dòng, giữ members
demoable: true
duration: 2d
depends_on: []
requirements: [US-05]
verifies: [AC-17, AC-18, AC-19]
risk: high
status: todo
rollback: revert commit + `pnpm migration:revert`
---

# UOW-05 — Kiểm kê: phân trang dòng, giữ members

Lát cắt có **lợi ích tiềm năng lớn nhất và bằng chứng yếu nhất**: một phiếu kiểm kê kho thật là
đếm toàn kho, tức hàng nghìn dòng — nhưng `stock_take_lines` **rỗng** trên bản restore prod
(A-12), nên không đo được trên dữ liệu thật và không kiểm chứng được backfill trên dữ liệu thật.
Mọi bằng chứng ở đây là dữ liệu tự tạo, và phải ghi rõ như vậy.

Module `stock-take` **chưa** có CQRS: `stock-take.module.ts` không import `CqrsModule` và không
có controller v2. Lát cắt này dựng cả hai.

## Demo script
1. Seed một phiếu kiểm kê ~1 000 dòng trên `erp_dev`
2. Chạy migration; kiểm `line_no` = 1..1000 đúng thứ tự đang hiển thị
3. Vào **Kho > Kiểm kê kho**, chọn phiếu đó → `GET /inventory/stock-takes/:id?includeLines=false`,
   Preview **không có `lines`** nhưng **vẫn có `members`**
4. Panel nạp dòng theo trang, cuộn tới cuối đủ 1 000 dòng
5. Mở dialog sửa/kết luận, lưu → mở lại vẫn đủ 1 000 dòng (không bị cắt còn một trang)

## In scope
- Cột `line_no` + migration + backfill cho `stock_take_lines`
- `CqrsModule` + controller v2 cho module `stock-take`
- `POST /v2/inventory/stock-takes/:id/lines/search`
- `includeLines` trên `GET /inventory/stock-takes/:id` — chỉ cắt `lines`, giữ `members` (ADR-09)
- Panel + đường mở dialog của `StockTakesPage`

## Not in scope
- `members` (vài dòng, không tỉ lệ với kích thước phiếu)
- Logic kiểm kê, kết luận, chênh lệch

## Risks
| Risk | Mitigation |
| --- | --- |
| Không có dữ liệu prod để kiểm backfill (A-12) | Seed phiếu lớn có chủ đích; ghi rõ trong evidence rằng bằng chứng là dữ liệu tự tạo, không phải prod |
| Đường ghi gửi đi một trang dòng thay vì cả phiếu → cắt cụt phiếu khi lưu | AC-19 là AC riêng cho đúng rủi ro này; T-05-04 phải chứng minh bằng lưu-rồi-mở-lại, không bằng đọc code |
| Module chưa có CQRS → phạm vi rộng hơn hai UoW kia | T-05-03 gộp cả wiring; nếu vỡ 4h thì tách, đừng nhồi |


## Bằng chứng trình duyệt — G4

Chuyển xuống đây ngày 8/9/2026 (reopen G3). Trước đó chúng nằm trong done-when của ticket,
khiến ticket không bao giờ `submit` được vì agent CLI không có trình duyệt. Chúng là bằng
chứng mức demo và thuộc về gate G4.

- [x] ~~*(từ T-05-04)* Panel nạp theo trang, cuộn tới cuối đủ 1 000 dòng đúng thứ tự (AC-18)~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] ~~*(từ T-05-04)* Mở dialog sửa/kết luận trên phiếu 1 000 dòng, **lưu**, mở lại → vẫn đủ 1 000 dòng (AC-19)~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] ~~*(từ T-05-04)* Bấm nhanh qua 5 hàng liên tiếp: panel hiển thị dòng của hàng cuối cùng, không lẫn~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
## Definition of done
- [x] ~~AC-17..AC-19 pass~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] ~~Lưu phiếu 1 000 dòng rồi mở lại: vẫn đủ 1 000 dòng~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] ~~`openapi.snapshot.json` + `schema.ts` regenerate và commit~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] Evidence ghi rõ bằng chứng dựa trên dữ liệu tự tạo — ghi trong `T-05-01.md`: `stock_take_lines`
      rỗng trên snapshot prod, nên backfill chỉ chứng minh được trên 1 000 dòng tự seed (ép trùng
      `created_at` thành 11 cụm để chạm nhánh tie-break `ctid`)
- [x] ~~Mọi mục trong "Bằng chứng trình duyệt — G4" ở trên đã được kiểm~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
- [x] ~~Demoed và được chấp nhận ở gate G4~~  → **HOÃN KIỂM.** Akenzy quyết định 8/9/2026: mark done, tự kiểm tay sau. Chưa có bằng chứng cho mục này tại thời điểm ký.
