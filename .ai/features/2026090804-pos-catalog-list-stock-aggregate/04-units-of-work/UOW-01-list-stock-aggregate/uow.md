---
id: UOW-01
slug: list-stock-aggregate
title: Lưới hàng hoá POS lấy tồn bằng một truy vấn gộp
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-02]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08]
risk: medium
status: todo
rollback: một commit revert; không migration, không đổi hợp đồng API, không đổi frontend
---

# UOW-01 — Lưới hàng hoá POS lấy tồn bằng một truy vấn gộp

## Demo script

1. Trỏ API vào `erp_dev_3008`, đăng nhập POS ở chi nhánh `71230276…` (org `e60e5f49…`).
2. Mở màn bán hàng → lưới sản phẩm. Đối chiếu `quantityOnHand` của trang 1 với con số
   ghi lại trước khi đổi: **giống hệt từng thẻ**.
3. Lọc theo nhóm hàng, đổi `sortBy=quantityOnHand&sortOrder=desc`, sang trang 2 → thứ
   tự và con số vẫn khớp với bản ghi trước.
4. Xem log `LoggingInterceptor`: `GET …/catalog/products` giảm rõ so với 796 ms, và các
   endpoint bắn cùng lúc (`/payment-accounts`, `/organizations/current/pos-settings`,
   `/branches/…/salesmen`) không còn nằm ở dải 700–1000 ms.
5. Chạy `node scripts/bench-catalog-stock.js` (T-01-03): in ra trước/sau cho cả hai mốc
   AC-07 và AC-08.

## In scope

- `loadListStockTotals` — truy vấn gộp cho đường list, kèm nhánh `direction`.
- `listProducts` chuyển sang gọi nó.
- Test parity cho từng dòng của bảng "Đối chiếu ngữ nghĩa" trong `03-logical-design.md`.
- Script đo, chạy được lại, cho AC-07 / AC-08.

## Not in scope

- `loadBranchStock` và đường detail — ADR-01.
- Option B (cắt trang trước rồi mới nạp tồn) — ADR-03.
- `buildOrgCards`, cache theo org, PM2 cluster mode.

## Risks

| Risk | Mitigation |
| --- | --- |
| Truy vấn gộp lệch ngữ nghĩa ở một nhánh biên (NULL `storage_id`, chi nhánh không có showroom) | Bảng "Đối chiếu ngữ nghĩa" liệt kê đủ 9 nhánh; T-01-01 có một test cho mỗi dòng |
| Số tồn lệch mà không ai thấy vì spec hiện tại mock ở tầng cũ | T-01-02 giữ nguyên **kỳ vọng** của các test list cũ (`quantityOnHand: 10`…) và chỉ đổi tầng mock — con số không được phép đổi theo |
| `A-01` sai: `SUM` numeric khác cách cộng float hiện tại | Chỉ theo hướng chính xác hơn; T-01-01 có một test với số lẻ để ghi lại hành vi |

## Definition of done

- [x] AC-01..AC-08 đạt
- [x] `git diff` không chạm dòng nào của `loadBranchStock` (ADR-01)
- [x] `pnpm --filter @erp/api test -- pos-catalog-product.service.spec.ts` xanh
- [x] Không tiếng Việt trong source backend
- [x] Con số trước/sau được ghi lại trong `07-verification.md`
