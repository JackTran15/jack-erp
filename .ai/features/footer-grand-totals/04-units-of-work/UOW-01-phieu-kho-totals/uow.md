---
id: UOW-01
slug: phieu-kho-totals
title: Footer Tổng tiền của 3 phiếu kho là tổng toàn tập
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-06]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-22]
risk: low
status: todo
rollback: revert commit; response thừa một field, FE cũ bỏ qua field lạ nên không vỡ
---

# UOW-01 — Footer Tổng tiền của 3 phiếu kho là tổng toàn tập

Lát cắt rẻ nhất và có mẫu sẵn, nên làm trước để chốt pattern cho cả feature.

## Demo script
1. Đăng nhập backoffice, chọn chi nhánh có dữ liệu (Buôn Ma Thuật)
2. Vào Kho hàng → Nhập kho, đặt kỳ "Tháng này". Ghi lại số ở footer "Tổng tiền"
3. Đổi số dòng/trang 20 → 50, rồi sang trang 2 → footer **không đổi** ở cả ba lần
4. Gõ điều kiện `≤` vào ô lọc cột "Tổng tiền" → footer giảm theo, pager cũng đổi
5. Lặp bước 2–4 trên Xuất kho và Chuyển kho

## In scope
- 3 handler v2 trả thêm `totalAmount` = tổng trên mọi dòng khớp bộ lọc
- 3 trang FE đọc thẳng `totalAmount`, bỏ `reduce` theo trang
- Regenerate `@erp/api-client` cho response mới

## Not in scope
- Tổng hợp tồn kho (UOW-02), báo cáo kho (UOW-03+)
- Thêm cột hay đổi định dạng hiển thị

## Risks
| Risk | Mitigation |
| --- | --- |
| Join `lines` one-to-many làm SUM nhân lên | Query totals không join `lines`; dùng correlated subquery đã có sẵn ở đầu mỗi handler. Test AC-04 |
| `FilterBuilder` chạy hai lần gây trùng tên tham số | Đã uniquify toàn cục (`common/filters/filter.builder.ts:10,15-20`); có test chứng minh |

## Definition of done
- [x] AC-01..AC-05 pass — AC-01/AC-05 bằng ảnh chụp (S1–S3); AC-02/AC-03/AC-04 bằng unit test,
      xem `07-verification.md` mục "Not verified here" (dataset cục bộ chỉ có 3/0/2 chứng từ nên
      không dựng được cảnh nhiều trang)
- [x] AC-22: `pnpm --filter @erp/api test` — 255 suite / 2340 test xanh; `tsc --noEmit` backoffice sạch
- [x] `pnpm openapi:generate` đã chạy — **không có diff**: ba endpoint v2 không khai `@ApiOkResponse`
      nên response vốn không có kiểu trong OpenAPI, thêm `totalAmount` không đổi file sinh ra
- [x] Demo chạy trên máy thật: `evidence/local-backoffice/desktop/S1..S3.png`, run.json = pass

## Kiểm chứng bổ sung ngoài ảnh chụp

Đối chiếu trực tiếp API với sự thật SQL (chi nhánh HCM, `erp_dev`):

| Endpoint | limit | rows trả về | totalAmount | SQL |
| --- | ---: | ---: | ---: | ---: |
| `POST /v2/goods-receipts/search` | 1 | 1 | 691.778.000 | 691.778.000 |
| `POST /v2/goods-receipts/search` | 100 | 3 | 691.778.000 | 691.778.000 |
| `POST /v2/inventory/stock/transfers/search` | 1 | 1 | 700.000 | 700.000 |

`limit=1` trả **một** dòng nhưng tổng vẫn là tổng của cả ba phiếu — đúng thứ cần chứng minh.
