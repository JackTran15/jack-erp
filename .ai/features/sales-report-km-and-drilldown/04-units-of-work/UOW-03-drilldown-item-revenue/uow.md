---
id: UOW-03
slug: drilldown-item-revenue
title: Click ô Tên hàng hoá mở chi tiết doanh thu theo hoá đơn của SKU đó
demoable: true
duration: 1d
depends_on: [UOW-02]
requirements: [US-03]
verifies: [AC-10, AC-11, AC-12]
risk: low
status: todo
rollback: revert bốn commit; `filters.sku` biến mất khỏi DTO (field optional, không client nào gửi sau khi FE revert), mục registry `itemName` biến mất nên ô trở lại text thường. Cần chạy lại `pnpm openapi:generate` sau khi revert để api-client khớp DTO.
---

# UOW-03 — Click ô Tên hàng hoá mở chi tiết doanh thu theo hoá đơn của SKU đó

## Demo script
1. `make dev-api` + `make dev-backoffice`, đăng nhập, chọn chi nhánh **HCM**.
2. Mở `/reports/sales#revenue_by_product`, kỳ **01/08/2026 – 31/08/2026**, "Thống kê theo" để
   **Mặt hàng**, bấm "Lấy dữ liệu".
3. Ô cột **Tên hàng hoá** hiện màu xanh. Click một dòng có số lượng > 0.
   → Dialog mở, tiêu đề **CHI TIẾT DOANH THU MẶT HÀNG THEO HÓA ĐƠN**.
   → Phụ đề: **Mã SKU &lt;sku&gt; Từ 01/08/2026 đến 31/08/2026**.
   → Bảng chỉ chứa dòng của đúng SKU đó, mỗi dòng là một dòng hoá đơn.
4. So dòng tổng của dialog với dòng vừa click ở cột Số lượng và Doanh thu → khớp.
5. Đóng dialog. Đổi **Thống kê theo** sang **Mẫu mã** → ô Tên hàng hoá là text thường, click
   không mở gì.
6. Đổi lại **Mặt hàng**, bật **Phân bổ doanh thu combo** → ô cũng không click được.
7. Kiểm hiệu năng: mở DevTools tab Network, click một SKU → thời gian phản hồi
   `POST /reports/invoices/search` xấp xỉ như mở báo cáo chi tiết trực tiếp, không phải chậm hơn
   nhiều lần (dấu hiệu lọc sau khi nạp).

## In scope
- `filters.sku` trên `InvoiceReportFilterDto` + `InvoiceReportFilterPayload`, đẩy xuống mệnh đề
  `where` của truy vấn dòng hàng.
- Dòng `Mã SKU:` trong `invoiceFilterSummary` để file xuất khẩu nêu rõ phạm vi.
- Regenerate api-client.
- `REPORT_FILTERS_LINE.SKU` phía FE để `sku` đi qua `buildSearchFilters` sang cả search lẫn export.
- Mục registry `('revenue-by-item', 'itemName')` kèm ba guard.

## Not in scope
- Phần `Mẫu mã <parent>` ở phụ đề — không có nguồn dữ liệu, người dùng đã chấp nhận bỏ (A-08).
- Tối ưu các loader phụ (`loadCustomers`/`loadCashiers`/…) vẫn quét toàn kỳ khi có `sku` — đúng
  nhưng lãng phí; ghi nhận, không sửa ở đây.
- Đưa `sku` thành một filter line hiển thị được trên trang cha; nó chỉ round-trip, không render.

## Risks
| Risk | Mitigation |
|---|---|
| FE gửi `sku` trước khi BE deploy ⇒ `forbidNonWhitelisted` trả 400 cho **mọi** request báo cáo | Thứ tự ticket ép BE (T-03-01) → regen (T-03-02) → FE (T-03-03, T-03-04); triển khai BE trước |
| Quên `pnpm openapi:generate` — FE cast body nên **trình biên dịch không nhắc** | T-03-02 là ticket riêng, không phải một dòng trong ticket khác |
| Cắm `sku` vào chỗ lọc sau khi nạp cho tiện, giống `categoryId` ngay bên cạnh | AC-11 khẳng định ở tầng spec: điều kiện phải nằm trong `where` của repo dòng hàng |
| Mặt hàng đổi mã giữa kỳ ⇒ drill-down bắt thiếu dòng | A-03 đã chấp nhận; ghi vào "Not verified here" của 07 |

## Definition of done
- [x] AC-10, AC-11, AC-12 đều pass
- [x] `openapi.snapshot.json` và `packages/api-client/src/generated/schema.ts` đã commit và khớp DTO
- [x] Điều kiện `itemCode` nằm trong `where` của truy vấn dòng hàng, không phải lọc mảng sau khi nạp
- [x] Ba guard (grain, `statisticByBrand`, `allocateCombo`) đều tắt link đúng lúc
- [x] Demoed và accepted ở gate G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` xanh trên mọi môi trường bắt buộc — local-backoffice, 12/12 bước
- [x] Có bằng chứng cho AC-10 (S8), AC-12 (S9, nhánh `allocateComboRevenue`)
- [ ] ~~AC-11~~ — **không chụp được, không phải chưa làm.** Lọc SKU ở SQL và lọc sau khi nạp cho
      kết quả trên màn hình giống hệt nhau; chỉ khác lượng I/O, thứ DOM không thấy. Chứng minh
      bằng spec khẳng định `lineItems.find` nhận `itemCode` trong `where`.
- [x] `08-evidence.md` đã sinh lại và sha của nó khớp HEAD
