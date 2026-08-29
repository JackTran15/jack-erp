---
feature: warehouse-report-filters-audit
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | "Danh sách lựa chọn sai" không phải lỗi riêng của nhóm Kho | medium | no | Thêm 1 UoW cho dropdown; không viết lại UoW nào đang có | confirmed | Confirmed by Akenzy, 2026-08-29 — **không dựng lại được**: probe filter-options trả đúng scope (5 toàn tổ chức / 3 / 2) và 9 bước trình duyệt không gặp phản chứng. Đóng vì không có triệu chứng để đuổi, không phải vì đã chứng minh là đúng. |
| A-02 | "Nhóm cha" nghĩa là **toàn bộ hậu duệ mọi cấp**, không chỉ con trực tiếp | high | no | Cây 3 cấp trả thiếu dòng; sửa trong cùng một hàm | confirmed | Confirmed by Akenzy, 2026-08-29 — `resolveDescendantCategoryIds` duyệt hậu duệ mọi cấp; test cây 3 cấp xanh; live GIÀY DÉP 50 = đúng tổng ba nhóm lá (S2). |
| A-03 | 9 cột D3 phải **ẩn ô lọc**, không phải bổ sung dữ liệu để lọc được | high | no | Nếu sai, UOW-03 đổi từ sửa catalog sang viết SQL mới | confirmed | Confirmed by Akenzy, 2026-08-29 — 9 cột đều `toRow` gán cứng null nên không có gì để lọc; đánh `filterKind: 'none'` là đủ, không phải viết SQL mới. Ảnh S5. |
| A-04 | Dọn bộ lọc đầu trang = **xoá giá trị** khỏi store, không phải "giữ nhưng không gửi" | high | no | Quay lại báo cáo cũ mất giá trị đã chọn (hoặc ngược lại, giữ lại một bộ lọc vô hình) | confirmed | Confirmed by Akenzy, 2026-08-29 — `pruneFilters` xoá hẳn giá trị trong `setReportType`; 7 test store phủ cả hai nhánh CHAIN/SINGLE; live S3→S4 cho 1 → 53 kết quả. |
| A-05 | Thêm `actor.branchIds` vào khoá cache là chấp nhận được | high | no | Tỉ lệ trúng cache giảm với tổ chức nhiều chi nhánh | confirmed | Confirmed by Akenzy, 2026-08-29 — `searchCacheKey` băm thêm `actor.branchIds` đã sort; 5 test khoá; không đo thấy ảnh hưởng hiệu năng trong suốt các lượt verify. |
| A-06 | `transfer-summary` bỏ qua mọi bộ lọc mặt hàng là **đúng thiết kế** | high | no | Nếu sai, cần thêm lọc nhóm/ĐVT cho báo cáo đó | confirmed | Confirmed by Akenzy, 2026-08-29 — form của `transfer-summary` chỉ khai Kỳ + Cửa hàng, và sau UOW-02 các filter khác không còn được gửi tới nó nữa. Không đụng tới báo cáo này. |
| A-07 | Kỳ báo cáo (preset + khoảng ngày) đang chạy đúng, không nằm trong phạm vi sửa | high | no | Thêm một UoW cho bộ lọc kỳ | confirmed | Confirmed by Akenzy, 2026-08-29 — không đụng tới bộ lọc kỳ; 9 bước trình duyệt chạy qua cả 'Hôm nay' và 'Tháng này' (S5) không gặp phản chứng. |
| A-08 | Bộ lọc đầu trang không cần sống qua F5 | medium | no | Thêm việc đồng bộ bộ lọc vào URL | confirmed | Confirmed by Akenzy, 2026-08-29 — không đồng bộ bộ lọc vào URL; chỉ `reportType` sống qua F5, đúng như thiết kế sẵn có. Không có yêu cầu ngược lại xuất hiện trong quá trình dựng. |
| A-09 | Giữ cột rỗng trong catalog ở hạt gộp, chỉ ẩn ô lọc — không bỏ cột | high | no | Nếu bỏ cột: lưới đổi hình dạng theo hạt và template cột đã lưu mất tham chiếu | confirmed | Confirmed by Akenzy, 2026-08-29 — cột rỗng ở hạt gộp vẫn nằm trong catalog, chỉ mất ô lọc (`UNFILLED_BY_GRAIN`); template cột đã lưu không hỏng. Ảnh S8. |

## Ghi chú nguồn

- **A-01** — `GET /reports/inventory/filter-options` trả 5 kho toàn tổ chức, 3 cho chi nhánh
  hiện tại, 2 cho chi nhánh còn lại; `WarehouseSelectField` truyền đúng `branchIds`. Người
  dùng chọn triệu chứng này trong một lượt chọn "tất cả", nên rất có thể là chọn phòng hờ.
- **A-02** — `TreeSelectInput` cho chọn node ở mọi cấp, nên hậu duệ mọi cấp là nghĩa duy nhất
  nhất quán. Bản mở rộng cây ở `stock-summary.service.ts` (trang legacy) cũng đệ quy toàn cây.
- **A-03** — Cả ba báo cáo đều **cố ý** để 9 cột này null: `document-detail.report.ts:243,245`
  gán cứng `null` vì `branches` không có cột code; `stock-quantity-detail.report.ts:198–208`
  gán null vì "no movement subtype backs them yet". Comment trong mã nói rõ 400 được chọn có
  chủ ý — thứ bị bỏ sót chỉ là `filterKind: 'none'` trên catalog, đúng như
  `positionCode`/`positionName` của `stock-summary` đã làm.
- **A-04** — Tiền lệ đã có: `pruneColumnFilters` xoá hẳn giá trị của cột biến mất, với đúng lý
  do ghi trong `report.store.ts` ("nó thành bộ lọc VÔ HÌNH vẫn đang chạy").
- **A-09** — Là hệ quả trực tiếp của ADR-05: template cột đã lưu tham chiếu tên cột, bỏ cột
  khỏi catalog làm hỏng template cũ. `stock-summary` đã đi đường khác (thu hẹp catalog theo
  `IDENTITY_KEYS_BY_GRAIN`) — nhưng nó thu hẹp về đúng những cột **có dữ liệu**, nên không mâu
  thuẫn: cột nào hạt điền được thì giữ và lọc được, cột nào không thì hoặc vắng mặt
  (`stock-summary`) hoặc hiện mà không có ô lọc (4 báo cáo còn lại).
