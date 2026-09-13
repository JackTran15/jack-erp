---
id: UOW-03
slug: catalog-image-urls
title: POS và API đối tác trả URL ảnh sản phẩm
demoable: true
duration: 1d
depends_on: [UOW-01, UOW-02]
requirements: [US-02]
verifies: [AC-05, AC-06]
risk: medium
status: todo
rollback: Revert các commit của UoW. `imageUrl` quay về `null`, `images` quay về `[]`; hình dạng response không đổi nên POS và storefront đối tác không vỡ
---

# UOW-03 — POS và API đối tác trả URL ảnh sản phẩm

## Demo script
1. Dùng dữ liệu của demo UOW-02: sản phẩm A (có biến thể, 2 ảnh), hàng hoá B (không biến thể, 1 ảnh), thêm sản phẩm C không ảnh
2. Gọi API catalog sản phẩm của POS (`GET /pos/branches/:branchId/catalog/products`) bằng JWT → A và B có `imageUrl`, C có `null`
3. Gọi API tìm kiếm và API chi tiết sản phẩm của đối tác bằng `X-Api-Key` (đường dẫn xem ở `/docs`) → `images` của A là 2 URL theo thứ tự; C là `[]`; B không xuất hiện vì API đối tác chỉ trả dòng có `product_id` (A-25)
4. Mở một URL vừa nhận trong trình duyệt không đăng nhập → ảnh hiện
5. So response với `partner-catalog-contract.spec.ts`: danh sách khoá không đổi

## In scope
- `imageUrl` ở danh sách và chi tiết catalog POS, gồm cả biến thể
- `images[]` ở tìm kiếm và chi tiết của API đối tác

## Not in scope
- pos-web hiển thị ảnh (A-11)
- Ảnh trong module mobile (A-12)

## Risks

| Risk | Mitigation |
|---|---|
| Đối tác đang chạy storefront bất ngờ nhận URL (A-10) | T-03-02 ghi lại ai đã báo đối tác và khi nào, trước khi merge |
| Feature `2026090903-partner-catalog-api` còn ticket mở; T-05-03 của nó cũng sinh lại `schema.ts` | Sinh lại `schema.ts` ngay trước khi merge, sau khi rebase lên nhánh chính |
| N+1 truy vấn ảnh trên trang catalog | Một truy vấn `resolvePublicUrls` cho cả trang; test đếm số lần gọi |

## Definition of done
- [ ] AC-05, AC-06 pass
- [ ] Mỗi trang danh sách chỉ phát sinh đúng 1 truy vấn media
- [ ] Việc báo đối tác (A-10) được ghi trong T-03-02
- [ ] `pnpm --filter @erp/api test` xanh
- [ ] Demo và nghiệm thu tại gate G4
