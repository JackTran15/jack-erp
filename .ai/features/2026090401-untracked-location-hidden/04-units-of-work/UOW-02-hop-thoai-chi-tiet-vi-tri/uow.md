---
id: UOW-02
slug: hop-thoai-chi-tiet-vi-tri
title: Hộp thoại chi tiết vị trí chỉ hiện hàng đang theo dõi, kèm lối xem lại
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-06, AC-07, AC-08, AC-09, AC-10, AC-14]
risk: medium
status: todo
rollback: revert code — tham số `isTracked` là tuỳ chọn, bỏ trống = hành vi cũ, nên caller cũ không đổi
---

# UOW-02 — Hộp thoại chi tiết vị trí

Lát này mang **hợp đồng API mới** của cả feature, nên UOW-03 phụ thuộc vào nó. Nó cũng là lát duy
nhất có phần dựng UI mới.

`GET /inventory/locations/:locationId/stock-items` không biết tới `is_tracked`: `buildWhere`
(`inventory-location-stock.service.ts:474-546`) lọc mã / tên / ĐVT / nhóm / barcode / `isActive` /
`isPosVisible` — hết. Nên mở một vị trí ra vẫn thấy đủ mã đã ngừng theo dõi.

Cái khó của lát này không phải bộ lọc mà là **giữ lại lối thoát**. Akenzy chốt 04/09/2026 (A-05):
ẩn mặc định, nhưng phải xem lại được — vì chính hộp thoại này có nút xoá dòng
(`LocationStockItemsDialog.tsx:180-190`), và ẩn hẳn là lặng lẽ lấy mất một đường dọn dữ liệu.
Ba trạng thái, một tham số boolean tuỳ chọn: `true` / `false` / không gửi (ADR-01).

`depends_on: [UOW-01]` là phụ thuộc **demo**, không phải phụ thuộc mã: demo của lát này bắt đầu
bằng "bấm vào một vị trí đang hiển thị Chưa xếp", và câu đó chỉ có nghĩa sau UOW-01. Hai lát chạm
hai file backend khác nhau, không xung đột.

## Demo script

1. Ở "Vị trí hàng hoá", bấm vào vị trí L (đang hiển thị "Chưa xếp" nhờ UOW-01) → hộp thoại chi tiết
   mở ra **rỗng**, phân trang báo 0 bản ghi (AC-06).
2. Đổi bộ lọc trạng thái sang **"Ngừng theo dõi"** → thấy lại đúng các mã vừa ngừng (AC-07).
3. Bấm nút xoá trên một dòng đã ngừng → xoá được, đúng như trước (AC-07).
4. Đổi sang **"Tất cả"** → thấy đủ cả hai loại (AC-08).
5. Mở vị trí N có 60 dòng đang theo dõi + 40 đã ngừng, pageSize 50 → trang 1 đúng **50** dòng,
   tổng **60**, trang 2 đúng **10** (AC-09). Đây là phép kiểm rằng lọc chạy trong SQL chứ không
   sau phân trang.
6. Lọc "dưới định mức" ở trạng thái mặc định → dòng đã ngừng nằm dưới min_qty **không** xuất hiện
   (AC-10).
7. Gọi endpoint bằng curl **không** kèm `isTracked` → trả cả hai loại, y như trước (AC-14).

## In scope

- `isTracked?: boolean` trên `StockByLocationQueryDto` (tuỳ chọn, bỏ trống = tất cả) và vị từ
  tương ứng trong `buildWhere`.
- `isTracked` trong `StockByLocationItemDto` (Swagger) + sinh lại `packages/api-client`.
- Bộ lọc trạng thái ba trạng thái trong `LocationStockItemsDialog`, mặc định "Đang theo dõi".

## Not in scope

- Chế độ xem một vị trí của trang "Chi tiết vị trí" (UOW-03) — dùng chung endpoint này nhưng là
  màn hình khác, state khác.
- Chế độ chung của trang "Chi tiết vị trí" — đã đúng sẵn (A-11), không đụng.
- Xoá dữ liệu khi Ngừng theo dõi (A-04).

## Risks

| Risk | Mitigation |
|------|------------|
| FE gửi `isTracked` trước khi DTO khai ⇒ 400 `forbidNonWhitelisted`, verify cho **đỏ giả** (A-10) | `depends_on: [T-02-01]` trên T-02-03; Definition of done bắt buộc build lại API trước khi verify |
| Nhánh `BELOW_MIN` đi đường riêng và lọt dòng đã ngừng | Đã xác minh nó dùng chung `where` (A-08); T-02-01 có test riêng cho nhánh này |
| Lọc ở React cho nhanh ⇒ trang thiếu dòng, tổng sai | ADR-03; AC-09 là phép kiểm 60/40/pageSize 50 bắt đúng lỗi này |
| Hộp thoại không dùng TanStack Query mà tự `useState` + `apiClient` | Bộ lọc mới phải vào mảng phụ thuộc của `load` và reset `page` về 1 — ghi rõ trong T-02-03 |

## Definition of done

- [x] AC-06..AC-10 và AC-14 pass
- [x] `pnpm --filter @erp/api test` xanh
- [x] `pnpm openapi:generate` đã chạy; `packages/api-client/src/generated/schema.ts` và
      `packages/api-client/openapi.snapshot.json` được commit, không sửa tay
- [x] **API đã `pnpm build` và khởi động lại** trước khi chụp ảnh verify (A-10)
- [x] Không có file migration mới trong diff
- [x] Demoed và accepted ở G4
