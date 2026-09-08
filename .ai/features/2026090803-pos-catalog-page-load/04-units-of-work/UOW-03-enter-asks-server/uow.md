---
id: UOW-03
slug: enter-asks-server
title: Enter và dialog biến thể hỏi server thay vì lọc mảng client
demoable: true
duration: 1d
depends_on: []
requirements: [US-03]
verifies: [AC-08, AC-09, AC-10]
risk: medium
status: todo
rollback: revert 1 commit FE — hai hàm quay lại đọc `filteredProducts`; `useCheckoutCatalog` vẫn còn trả nó cho tới UOW-04
---

# UOW-03 — Enter hỏi server

## Demo script
1. POS `:3001`, chi nhánh Cà Mau, ô tìm F3.
2. Gõ `ABA2777-D-38` (khớp đúng 1) rồi Enter → hàng vào giỏ, ô tìm xoá (AC-08).
3. Gõ `zzzz-khong-ton-tai` rồi Enter → "Không tìm thấy hàng hoá" (AC-09).
4. Gõ `ABA` rồi Enter → "Nhiều kết quả — chọn hàng bên dưới hoặc thu hẹp từ khóa." (AC-09).
5. DevTools: mỗi lần Enter phát **đúng 2** request `/catalog/search` — một `mode=exact`
   (tra mã tuyệt đối) rồi một `view=suggest&limit=2` (đếm khớp mờ). Không có
   `GET /catalog`.
6. Chuỗi khớp 1 mặt hàng thuộc product có biến thể → `openForQuery` mở dialog đúng
   product (AC-10).

## In scope
- `addProductByQuery` và `openForQuery` chuyển sang hỏi server.
- Xoá `addProductByCatalogCard` + `handleCatalogSelect` (ADR-05).

## Not in scope
- Gỡ `useCatalogQuery` (UOW-04). Sau UoW này `filteredProducts` không còn consumer,
  nhưng việc gỡ nó và gỡ query nằm ở UOW-04 để rollback từng lớp được.

## Risks
| Risk | Mitigation |
|---|---|
| Hai hàm này đang **đồng bộ**; đổi sang async làm caller không chờ | `handleSubmitQuery` đã là `void tryAutoAdd(q).then(...)`, tức là caller vốn quen với async. Done-when kiểm cả ba nhánh chạy đúng thứ tự |
| Ngữ nghĩa khớp rộng hơn → chuỗi trước khớp 1 nay khớp 2, thu ngân mất đường thêm nhanh | ADR-03: chấp nhận có chủ ý, và là sửa bất nhất (dropdown ngay trên đã dùng luật server). Demo bước 2 và 4 chốt hành vi mới |
| Enter phát thêm 1 request nữa (tổng 2) — có vẻ đi ngược feature trước | Đúng, và **chỉ** khi `mode=exact` trượt. Feature trước cắt từ 2 xuống 1 cho **mỗi lần gõ**; Enter là sự kiện hiếm, và request thứ hai thay cho việc tải sẵn 3 835 kB. Ghi rõ để không ai đọc nhầm là hồi quy |

## Definition of done
- [x] AC-08 pass (UI). AC-09 kiểm ở endpoint, **chưa nhìn lại toast trên UI**. **AC-10 KHÔNG demo được** — `openForQuery` không có caller nào trong app (lỗi lập kế hoạch của tôi, xem T-03-02)
- [x] `addProductByCatalogCard` và `handleCatalogSelect` đã xoá; `grep` không còn
- [x] `grep filteredProducts` không còn consumer nào ngoài `use-checkout-catalog.ts`
- [x] `tsc --noEmit` sạch, `npx vitest run` không dài thêm dòng đỏ
- [x] Demoed và accepted ở G4
