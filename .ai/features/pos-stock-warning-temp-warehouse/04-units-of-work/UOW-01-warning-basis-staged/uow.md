---
id: UOW-01
slug: warning-basis-staged
title: Ngưỡng cảnh báo trên dòng hoá đơn cộng hàng ở kho tạm
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-02, US-03, US-04]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-09, AC-10, AC-11, AC-12]
risk: medium
status: todo
rollback: revert commit — feature chỉ đụng đường đọc, không có migration, không có dữ liệu mới
---

# UOW-01 — Ngưỡng cảnh báo trên dòng hoá đơn cộng hàng ở kho tạm

Bổ dọc theo **đường hàng vào giỏ từ màn bán hàng**: gõ tìm, quét mã, và lưới catalog. Cả ba
dồn về `PosCatalogService`, nên một lát cắt phủ hết. Dialog chọn biến thể là bề mặt riêng —
UOW-02.

## Demo script

Chuẩn bị: chi nhánh HCM, SKU có tồn showroom 4 và tồn kho lưu trữ ≥ 3.

1. POS → Chuyển kho nhanh → mở phiên chiều **kho → showroom**, quét SKU đó 3 đơn vị. Không đóng phiên.
2. Về màn Bán hàng, gõ tên SKU, chọn kết quả → dòng vào giỏ.
3. Nhập SL 6 → **không** có chấm đỏ; rê chuột vào ô tồn thấy `Tồn: 7`.
4. Bấm Thu tiền → **không** hiện dialog "Cảnh báo xuất quá số lượng tồn". Thoát dialog thanh toán.
5. Nhập SL 8 → chấm đỏ; bấm Thu tiền → dialog liệt kê dòng đó với `Số lượng tồn = 7`.
6. Xoá dòng khỏi giỏ, **quét mã vạch** của chính SKU đó → dòng vào giỏ, SL 6 vẫn không cảnh báo (cùng ngưỡng).
7. Quay lại Chuyển kho nhanh, mở phiên chiều **showroom → kho**, quét SKU đó 1 đơn vị.
8. Về màn Bán hàng, tải lại, thêm SKU → nhập SL 7 → chấm đỏ với `Số lượng tồn = 6`.
9. Xoá hết dòng của cả hai phiên → ngưỡng quay về 4.

## In scope

- Provider gom tác động của kho tạm lên tồn main storage, theo luật ranh giới ADR-01
- Ba đường đọc của `PosCatalogService` (`getCatalog`, `searchCatalogByTerm`, `lookupByCode`)
- Đổi tên `showroomQuantity` → `sellableQuantity` (ADR-02) trên `PosCatalogLineDto`
- Regen `packages/api-client`
- FE checkout: `readSellableOnHand`, `maxQty` lúc thêm dòng, `syncPurchaseCartOnHand`

## Not in scope

- Dialog chọn biến thể (UOW-02)
- Màn Chuyển kho nhanh — chỉ dùng để dựng dữ liệu demo, không sửa

## Risks

| Risk                                                  | Mitigation                                                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Quên một trong ba đường đọc BE                        | ADR-02: đổi tên trường nên đường quên trả `undefined` → FE luôn cảnh báo, hỏng ồn ào. T-01-02 có test cho cả ba đường |
| Luật ranh giới (A-04) sai ở cấu hình phiên lệch chuẩn | T-01-01 kiểm riêng nhánh nguồn-nằm-trong-main-storage (AC-10), không phụ thuộc dữ liệu thật                           |
| Thêm một round-trip DB vào đường nóng của catalog     | Một truy vấn `GROUP BY item_id` cho cả chi nhánh, không N+1 (ADR-03)                                                  |

## Definition of done

- [x] AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-09, AC-10, AC-11, AC-12 pass
- [x] `pnpm --filter @erp/api test` xanh
- [x] `npx vitest run` trong `apps/pos-web` xanh, trừ 3 test đỏ **có sẵn trên HEAD** ở
      `src/lib/common/api-axios.test.ts` (feature `auth-token-auto-refresh`) — đã xác minh
      bằng `git stash` là đỏ y hệt khi không có diff của feature này, và nằm ngoài phạm vi
- [x] `pnpm openapi:generate` đã chạy lại và `packages/api-client/src/generated/schema.ts` được commit
- [x] Không còn tham chiếu `showroomQuantity` nào trong `apps/api/src` và `apps/pos-web/src`
- [x] Demoed and accepted at gate G4
