---
id: UOW-01
slug: grid-server-search
title: Lưới sản phẩm tìm kiếm trên server
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05]
risk: low
status: todo
rollback: một commit revert; chỉ frontend, không đổi hợp đồng API
---

# UOW-01 — Lưới tìm kiếm trên server

## Demo script

1. Mở POS màn bán hàng, DevTools Network, lọc `catalog/products`.
2. Gõ `AK59` vào ô tìm ở thanh "TƯ VẤN BÁN HÀNG", **không** bấm Enter.
3. Network: đúng **một** request mới `…/catalog/products?page=1&pageSize=20&search=AK59`
   sau khi ngừng gõ — không phải bốn request cho `A`, `AK`, `AK5`, `AK59` (AC-04).
4. Lưới hiện các card khớp theo **mã**: AK5907, AK598-6, AK5903, AK5901A, AK5908, AK5938.
   Không còn "Chưa có hàng phù hợp" (AC-01, AC-02, AC-03).
5. Gõ `112` → lưới hiện card chứa SKU khớp (`AKDP1129…`, `TX31122…`), thay vì trống.
6. Xoá hết ô tìm → request mới **không** kèm `search`, lưới về trang đầu (AC-05).
7. Gõ một ký tự duy nhất `a` → lưới vẫn lọc (ngưỡng lưới là 1, ADR-02).

## In scope

- `useCatalogProductsQuery` nhận `search`, đưa vào `queryKey` và request.
- `use-checkout-catalog.ts`: debounce `catalogQuery` 150 ms, truyền xuống query, **xoá**
  bộ lọc `.filter(c.name.includes(q))`.
- Trả thêm `catalogTotal` và `catalogSearch` cho UOW-03 dùng.

## Not in scope

- Dropdown gợi ý (UOW-02) và dialog tự mở (UOW-03).
- Ngưỡng `minChars` của popover — giữ 3, ADR-02.
- Backend: `search` đã chạy được từ [[2026090805-pos-initial-load-latency]].

## Risks

| Risk | Mitigation |
|---|---|
| Mỗi ký tự bắn một request | Bước 3 của Demo script đếm request trên Network |
| Lưới nhấp nháy trống giữa hai lần gõ | A-06; nếu khó chịu thì thêm `placeholderData` ở ticket sau, không đoán trước |
| `queryKey` quên `search` → TanStack trả cache cũ | T-01-01 sửa `CATALOG_KEYS.PRODUCTS` để `search` là một phần khoá |

## Definition of done

- [x] **Demo script chạy thật trên trình duyệt**, POS ở `localhost:3001` nối API local:
  - Gõ `AK59`, không Enter → lưới hiện đúng **AK5901A, AK5903, AK5907, AK5908, AK5938,
    AK598-6** với đúng giá 1.850.000 / 1.850.000 / 1.650.000 / 1.650.000 / 1.850.000 /
    850.000 — **trùng khít ảnh mục tiêu** (AC-01, AC-02, AC-03)
  - Network panel: gõ 7 ký tự `ABA2777` sinh **đúng một** GET
    `…/catalog/products?page=1&pageSize=20&search=ABA2777`, không phải bảy (AC-04)
  - Xoá ô tìm → lưới về 20 card đầy đủ (ABA2777, ABA2799, ABA2813, …) (AC-05)
- [x] `pnpm --filter @erp/pos-web exec tsc --noEmit` sạch; `pnpm --filter @erp/pos-web build` xanh
- [x] Không còn `.filter(...)` lọc catalog theo tên trong `use-checkout-catalog.ts`
- [x] Chú thích "endpoint products không có tham số search" đã xoá

## Đối chiếu qua HTTP trên dữ liệu thật

Trước khi mở trình duyệt, kiểm bằng `curl` trên `erp_dev` (2 493 card):

| search | total | data |
|---|---|---|
| *(không)* | 2493 | 20 |
| `ABA2777` | **1** | ABA2777 |
| `AK59` | **6** | AK5901A, AK5903, AK5907, AK5908, AK5938, AK598-6 |
| `aba2777-d-38` | **1** | ABA2777 — khớp mã biến thể, không phân biệt hoa thường |
| `khongcogi` | 0 | — |
