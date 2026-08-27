---
id: UOW-04
slug: prefill-price-no-refetch
title: In tem hàng loạt không bắn một request tra giá cho mỗi dòng
demoable: true
duration: 0.5d
depends_on: [UOW-02]
requirements: [US-05]
verifies: [AC-17]
risk: low
status: todo
rollback: revert 1 commit — quay lại `sellingPrice: 0` và effect tra giá từng dòng
---

# UOW-04 — In tem hàng loạt không bắn một request tra giá cho mỗi dòng

## Demo script

1. Mở DevTools tab Network, lọc `inventory/items`, vào `/inventory/purchase-orders`
2. Bấm ô Chọn tất cả trên header, rồi bấm "In tem mã"
3. Trang In tem mã mở với cột "Giá bán" đã có số thật (750.000) **ngay lập tức**, nhãn
   "Xem trước" hiện `750.000 VND` — không phải 0 rồi mới đổi
4. Network: không có request `inventory/items?search=<SKU>` nào cho các hàng hóa đã có giá.
   Bản trước bấm cùng thao tác này ra hơn 3.000 request và trình duyệt đứng hình

## In scope

- `GoodsReceiptLine.item` và `GoodsIssueLine.item` khai thêm `sellingPrice` (BE vẫn luôn
  trả, chỉ là FE type không khai nên không ai đọc)
- `toPrefillItems` của Nhập kho và Xuất kho đọc `line.item?.sellingPrice` thay vì hằng 0
- Effect tra giá của `InventoryItemBarcodesPage`: gộp theo `itemId`, trần đồng thời 6,
  một lần `setRows` cho mọi dòng cùng hàng hóa

## Not in scope

- Endpoint BE tra giá theo lô id
- Các nguồn prefill khác (Chi tiết vị trí, Hàng hóa) — chúng vốn đã truyền giá thật

## Risks

| Risk | Mitigation |
| --- | --- |
| `sellingPrice` không thực sự có trong payload `GET /:id` | `line.item` là `@ManyToOne(() => ItemEntity, { eager: true })` không kèm `select`, nên TypeORM trả nguyên bảng. S16 là bài kiểm: giá hiện ngay lúc mount, trước khi bất kỳ lượt tra nào kịp trả về |
| Hàng hóa có giá bán thật bằng 0 vẫn rơi vào nhánh tra lại | Đúng theo thiết kế và không còn nguy hiểm: chỉ 6/19.971 hàng hóa trong DB có giá 0, và effect nay gộp theo `itemId` với trần đồng thời |

## Definition of done

- [x] AC-17 pass
- [x] `pnpm --filter @erp/backoffice-web build` xanh
- [x] Demo bước 4 xác nhận không còn request tra giá cho hàng hóa đã có giá
- [x] Không nguồn prefill nào khác đổi hành vi

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
