# TKT-PRF-10 FE dual-period filter + hierarchical row rendering

## Epic

[EPIC-16072026 Báo cáo lợi nhuận (Profit Reports)](../epics/EPIC-16072026-profit-reports.md)

## Summary

Báo cáo "Kết quả kinh doanh" cần 2 mảng UI **chưa có tiền lệ** trong hệ thống báo cáo hiện
tại:

1. **Filter 2 kỳ song song** — dialog "Chọn báo cáo" hiển thị đồng thời "Kỳ trước" (preset +
   Từ ngày/Đến ngày) và "Kỳ hiện tại" (preset + Từ ngày/Đến ngày) trong CÙNG 1 form, gửi
   CÙNG 1 request. Mọi báo cáo khác trong hệ thống chỉ có 1 khoảng ngày.
2. **Rows dạng phân cấp có indent** — "Khoản mục" hiển thị theo cấp bậc (I./2.1./2.1.1./a-)
   với indent + độ đậm nhạt khác nhau theo cấp, khác hẳn dạng bảng phẳng "1 dòng/1 entity"
   của mọi báo cáo khác.

## Deliverables

- **Dual-period filter component** — thêm vào
  `ReportPageHeader/ReportSelector/ReportFilterForm/ReportFilterLine/ReportFilterLine.tsx`
  2 case mới cho `PERIOD_COMPARE_PREVIOUS`/`PERIOD_COMPARE_CURRENT` (khai báo hằng số ở
  TKT-PRF-07), mỗi case render 1 khối preset-dropdown + Từ ngày/Đến ngày — **tái dùng y hệt
  component/logic đã dùng cho `REPORT_PERIOD`+`RANGE_DATE`** (chỉ nhân đôi, đổi label "Kỳ
  trước"/"Kỳ hiện tại"), không viết lại từ đầu.
- **Hierarchical row rendering** — trong
  `ReportPageTable/ReportPageTable.tsx`/`ReportPageTableView.tsx`, thêm hỗ trợ render dòng
  theo `indentLevel` (số cấp thụt vào cột "Khoản mục") + `bold` (dòng cấp cao I/II/III/IV in
  đậm) khi response BE trả kèm 2 field này trên mỗi row (BE bổ sung `indentLevel: number`,
  `bold: boolean` vào mỗi row của `business-results`, ngoài 5 field cột chính — field nội
  bộ dùng cho FE render, không phải "cột" theo nghĩa `ReportColumnHeader`).
  - Tham khảo cách `receivables-detail-by-product` (debt-reports) render 3 loại dòng
    HEADER/ITEM/SUBTOTAL khác nhau trong cùng 1 bảng làm điểm khởi đầu, dù cơ chế dữ liệu
    khác (đó là row-type rời rạc, đây là indent-level liên tục).
- Report `business-results` **không có** dòng Tổng ở footer (khác mọi báo cáo khác) — xác
  nhận `ReportPageTable` xử lý đúng khi `totals: null` (nếu hiện tại luôn render 1 dòng
  Tổng kể cả khi rỗng, cần sửa để ẩn hẳn dòng footer trong trường hợp này).

## Acceptance Criteria

- [ ] Dialog "Chọn báo cáo" khi chọn "Kết quả kinh doanh" hiển thị đúng thứ tự field như
      screenshot mẫu: Báo cáo → Cửa hàng (chain only) → Kỳ trước (preset + 2 ngày) → Kỳ hiện
      tại (preset + 2 ngày, bắt buộc).
  - ❓ **Cần xác nhận**: "Kỳ trước" optional hay bắt buộc? Screenshot dialog không có dấu
    `*` ở "Kỳ trước" (khác "Báo cáo" có `*`) — giả định optional, nếu để trống thì cột "Kỳ
    trước"/"Thay đổi (%)"/"Thay đổi (Số tiền)" hiển thị 0/null. **Người trả lời ticket này
    xác nhận hoặc chỉnh lại.**
    Kỳ trước là bắt buộc, vì SingleSelect default là có value
- [ ] Submit form gửi đúng `previousPeriod: {from, to}` (có thể undefined nếu bỏ trống) +
      `currentPeriod: {from, to}` (bắt buộc) trong cùng 1 request tới
      `POST /reports/profit/search`.
- [ ] Bảng kết quả hiển thị đúng indent theo cấp — dòng "I."/"II."/"III."/"IV." đậm hơn dòng
      con, dòng "a -"/"b -" thụt sâu nhất — so khớp trực quan với screenshot mẫu.
- [ ] Không có dòng Tổng ở footer cho báo cáo này (khác mọi báo cáo khác trong hệ thống).
- [ ] 2 báo cáo còn lại (`profit-by-item`, `gross-profit-by-invoice`) **không bị ảnh hưởng**
      bởi thay đổi ở `ReportPageTable` — regression check thủ công.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` pass.
- [ ] Test thủ công qua preview: mở báo cáo "Kết quả kinh doanh", nhập 2 kỳ khác nhau, bấm
      "Lấy dữ liệu", xác nhận bảng hiển thị đúng cả số liệu lẫn indent/độ đậm; xác nhận 2
      báo cáo còn lại trong epic vẫn hiển thị bảng phẳng bình thường (không bị ảnh hưởng).
- [ ] Screenshot trước/sau đính kèm PR để reviewer đối chiếu trực quan với ảnh mẫu gốc.

## Tech Approach

Ưu tiên tái dùng tối đa: filter 2 kỳ = ghép đôi component `RANGE_DATE`/`REPORT_PERIOD` đã
có sẵn (không viết input mới); hierarchical row = thêm 2 field optional
(`indentLevel?`, `bold?`) vào kiểu dữ liệu row hiện có ở `ReportPageTable` và áp dụng
`paddingLeft`/`font-weight` theo giá trị đó khi render ô đầu tiên (cột `khoanMuc`) —
không đổi cấu trúc bảng, không thêm cột mới ẩn.

## Testing Strategy

- Không cần unit test (thuần UI/CSS) — verify bằng preview thủ công + screenshot đối chiếu.

## Dependencies

- Depends on: TKT-PRF-08.
- Blocks: TKT-PRF-11.
