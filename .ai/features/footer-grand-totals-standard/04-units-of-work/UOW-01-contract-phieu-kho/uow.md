---
id: UOW-01
slug: contract-phieu-kho
title: Contract totals dùng chung + retrofit 3 phiếu kho
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-02]
verifies: [AC-01, AC-02, AC-03, AC-04]
risk: low
status: todo
rollback: revert; hình dạng cũ (`totalAmount`) và mới (`totals`) đều là field trên cùng response
---

# UOW-01 — Contract `totals` + retrofit 3 phiếu kho

Lát nhỏ nhất chứng minh contract chạy được đầu-cuối: khai kiểu, rồi áp ngay cho ba màn đã có
evidence từ đợt 1 nên đối chiếu được ngay.

## Demo script
1. Mở `packages/shared-interfaces/src/common/index.ts` — `ReportTotals` và `PaginatedWithTotals`
   có mặt kèm quy ước viết trong doc comment
2. Backoffice → Kho hàng → Nhập kho: footer "Tổng tiền" = **691.778.000** (đúng số đợt 1 đã khẳng định)
3. Đổi số dòng/trang, sang trang khác → footer không đổi
4. Chuyển kho: footer = **700.000**
5. `pnpm --filter @erp/api test -- search-goods-receipts-v2 search-goods-issues-v2 search-stock-transfers-v2`

## In scope
- `ReportTotals` + `PaginatedWithTotals` trong `shared-interfaces`, kèm quy ước
- 3 handler v2 đổi `totalAmount` scalar → `totals: { totalAmount }`
- 3 trang FE đọc `records.totals.totalAmount`
- Spec 3 handler cập nhật theo shape mới

## Not in scope
- Tổng hợp tồn kho và 8 báo cáo kho (UOW-02)
- POS (UOW-03..05)

## Risks
| Risk | Mitigation |
| --- | --- |
| Quên một consumer đọc `totalAmount` | `tsc` toàn workspace; spec bất biến `limit` đọc field nên sẽ đỏ |
| Con số đổi khi retrofit | Demo script khẳng định lại đúng hai con số đợt 1 đã chốt |

## Definition of done
- [x] AC-01, AC-02: `ReportTotals` + `PaginatedWithTotals` export được từ `@erp/shared-interfaces`,
      doc comment có đủ 4 quy ước và ranh giới với `ReportRow`
- [x] AC-03: API trả **691.778.000** (nhập kho) và **700.000** (chuyển kho) trong shape mới — đúng
      số đợt 1; ảnh `S1`/`S2` xanh
- [x] AC-04: `tsc` sạch cả hai app; `npx jest` thoát 0 (212 suite / 1.929 test)
- [x] Spec 3 handler xanh, giữ nguyên test bất biến `limit`
