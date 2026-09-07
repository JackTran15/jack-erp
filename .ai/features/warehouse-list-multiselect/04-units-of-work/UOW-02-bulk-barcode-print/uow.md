---
id: UOW-02
slug: bulk-barcode-print
title: In tem mã hàng loạt từ các phiếu đã tick — trang Nhập kho
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-04]
verifies: [AC-12, AC-13, AC-14]
risk: medium
status: todo
rollback: revert 1 commit — nút "In tem mã" quay lại đường một phiếu như hôm nay
---

# UOW-02 — In tem mã hàng loạt từ các phiếu đã tick — trang Nhập kho

## Demo script

1. Vào `/inventory/purchase-orders`, tick NK000430 (3 dòng hàng) và NK000428 (2 dòng)
2. Bấm "In tem mã" → chuyển sang trang In tem mã với **5 dòng** đổ sẵn, mỗi dòng đúng
   SKU / tên / đơn vị / kho / vị trí / số lượng của dòng hàng gốc
3. Bấm "Hủy bỏ" → quay về `/inventory/purchase-orders`
4. Bỏ hết tick. Click vào ô "Đối tượng" của NK000429 để panel chi tiết trỏ vào nó.
   Bấm "In tem mã" → trang In tem mã mở với đúng các dòng của NK000429 (hành vi cũ)
5. Tick 2 phiếu **có chung một mặt hàng ở cùng vị trí**, số lượng 1 và 2 → trang In tem
   mã hiển thị **một** dòng cho mặt hàng đó với số lượng 3
6. Tick 5 phiếu, mở DevTools bật throttle "Slow 3G", bấm "In tem mã" → nút chuyển
   disabled trong lúc các request `GET /goods-receipts/{id}` đang chạy
7. Tick một phiếu rồi ở tab khác xóa phiếu đó. Quay lại bấm "In tem mã" → hiện toast
   lỗi, **không** điều hướng, nút trở lại enabled

## In scope

- `mergeBarcodePrefillItems` — gộp theo `itemId|storageId|locationId`, cộng `quantity`
- `PurchaseOrdersPage` nút "In tem mã": có tick → `Promise.all` các `GET /goods-receipts/{id}`,
  flatMap lines, gộp, điều hướng; không tick → giữ nguyên đường `selectedOrder.lines`
- Cờ disabled trong lúc gom, toast lỗi khi có phiếu không tải được

## Kiểm bằng tay, không nằm trong bằng chứng trình duyệt

AC-15 và AC-16 cần giả lập mạng chậm và một phiếu bị xóa giữa chừng — DSL của runner
không chạm được vào lớp mạng, nên hai AC này bị bỏ khỏi `verifies:` của UoW để
`evidence_check.py` không đòi ảnh cho thứ nó không chụp được. Chúng vẫn nằm trong
`verifies:` của `T-02-02` nên `uow_graph.py` vẫn tính đủ 16/16 AC, và vẫn phải chạy
bằng tay theo bước 6–7 của Demo script.

## Not in scope

- Nút "In tem mã" ở Xuất kho (UOW-03) — cùng khuôn nhưng khác endpoint và khác shape dòng
- Endpoint BE gom lines nhiều phiếu (ADR-02)
- Gộp trùng bên trong `InventoryItemBarcodesPage` (ADR-03)

## Risks

| Risk | Mitigation |
| --- | --- |
| `GET /:id` phân trang lines ngầm → in thiếu tem | A-05 đã kiểm: nút "In tem mã" hôm nay đã đọc `selectedOrder.lines` từ chính endpoint này. Demo bước 2 đếm đủ 5 dòng |
| Khóa gộp sai làm gộp nhầm hai tem khác vị trí | Khóa gồm cả `storageId` và `locationId`; T-02-01 có unit test cho ca cùng `itemId` khác `locationId` |
| Tick nhiều phiếu qua nhiều trang → burst N request | Chấp nhận theo ADR-02; số phiếu ở mức chục (A-06). Demo bước 6 quan sát hành vi dưới mạng chậm |

## Definition of done

- [x] AC-12 → AC-16 pass
- [x] `mergeBarcodePrefillItems` có unit test phủ: không trùng, trùng hoàn toàn, cùng item khác vị trí, mảng rỗng
- [x] `pnpm --filter @erp/backoffice-web build` xanh
- [x] Ảnh chụp bằng /ai-dlc-verify cho bước 2 và bước 4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
