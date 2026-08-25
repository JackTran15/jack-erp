---
id: UOW-01
slug: customer-inline
title: Khách hàng đi kèm trang danh sách, không còn fetch từng dòng
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-03]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-11]
risk: low
status: todo
rollback: revert khối gắn customer trong `execute()` và trả `useInvoiceListV2Query` về vòng `Promise.all(customerService.get)`. Không migration, không ghi dữ liệu, không đổi envelope — revert thuần code
---

# UOW-01 — Khách hàng đi kèm trang danh sách

## Demo script

1. Đăng nhập POS (`localhost:3001`), chọn chi nhánh có nhiều hoá đơn hôm nay
2. Mở **Danh sách hoá đơn** (`/invoices`), đặt số dòng/trang = **100**
3. Mở DevTools → Network, lọc Fetch/XHR, bấm **Clear**, rồi bấm nút làm mới của lưới
4. Đúng **một** dòng request: `POST /v2/invoices/search`. Không dòng nào là
   `/customers/<uuid>` — trước bản sửa chỗ này là một chùm dài (xem ảnh chụp prod ở `00-intent.md`)
5. Ba cột **Mã khách hàng / Khách hàng / Số điện thoại** vẫn hiện đủ; đối chiếu tay 5 dòng
   bất kỳ với backoffice → khớp
6. Bấm vào request đó → tab **Response** → mở một phần tử `data[]` có `customer` khác
   `null` → chỉ có đúng 4 khoá `id`, `code`, `name`, `phone`. Không có `nationalId`,
   `birthDate`, `address`, `taxCode`, `note`, `email`
7. Gõ `vy` vào ô lọc cột **Khách hàng** → lưới lọc đúng, và dòng **Tổng tiền:** đổi theo
   tập kết quả đã lọc (không phải tổng của trang)
8. Lật sang trang 2 → vẫn đúng một request, không có `/customers/<uuid>` nào

## In scope

- `SearchInvoicesV2Handler.execute()` — truy vấn customer theo trang, chiếu 4 cột, gắn inline
- Test đơn vị cho handler: customer inline, khách lẻ, không rò PII, totals bất biến
- `useInvoiceListV2Query` — bỏ vòng N+1, đọc `inv.customer`
- `CustomerRow` thêm `code`
- Xoá `useInvoiceListQuery` (đường N+1 thứ hai, không ai gọi)

## Not in scope

- `buildQuery` — không sửa một dòng nào (ADR-02)
- Ba endpoint anh em `returnable` / `purchase-history` / `drafts` — vẫn trả toàn bộ entity
- Bật lại `@RequirePermission('pos.read')` trên `invoice-v2.controller.ts` — thay đổi hành vi
  phân quyền, cần vòng quyết định riêng
- Bố cục (UOW-02)

## Risks

| Risk | Mitigation |
|---|---|
| Sửa nhầm `buildQuery` → tổng cuối bảng lệch với lưới | ADR-02: phương thức đó không được chạm. T-01-02 chạy lại test `keeps the customer join on the totals query` và `is invariant to limit` mà không sửa chúng |
| Vô tình dùng `leftJoinAndMapOne` cho gọn → kéo lại PII | T-01-02 có test khẳng định response **không** chứa `nationalId`/`address`/`note` — đỏ ngay nếu ai đó đổi sang join-and-map |
| Quên `organizationId` trong truy vấn customer → rò chéo tenant | T-01-02 có test khách khác org không được gắn |
| Hai ticket cùng sửa `use-query-invoice.ts` gây xung đột | T-01-04 `depends_on` T-01-03, chạy nối tiếp |

## Definition of done

- [x] AC-01 … AC-06, AC-11 pass — AC-01/02/03/04/06 phủ bởi 8 test đơn vị mới
      (`inline customer` describe block) **và** xác nhận sống; AC-05 xác nhận sống bằng ô lọc
      cột "Khách hàng"; AC-11 bằng grep + build
- [x] `git diff` trên `buildQuery` rỗng — diff handler là 61 insertion, 0 deletion
- [x] `grep "customerService.get(" apps/pos-web/src/hooks/react-query/use-query-invoice.ts`
      không khớp
- [x] `pnpm --filter @erp/api test -- search-invoices-v2` xanh — 14/14
- [x] `pnpm --filter @erp/api build` và `pnpm --filter @erp/pos-web build` xanh
- [x] Không chuỗi tiếng Việt nào trong diff phía backend
- [x] Bằng chứng Network đính kèm — xem bảng dưới

## Bằng chứng sống

Chi nhánh Hồ Chí Minh, `erp_dev`, khoảng thời gian "Toàn bộ", 85 hoá đơn, `limit = 100`:

| Đo | Trước | Sau |
|---|---|---|
| `POST /v2/invoices/search` | 1 | 1 |
| `GET /customers/<uuid>` | 1 mỗi khách trên trang | **0** |
| Ba cột khách | đúng | đúng (đối chiếu DB) |

Đối chiếu nguồn sự thật:

| | Số hoá đơn | Mã khách | Khách hàng | SĐT |
|---|---|---|---|---|
| Lưới POS | `2608240003` | `KH788969` | `Test UOW04` | `0900000001` |
| `invoices join customers` | `2608240003` | `KH788969` | `Test UOW04` | `0900000001` |

Lọc theo tên khách (AC-05): `Test UOW04` → 85 kết quả thu về `1-1/1 kết quả`, đúng **1** lượt
search, **0** lượt `/customers/<uuid>`.

## Hồi quy

`pnpm --filter @erp/api test` toàn bộ: **293/294 suite xanh, 3323 test pass**. Một suite đỏ
là `auth.service.spec.ts` (2 test về `switchBranch`) — **có sẵn từ trước**, xác nhận bằng cách
stash toàn bộ thay đổi của feature và chạy lại: vẫn đỏ y hệt. Không liên quan tới feature này.
