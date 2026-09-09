---
id: UOW-03
slug: frontend-page-size
title: POS xin ít dữ liệu hơn lúc mở trang
demoable: true
duration: 1d
depends_on: []
requirements: [US-04]
verifies: [AC-11, AC-12]
risk: low
status: todo
rollback: một commit revert; hai hằng số
---

# UOW-03 — POS xin ít dữ liệu hơn lúc mở trang

## Demo script

1. Mở POS màn bán hàng với DevTools Network.
2. `GET /pos/branches/:id/catalog/products` mang `pageSize=20`, không phải 30 (AC-11).
3. `GET /customers` mang `pageSize=20`, không phải 50 (AC-12).
4. Click ô chọn khách → danh sách hiện ngay. Gõ tên một khách có trong 20 bản ghi đầu →
   lọc local, **không** có request mới trên Network.
5. Gõ tên một khách **không** nằm trong 20 bản ghi đó → có request `/customers/search`
   và kết quả vẫn ra đúng.
6. Lưới sản phẩm hiện 20 thẻ, phân trang sang trang 2 vẫn đúng.

## In scope

- `POS_CATALOG_PRODUCTS_PAGE_SIZE` 30 → 20 (`use-query-catalog.ts:41`).
- `useCustomerListQuery({ pageSize: 50 })` → 20 (`use-checkout-customer.ts:82`).

## Not in scope

- Bỏ prefetch khách khỏi đường tải trang đầu — đã cân nhắc và không chọn.
- Debounce cho ô tìm khách — chỉ cần nếu chọn 10; chốt 20 nên đường lọc local vẫn là
  đường chính.
- Mọi `pageSize` khác trong hai app.

## Risks

| Risk | Mitigation |
|---|---|
| Thu ngân phải gõ tìm nhiều hơn vì corpus lọc nhỏ đi | A-07; chọn 20 thay vì 10 chính vì lý do này. Bước 4-5 của Demo script kiểm cả hai nhánh |
| 20 thẻ làm lưới sản phẩm trông thưa | 20 là đúng mặc định server (`PaginationQueryDto.pageSize = 20`); bước 6 kiểm bằng mắt |

## Definition of done

- [x] AC-11, AC-12 kiểm bằng đọc code + `tsc --noEmit` sạch: hai hằng số là tham số
      `pageSize` **duy nhất** của hai query đó, và `customerSearchAdapter` không bị chạm
      nên nhánh lọc-local/gọi-API giữ nguyên
- [x] Không còn chỗ nào trong pos-web gửi `pageSize: 30` cho catalog hoặc `50` cho khách
      (`grep` trên `apps/pos-web/src` không còn kết quả)
- [x] Chú thích ở cả hai chỗ khớp con số mới, kèm lý do chọn 20 chứ không phải 10

## Còn lại (cần người chạy tay)

Cả 6 bước của Demo script: pos-web không có test runner nào trong repo (`pnpm test` của
workspace này chỉ `echo "test"`), nên AC-11/AC-12 chưa có test tự động. Cần mở POS với
Network panel và xác nhận `pageSize=20` trên cả hai request, rồi thử gõ tìm khách ở cả
hai nhánh (trong và ngoài 20 bản ghi đầu).
