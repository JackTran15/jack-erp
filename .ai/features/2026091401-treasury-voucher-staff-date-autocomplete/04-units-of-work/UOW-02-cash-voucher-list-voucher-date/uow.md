---
id: UOW-02
slug: cash-voucher-list-voucher-date
title: Danh sách Thu, chi tiền mặt hiển thị, lọc, sắp và xuất theo Ngày thu/chi
demoable: true
duration: 1d
depends_on: []
requirements: [US-02]
verifies: [AC-10, AC-11, AC-12, AC-13, AC-14]
risk: medium
status: todo
rollback: revert đồng thời commit API và commit web (trường lọc đổi tên — revert một bên thì lưới nhận 400); không migration
---

# UOW-02 — Ngày thu/chi trên danh sách Thu, chi tiền mặt

API đổi trường lọc `createdAt` → `voucherDate`, lọc và sắp theo ngày chứng từ, cột xuất đổi theo (T-02-01);
`api-client` regenerate (T-02-02); lưới đổi cột, khoá lọc và kỳ lọc (T-02-03). Quyết định của Akenzy ngày 14/09/2026:
sắp theo ngày thu/chi mới nhất (A-03).

## Demo script

Môi trường `local-backoffice`, DB `erp_dev_3008`. Hôm nay là ngày demo; ví dụ dưới giả định 14/09/2026.

1. Quỹ tiền › Tiền mặt › Thu, chi tiền mặt → tạo phiếu chi **X**: Ngày chi 06/09/2026, 10.000 → Lưu. Tạo phiếu thu
   **Y**: Ngày thu 31/08/2026, 20.000 → Lưu.
2. Kỳ "Tháng này" → Lấy dữ liệu. Cột đầu tiên có tiêu đề "Ngày thu/chi"; X hiện "06/09/2026" và nằm cùng nhóm các phiếu
   ngày 06/09, không nằm đầu danh sách; Y không có. Chụp ảnh.
3. Từ ngày 01/08/2026 Đến ngày 31/08/2026 → Lấy dữ liệu: Y có, X không. Tổng tiền dưới lưới gồm 20.000 của Y.
4. Kỳ tháng 9, bộ lọc cột Ngày thu/chi 14/09–14/09: X không có. Đổi thành 06/09–06/09: X có.
5. Bỏ bộ lọc cột, kỳ tháng 9 → Xuất khẩu. File có cột "Ngày thu/chi", không có "Ngày tạo"; số dòng và thứ tự khớp lưới.
6. DevTools › Network: body `POST /v2/cash-vouchers/search` có `voucherDate`, không có `createdAt`.
7. Dọn dẹp: xoá X và Y.

## In scope

- `CashVoucherSearchV2Dto`, handler tìm kiếm, cột và fetcher của luồng xuất danh sách.
- Regenerate `packages/api-client`.
- Cột, khoá lọc và gộp kỳ trên `TreasuryCashReceiptsPage`.

## Not in scope

- Danh sách Thu chi tiền gửi (A-12), Sổ chi tiết tiền mặt.
- Thêm cột "Ngày tạo" song song — không ai yêu cầu.

## Risks

| Risk | Mitigation |
| --- | --- |
| Client ngoài repo đang gửi `createdAt` nhận 400 | A-11 là assumption blocking — Akenzy xác nhận trước G1; nếu có client thì ADR-04 đổi sang giữ alias |
| Web và API deploy lệch nhau | Rollback ghi rõ revert cả hai; hai ticket cùng một PR |
| Ngày `YYYY-MM-DD` lệch một ngày khi đi qua `new Date()` | T-02-01 truyền thẳng chuỗi vào file xuất; T-02-03 định dạng từ chuỗi, không qua múi giờ |

## Definition of done

- [x] AC-10 … AC-14 pass — AC-11..14: spec handler/fetcher + e2e `cash-voucher-list-export` (T-02-01); AC-10..12, AC-14 thêm kiểm trên trình duyệt (T-02-03)
- [x] Spec handler, spec fetcher và e2e list export xanh — 28/28 unit, e2e 7/7, cả bộ unit cash-voucher 235/235 (T-02-01, 14/09/2026)
- [x] `openapi.snapshot.json` và `schema.ts` regenerate, không sửa tay — T-02-02; bản sinh ra kéo theo phần lệch có sẵn trên `main` (34 path `/mobile/*`, DTO sales-order), ghi trong summary T-02-02 — nên tách commit riêng
- [x] Demo 7 bước chạy trên `local-backoffice`, ảnh chụp lưu vào evidence — **chạy thay thế, không đúng nguyên văn 7 bước**: 14/09/2026, chi nhánh MT211 Đà Nẵng, dùng phiếu có sẵn PC000044 (ngày chi 09/09, tạo 08/09) thay cho tạo X/Y. Đã thấy: cột "Ngày thu/chi", PC000044 hiện 09/09/2026; kỳ tháng 9 body `voucherDate` 01/09–30/09, không `createdAt`; lọc cột 09/09 có, 08/09 không; Xuất khẩu gửi cùng `voucherDate` (request bị chặn trong trang, **không mở file xlsx** — nội dung file do e2e T-02-01 khẳng định). Không kiểm được thứ tự trên trình duyệt (3 phiếu cùng ngày). Ảnh: `evidence/uow02-cash-list-ngay-thu-chi-pc000044.jpg`
- [x] Demoed and accepted at gate G4 — Akenzy kiểm trên trình duyệt cùng orchestrator và "mark done" 14/09/2026
