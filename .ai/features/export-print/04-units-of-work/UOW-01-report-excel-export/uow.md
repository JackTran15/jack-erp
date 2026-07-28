---
id: UOW-01
slug: report-excel-export
title: Xuất khẩu báo cáo ra Excel (cả 4 miền)
demoable: true
duration: 2d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07]
risk: medium
status: todo
rollback: Gỡ route `POST /reports/*/export` và trả nút Xuất khẩu về stub toast — không có state nào để hoàn tác
---

# UOW-01 — Xuất khẩu báo cáo ra Excel (cả 4 miền)

## Demo script

1. Đăng nhập backoffice, mở Báo cáo → Kho → Tổng hợp nhập xuất tồn kho
2. Đặt kỳ báo cáo là tháng trước, chọn một kho cụ thể
3. Mở hộp thoại cấu hình cột, ẩn cột "Thương hiệu", đổi tên cột "Tồn cuối kỳ" thành "SL tồn cuối"
4. Bấm "Xuất khẩu" → file .xlsx tải về
5. Mở file: đúng cột đang hiển thị, đúng thứ tự, tiêu đề dùng tên vừa đặt, không có cột Thương hiệu
6. Đối chiếu số dòng và dòng tổng cộng với bảng trên màn hình
7. Mở một báo cáo thuộc miền khác (Lợi nhuận theo mặt hàng) và bấm Xuất khẩu — cùng đường xử lý, ra file đúng
8. Đặt kỳ báo cáo cả năm cho org lớn → nhận thông báo vượt trần dòng, không có file rỗng nào tải về

## In scope

- Payload trung gian + builder workbook dùng chung
- Route export cho cả 4 miền báo cáo
- Nối nút "Xuất khẩu" ở cả hai shell báo cáo FE

## Not in scope

- In ra giấy (UOW-02)
- Viết lại 7 exporter cũ
- Export bất đồng bộ (A-02)

## Risks

| Risk | Mitigation |
|---|---|
| Bốn miền có thể lệch nhau ở ngữ nghĩa totals (A-01) | Đã đọc code cả 4 miền, cùng thứ tự materialize→filter→totals→slice; T-01-08 kiểm chứng bằng đối chiếu với `POST search` |
| Báo cáo pivot có cột động `branch.qty.<id>` không nằm trong catalog tĩnh | `buildColumns(actor)` đã trả cả cột động; validate dựa trên catalog đã resolve chứ không phải danh sách tĩnh |

## Definition of done

- [x] Cả AC-01..07 pass
- [x] Không thêm dependency nào vào `@erp/api`
- [x] `pnpm --filter @erp/api test` xanh (205 suites / 1606 tests)
- [x] `pnpm openapi:generate` đã chạy; snapshot + schema đã cập nhật (chưa commit — repo vẫn để uncommitted)
- [x] Demo script đã chạy trên trình duyệt thật (`/reports/inventory`): 56 dòng bảng ↔ 56 dòng file, ẩn 3 cột → 24→21 cột, cả 4 miền trả 200
