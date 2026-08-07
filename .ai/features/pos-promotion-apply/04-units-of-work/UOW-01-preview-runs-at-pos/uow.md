---
id: UOW-01
slug: preview-runs-at-pos
title: Thu ngân thấy tiền giảm ngay khi thêm hàng vào giỏ
demoable: true
duration: 1.5d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04]
risk: medium
status: todo
rollback: cờ `VITE_CHECKOUT_V2` off → panel quay về không hiển thị khối khuyến mại; không có dữ liệu nào đã ghi cần dọn
---

# UOW-01 — Thu ngân thấy tiền giảm ngay khi thêm hàng vào giỏ

Lát cắt nền: nối `POST /v2/promotions/evaluate` vào POS và hiển thị con số. Chưa có dialog
chọn CTKM, chưa có voucher, chưa có quà — chỉ CTKM `auto_apply=true` (vốn đã chạy server-side)
nay **hiện ra trước mắt thu ngân trước khi bấm Thu tiền**, thay vì chỉ biết sau khi chốt đơn.

Rủi ro thật nằm ở ticket đầu: role `STAFF` hiện không có quyền gọi `evaluate` (A-05), nên nếu
làm phần FE trước thì demo sẽ 403 và mất thời gian truy nhầm hướng.

## Demo script

1. Đăng nhập POS bằng tài khoản role **Nhân viên** (`STAFF`), không phải admin — đây là điểm
   mấu chốt, demo bằng admin sẽ giấu mất lỗi quyền
2. Chọn chi nhánh, mở màn Bán hàng
3. Thêm SKU đang có CTKM `auto_apply=true` (ví dụ giá gốc 1.495.000, CTKM giảm 30%)
4. Quan sát panel phải: khối khuyến mại hiện "Khuyến mại 448.500", còn phải thu 1.046.500 —
   **trước khi** bấm bất kỳ nút nào
5. Quét liên tiếp 5 mã trong 1 giây; mở DevTools → Network, đếm số lời gọi `evaluate`: ≤ 2
6. Chặn `/v2/promotions/evaluate` trong DevTools (block request URL), thêm một mặt hàng nữa:
   panel hiện "Chưa tính được khuyến mại", nút **Thu tiền vẫn bấm được** và chốt đơn thành công
7. Xoá hết hàng khỏi giỏ: Network không phát thêm lời gọi `evaluate` nào

## In scope

- Đường đọc đầu-cuối: quyền RBAC → `evaluate` → service FE → hook debounce/abort → slice
  store → hiển thị ở panel, đủ 4 trạng thái (đang tính, có số, không tính được, giỏ rỗng)

## Not in scope

- Dialog chọn CTKM và lý do bị bỏ qua (UOW-02)
- Voucher (UOW-03), đổi CTKM thắng (UOW-04), quà (UOW-05), giảm giá tay (UOW-06)
- Forward trường nào lên `POST /v2/pos/checkout` — UOW-01 thuần đọc

## Risks

| Risk                                                                          | Mitigation                                                                                              |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `PermissionGuard` có thể chưa hỗ trợ "một trong nhiều key" (ADR-05)           | T-01-01 là spike đọc guard trước; nếu chưa hỗ trợ thì T-01-02 gánh thêm phần sửa guard, không phát sinh UoW mới |
| Debounce sai chỗ khiến kết quả về trễ ghi đè kết quả mới                      | T-01-04 bắt buộc dùng AbortController, và bước 5 của Demo script kiểm đúng triệu chứng đó                  |
| Sửa seed quyền đụng tất cả tổ chức đang chạy                                  | Chỉ **thêm** key vào `STAFF_PERMISSION_KEYS`, không sửa/bỏ key nào có sẵn; T-01-02 nêu rõ                  |

## Definition of done

- [x] AC-01..AC-04 pass theo Demo script
- [x] Demo chạy bằng tài khoản role `STAFF`, không phải admin
- [x] Bốn trạng thái hiển thị: đang tính, có số, không tính được, giỏ rỗng
- [x] `pnpm --filter @erp/api test` xanh; `tsc --noEmit` của `pos-web` sạch (ADR-06)
- [ ] Demoed và accepted ở gate G4 — 4 mục kỹ thuật trên đã tự click-through xong (07/08/2026,
      xem "Click-through" ở từng ticket T-01-04/05/06); mục này để ngỏ cho người chấp nhận thật

## Click-through summary (07/08/2026)

Tài khoản `staff-hn@erp.local` (role Nhân viên/STAFF), chi nhánh Hà Nội, org
`f1000000-0000-4000-8000-000000000001`. CTKM tạm `KM000006` (ITEM_DISCOUNT 30%, item
`AK0021-D-35`) vì hai CTKM có sẵn trong `erp_dev` đã hết hạn 04→05/08 — **nên xoá `KM000006`
sau khi feature này DONE thật**, đây là dữ liệu test.

1. Đăng nhập STAFF, chọn chi nhánh Hà Nội — OK, không bị 403 ở bất kỳ bước nào.
2. Thêm `AK0021-D-35` (1.250.000): panel hiện "Khuyến mại -375.000", "Còn phải thu" 875.000 —
   trước khi bấm nút nào, khớp AC-01.
3. Sửa SL 5 lần liên tiếp trong batch < 1s: đúng 1 lời gọi `evaluate`, kết quả khớp SL cuối —
   AC-02.
4. Monkey-patch `fetch` chặn `/promotions/evaluate` (không có nút "block URL" trong bộ công cụ
   trình duyệt đang dùng): panel về "Chưa tính được khuyến mại", Thu tiền vẫn bấm được, hoá đơn
   chốt thành công (`INV-202608-00003`, `POST /invoices/:id/checkout` → 201) — AC-03.
5. Xoá hết giỏ: không dòng khuyến mại, không request nào phát thêm — AC-04.
