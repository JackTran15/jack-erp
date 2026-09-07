---
id: UOW-06
slug: loc-dong-phia-server
title: Lưới dòng lọc phía server ở chế độ xem, và gỡ GET /:id/lines
demoable: true
duration: 1.5d
depends_on: [UOW-05]
requirements: [US-04]
verifies: [AC-11, AC-14, AC-15, AC-16]
risk: high
status: todo
rollback: hoàn tác các commit của UoW này; endpoint mới của UOW-05 nằm lại không ai gọi, `GET /:id/lines` sống lại cùng commit vì nó bị xoá trong chính UoW này.
---

# UOW-06 — Lưới dòng lọc phía server, và gỡ endpoint cũ

## Why this slice exists

Đây là slice trả lại thứ mà UOW-02 và UOW-03 vô tình lấy đi: ô lọc trên header lưới tìm
trên **cả phiếu**. Trước khi phân trang nó làm được điều đó miễn phí, vì lưới nhận cả
phiếu (A-19).

Rủi ro **high** vì slice này chạm ba thứ cùng lúc: thư viện dùng chung `packages/ui`, hai
file dialog lớn nhất repo, và việc xoá một endpoint đang chạy. Cái nguy hiểm nhất không
phải chỗ nào trong ba cái đó mà là **ranh giới giữa chế độ xem và chế độ soạn**: ở chế độ
có kiểm soát, `rowIndex` mà lưới trả về là chỉ số trong mảng **đã lọc**. Ở chế độ xem lưới
chỉ đọc nên vô hại; nếu chế độ sửa bị kéo sang chế độ có kiểm soát cùng lúc thì người dùng
lọc rồi xoá một dòng sẽ **xoá nhầm dòng khác** — mất dữ liệu, không phải hiển thị sai.

## Demo script

1. Mở dialog xem chi tiết một phiếu **xuất** ≥ 200 dòng. Ghi lại mã SKU của một mặt hàng
   chỉ xuất hiện ở trang cuối.
2. Về trang 1, gõ mã đó vào ô lọc cột **Mã SKU** → lưới hiện đúng dòng đó, thanh phân
   trang báo tổng 1 dòng.
3. Tab Network: có một `POST .../lines/search` mang điều kiện lọc trong body; không có
   request nào tải cả phiếu.
4. Chân lưới lúc đó hiện Số dòng 1 và số tiền của riêng dòng đó, không phải tổng phiếu.
5. Xoá ô lọc → quay lại 200 dòng, trang 1, tổng phiếu.
6. Header lưới: cột **Kho**, **Vị trí**, **Đơn vị tính** không gõ được vào ô lọc.
7. Lặp bước 1–6 với dialog phiếu **nhập**.
8. Mở dialog phiếu xuất ở chế độ **sửa**, gõ vào ô lọc → lưới lọc ngay, **không** có
   request nào. Xoá một dòng đang lọc → đúng dòng đó biến mất; xoá ô lọc, các dòng khác
   còn nguyên. Lưu, mở lại, đối chiếu.
9. Trên trang danh sách phiếu xuất, mở panel chi tiết cuộn vô hạn, cuộn tới cuối phiếu →
   vẫn tải tiếp bình thường trên endpoint mới.
10. `grep -rn "/lines\"" apps packages` → không còn chỗ nào gọi `GET /:id/lines`.

## In scope

- Cờ `filterable` trên `LineColumn` ở `packages/ui`, và sửa comment "totals are
  document-wide" cho khỏi nói dối người đọc sau (ADR-08).
- Hai dialog: lọc có kiểm soát ở chế độ xem, debounce, reset trang, đọc `POST lines/search`,
  chân lưới theo tập lọc.
- Panel chi tiết cuộn vô hạn `GoodsIssuePage.tsx:879` chuyển sang endpoint mới.
- Xoá `GET /:id/lines` ở hai controller và `getLines` ở hai service.
- `pnpm openapi:generate`, commit snapshot và schema sinh ra.
- Test hồi quy cho chế độ tạo và sửa.

## Not in scope

- Lọc phía server cho chế độ tạo và sửa (A-15, AC-16).
- Lọc theo Kho / Vị trí / ĐVT.
- Sắp xếp theo cột.
- Tách nhỏ hai file dialog.

## Risks

| Risk | Mitigation |
| --- | --- |
| Chế độ sửa bị kéo sang lọc có kiểm soát → xoá nhầm dòng, mất dữ liệu | T-06-02/T-06-03 chỉ truyền `filters`/`onFilterChange` khi `isView`; T-06-05 kiểm đúng vòng lọc-rồi-xoá-rồi-lưu ở chế độ sửa |
| Gõ một ký tự bắn một request | Debounce trước khi vào `queryKey`; T-06-02 khẳng định bằng tab Network |
| Đổi lọc khi đang ở trang 5 → hiện trang rỗng | Reset `page` về 1 mỗi khi bộ lọc đổi |
| Xoá endpoint còn sót consumer | T-06-04 grep toàn repo, không tin danh sách hai consumer trong tài liệu |
| Cờ `filterable` phá lưới khác đang dùng `LineItemGrid` | Mặc định `true`, cộng thêm chứ không đổi hành vi; T-06-01 liệt kê mọi nơi dùng `LineItemGrid` và xác nhận không nơi nào đổi |
| Chân lưới lệch tổng tiền đầu phiếu bị báo là bug | ADR-08 là chủ ý; giao diện phải cho thấy lưới đang lọc — T-06-02 quyết định cách thể hiện và ghi vào bằng chứng G4 |

## Definition of done

- [x] AC-11, AC-14, AC-15, AC-16 pass
- [x] Chạy đủ trên **cả hai** loại, nhưng trên phiếu **120 và 118 dòng**, không phải ≥ 200: chi nhánh KHO SG của `prod_3008` không có phiếu nào còn hiệu lực đạt mức đó (phiếu 120 dòng lớn nhất bên nhập thì `CANCELLED`). Vẫn là 3 trang, tức vẫn kiểm được điều cần kiểm
- [x] Route, `getLines` và hai interface `LinesPage` đã gỡ; grep toàn repo không còn caller; `/docs-json` không còn hai đường dẫn cũ
- [x] Đã tái sinh, hai route cũ biến mất khỏi snapshot. **Chưa commit** — như UOW-02
- [x] Lọc / xoá dòng khi đang lọc / xoá bộ lọc: kiểm tay ở T-06-05, chứng minh bằng số học chân lưới. Bước **lưu khi đang lọc không chạy live** (không ghi đè chứng từ POSTED trong snapshot prod); chứng minh tĩnh: đường Lưu đọc `getPersistableFormLines(lines)`, không đọc `gridRows`
- [x] Demoed và được chấp nhận ở gate G4 — Akenzy, 2026-09-03
