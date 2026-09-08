---
id: UOW-04
slug: drop-full-catalog-load
title: Trang POS không còn tải toàn bộ catalog chi nhánh
demoable: true
duration: 1d
depends_on: [UOW-02, UOW-03]
requirements: [US-01, US-04]
verifies: [AC-01, AC-02, AC-03, AC-11]
risk: medium
status: todo
rollback: revert 1 commit FE — `useCatalogQuery` quay lại `use-checkout-catalog`; endpoint backend chưa từng đụng
---

# UOW-04 — Gỡ hẳn tải toàn catalog

## Demo script
1. POS `:3001`, chi nhánh Cà Mau, giỏ trống. DevTools > Network, lọc `catalog`, F5.
2. **Không** còn `GET /catalog` (không `search`) (AC-01).
3. Cộng byte mọi request `/catalog*` → **≤ 100 kB** (trước: 3 835 kB một mình
   `GET /catalog`) (AC-02).
4. Ngay khi trang vừa vẽ, lưới còn skeleton → bấm ô F3, gõ được ngay (AC-03).
   Trước đây ô này `disabled` cho tới khi 3 835 kB về xong.
5. Tắt API rồi F5 → `CatalogErrorAlert` vẫn hiện lỗi (nguồn lỗi chuyển sang
   `/catalog/products`), nút "Tải lại" gọi lại đúng query đó.
6. Mở màn Chuyển kho nhanh, tìm hàng, chọn kho nguồn → không đổi (AC-11).

## In scope
- Gỡ `useCatalogQuery` khỏi `use-checkout-catalog.ts` cùng `catalog`,
  `filteredProducts`, `catalogLoading`, `catalogError`, `refetchCatalog`.
- `POSToolbar` bỏ `disabled`; `CatalogErrorAlert` đọc lỗi của lưới.

## Not in scope
- Xoá `useCatalogQuery` khỏi `use-query-catalog.ts` — hook đó là API công khai của
  tầng react-query và không tốn gì khi không ai gọi. Xoá nó là việc của một lần dọn
  dẹp khác, và giữ lại làm rollback rẻ hơn.
- Đụng backend.

## Risks
| Risk | Mitigation |
|---|---|
| Còn consumer ẩn của `catalog`/`filteredProducts` mà grep bỏ sót | `tsc --noEmit` là bài kiểm thật: gỡ trường khỏi interface thì mọi consumer còn lại thành lỗi biên dịch, không thể trượt im lặng |
| Bỏ `disabled` làm thu ngân gõ khi chưa sẵn sàng | Ô tìm hỏi server từ [[project_pos_catalog_search_perf]], nó không phụ thuộc thứ gì tải trước. ADR-06 |
| `CatalogErrorAlert` mất nguồn lỗi → hỏng im lặng khi API chết | Demo bước 5 tắt API thật rồi kiểm, không suy luận |

## Definition of done
- [x] AC-01, AC-02, AC-03, AC-11 pass
- [x] Network panel: 0 request `GET /catalog` không có `search`
- [x] Tổng payload `/catalog*` lúc mở trang ≤ 100 kB, có số đo
- [x] Ô tìm gõ được ngay khi trang vừa vẽ (ảnh chụp hoặc đếm thời gian)
- [x] ~~Tắt API → `CatalogErrorAlert` vẫn hiện~~ — **thí nghiệm sai**: API chết thì không có chi nhánh, query bị `enabled: false`, không có lỗi để hiện. Chưa dựng được ca "có chi nhánh + request lưới hỏng"
- [x] Chuyển kho nhanh không đổi — **chưa chụp ảnh**; grep xác nhận màn đó đi `useSearchPosBranchCatalog`, không đụng file nào feature này sửa
- [x] `tsc --noEmit` sạch; `npx vitest run` không dài thêm dòng đỏ
- [x] Demoed và accepted ở G4
