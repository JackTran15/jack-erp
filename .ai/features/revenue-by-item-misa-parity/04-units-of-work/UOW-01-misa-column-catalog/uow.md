---
id: UOW-01
slug: misa-column-catalog
title: Catalog 14 cột khớp thứ tự và nhãn MISA
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06]
risk: medium
status: todo
rollback: revert 1 commit — không có migration, không có state ngoài code
---

# UOW-01 — Catalog 14 cột khớp thứ tự và nhãn MISA

## Demo script

1. Đăng nhập backoffice, mở **Chuỗi cửa hàng → Báo cáo → Doanh thu theo mặt hàng**
2. Chọn kỳ có dữ liệu, một cửa hàng, bấm xem
3. Đọc header bảng từ trái sang: `Mã SKU | Tên hàng hóa | Đơn vị tính | Mã vị trí | Tên vị trí | Số lượng bán | Đơn giá TB | Tiền hàng | Khuyến mại | Điểm KM | Tỷ lệ KM (%) | Doanh thu | Nhóm hàng hóa | Thương hiệu`
   — đúng 14 cột, đúng thứ tự ảnh #2; `Nhóm hàng hóa`/`Thương hiệu` đã chuyển về cuối
4. Dưới nhãn `Đơn giá TB` thấy `(2)=(3)/(1)`, dưới `Doanh thu` thấy `(6)=(3)-(4)-(9)`
5. Đổi "Thống kê theo" sang **Nhóm hàng hóa** → vẫn 14 cột, 2 cột vị trí hiện ra rỗng
   (không còn nhảy số cột như trước)
6. Mở **Doanh thu theo ngày** (`daily-sales-summary`) → nhãn vẫn `Số lượng`, `Đơn giá`,
   `Tổng` như cũ, không bị lây

## In scope

- 2 map override nhãn + ký hiệu cho riêng `revenue-by-item` ở `packages/shared-interfaces`
- Xếp lại `REVENUE_BY_ITEM_COLUMNS` theo thứ tự A→N của MISA
- `buildColumns` phân giải nhãn qua override và trả `desc` thay vì luôn `null`
- Bỏ nhánh loại 2 cột vị trí theo grain / theo phạm vi cửa hàng (ADR-03)
- Dọn entry chết `SUPPLIER_NAME` khỏi registry fallback FE (A-04)

## Not in scope

- Đưa `desc` xuống file Excel và trang in — UOW-02. Ở UoW này ký hiệu chỉ xuất hiện
  **trên màn hình** (FE đã render `formulaDisplay` từ `h.desc` sẵn)
- Dòng tham số — UOW-04
- Sửa `revenue-by-item.aggregator.ts` — số liệu đã đúng (A-01, A-16)

## Risks

| Risk | Mitigation |
|---|---|
| Đổi nhãn ở map dùng chung sẽ lây sang 3 báo cáo hóa đơn khác (A-13) | Override riêng theo báo cáo (ADR-01); T-01-03 là test hồi quy khẳng định 3 báo cáo kia không đổi |
| Người dùng đã lưu `report_templates` thấy thứ tự cũ, tưởng chưa fix | Xem "Rủi ro di trú" trong `03-logical-design.md`; T-01-02 ghi lại trong PR description để hỗ trợ giải thích |
| 2 cột vị trí rỗng ở grain gộp bị coi là bug mới | Là quyết định đã được phán quyết (A-08, ADR-03); ghi vào done-when của T-01-02 |

## Definition of done

- [x] AC-01..AC-06 pass — qua 5 ticket T-01-01..T-01-05, cộng xác nhận trực tiếp trên UI thật (T-05-02): 14 cột đúng thứ tự + nhãn, cột vị trí rỗng ở grain gộp
- [x] `pnpm --filter @erp/api test` xanh, không sửa test cũ nào để nó xanh — 203 suites/1703 passed cuối feature
- [x] Không có chuỗi tiếng Việt mới nào trong `apps/api/src`
- [x] `grep -r "supplierName" apps/backoffice-web/src/constants/reports` không còn khớp
- [x] Demoed và accepted ở gate G4 — solo (không có reviewer riêng), qua `done --no-review`, ghi vào audit trail của aidlc
