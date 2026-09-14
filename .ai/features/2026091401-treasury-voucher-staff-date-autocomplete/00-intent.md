---
feature: treasury-voucher-staff-date-autocomplete
slug: 2026091401-treasury-voucher-staff-date-autocomplete
owner: Akenzy
created: 2026-09-14
status: done             # draft | approved | in_construction | done | abandoned
---

# Intent — Phiếu thu/chi: nhân viên trên bản in, Ngày thu/chi trên danh sách; tắt autocomplete backoffice

Nguồn: Akenzy gửi ngày 14/09/2026, mục 1 và mục 3 của một đợt góp ý, kèm 6 ảnh. Ảnh 2–4 chụp Quỹ tiền >
Tiền mặt > Thu, chi tiền mặt; ảnh 5–7 chụp dropdown gợi ý của trình duyệt đè lên ô chọn trên backoffice.

## Problem

**Bản in và file Excel của phiếu thu/chi không cho biết ai thu/chi tiền.** Phiếu có ô "Nhân viên thu/chi"
(`staff_id` ở phiếu tiền mặt, `collected_by` / `paid_by` ở phiếu tiền gửi), nhưng 4 mapper in
(`cash-receipt-print.mapper.ts`, `cash-payment-print.mapper.ts`, `bank-receipt-print.mapper.ts`,
`bank-payment-print.mapper.ts`) không đưa trường này vào `info`. Khối chữ ký chỉ có nhãn, nên người lập phiếu
phải viết tay tên mình. Ngược lại, bản in có dòng "Quỹ tiền mặt: Quỹ tiền mặt - KHO SG" mà người dùng không cần
(ảnh 2, 3: "Xoá mục này", "Bỏ mục này").

**Danh sách Thu, chi tiền mặt hiển thị và lọc theo ngày tạo, không theo ngày trên chứng từ.** Phiếu chi PC000323
có Ngày chi 06/09/2026 nhưng cột hiện 13/09/2026, là ngày bấm Lưu (ảnh 3). Bộ lọc kỳ ("Tháng này", Từ ngày / Đến
ngày) và bộ lọc cột cùng đổ vào `createdAt` (`search-cash-vouchers-v2.handler.ts:136`), và lưới sắp theo
`createdAt`. Phiếu lập lùi ngày vì thế rơi sai kỳ: lọc tháng 8 không thấy phiếu ngày chi 31/08 lập vào 01/09.

**Ô nhập trên backoffice bị trình duyệt đè dropdown lịch sử.** Chrome chèn danh sách giá trị đã gõ trước đó
(A01.02, Showroom BMT, W22.02…) lên đúng chỗ bảng gợi ý của `LookupField`, che kết quả và dễ bấm nhầm (ảnh 5–7).
`Input` của `@erp/ui` không đặt `autocomplete`, nên mọi ô dùng nó đều bị như vậy.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| --- | --- | --- |
| Kế toán / thủ quỹ in phiếu thu, phiếu chi | Bản in không có nhân viên thu/chi, có dòng Quỹ tiền mặt thừa; tên người lập viết tay | Bản in và Excel có dòng Nhân viên thu/chi, cột ký đầu tiên ghi "Nhân viên thu/chi", không in sẵn tên dưới chữ ký, không còn dòng quỹ / tài khoản |
| Kế toán đối chiếu quỹ theo kỳ | Cột, bộ lọc và thứ tự theo ngày tạo; phiếu lùi ngày lệch kỳ | Cột Ngày thu/chi; bộ lọc kỳ, bộ lọc cột và thứ tự theo ngày chứng từ |
| Người nhập chứng từ trên backoffice | Dropdown lịch sử của trình duyệt che bảng gợi ý | Chỉ thấy bảng gợi ý của ứng dụng |

## Success signal

Trên backoffice local (`erp_dev_3008`), không sửa DB bằng tay:

1. In và Xuất khẩu một phiếu chi tiền mặt có Nhân viên chi: có dòng "Nhân viên chi: <tên>", không có dòng
   "Quỹ tiền mặt", và cột ký đầu tiên mang nhãn "Nhân viên chi", và không có tên nào in sẵn dưới chữ ký (A-16, A-17) — ở cả bản in lẫn file .xlsx. Tương tự với phiếu thu tiền
   mặt và phiếu thu / chi tiền gửi.
2. Danh sách Thu, chi tiền mặt: một phiếu có ngày chi 06/09 nhưng tạo ngày 13/09 hiện "06/09/2026" ở cột Ngày
   thu/chi, có trong kết quả khi lọc kỳ 01/09–30/09, và không có khi lọc 13/09–13/09.
3. Focus ô Đối tượng ở Thêm mới phiếu chuyển kho và ô Chọn cửa hàng đích ở phiếu xuất kho: `input` mang
   `autocomplete="off"`, Chrome không hiện dropdown lịch sử.

## Out of scope

- Mục 2 của đợt góp ý — không có trong yêu cầu này.
- Danh sách Thu chi tiền gửi — không có cột Ngày tạo; với tiền gửi chỉ áp dụng phần In / Xuất phiếu (A-04, A-12).
- Tab Sổ chi tiết tiền mặt và Kiểm kê tiền mặt — không có trong ảnh.
- Bản in phiếu kho (nhập kho, xuất kho, chuyển kho, lệnh chuyển kho) — dùng chung khuôn in nhưng giữ nguyên (AC-09).
- POS (`pos-web`) — không dùng `Input` của `@erp/ui`, và cả ba ảnh 5–7 đều là backoffice (A-02).
- Sửa ô Nhân viên thu/chi trên dialog, hoặc bắt buộc nhập ô đó.

## Constraints

| Kind | Detail |
| --- | --- |
| Schema | Không migration, không cột mới: `staff_id`, `collected_by`, `paid_by`, `created_by`, `voucher_date` đều đã có; `voucher_date` đã nằm trong index `IDX_cash_receipts_org_branch_list` |
| Hợp đồng API | `POST /v2/cash-vouchers/search` và `/export` chạy `forbidNonWhitelisted`; đổi tên trường lọc làm client gửi trường cũ nhận 400 (A-11), và phải regenerate `packages/api-client` |
| Khuôn in | Một payload, hai renderer (`render-voucher-html.ts`, `voucher-xlsx.writer.ts`); thay đổi phải đi qua cả hai, không làm lệch 4 loại phiếu kho |
| Trình duyệt | Chrome tôn trọng `autocomplete="off"` với gợi ý lịch sử, không bảo đảm với autofill địa chỉ đã lưu (A-13) |
| Deadline | Không nêu |

## Existing surface touched

- In / Xuất phiếu quỹ: 4 mapper trên, `TREASURY_PRINT_LABELS`, `getPrintPayload` của 4 service, `VoucherPrintPayload`
  (`packages/shared-interfaces/src/printing/voucher-payload.ts`), `render-voucher-html.ts`, `voucher-xlsx.writer.ts`,
  resolver nhân viên mà phiếu tiền gửi đang dùng (`attachStaff`).
- Danh sách: `CashVoucherSearchV2Dto`, `search-cash-vouchers-v2.handler.ts`, `cash-voucher-v2.controller.ts` (cột
  xuất), `cash-voucher-export.fetcher.ts`; `useReceiptCashTableColumns.tsx`, `receipt-cash.constants.ts`,
  `TreasuryCashReceiptsPage.tsx`.
- Autocomplete: `packages/ui/src/components/{input,tags-input,multi-select-chips}.tsx` và các `<input>` dạng text viết
  tay trong `apps/backoffice-web/src`.
