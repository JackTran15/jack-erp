---
id: UOW-03
slug: barcode-location-sort
title: In tem mã sắp xếp được theo cột Vị trí
demoable: true
duration: 1d
depends_on: []
requirements: [US-03]
verifies: [AC-11, AC-12, AC-13, AC-14, AC-15]
risk: low
status: done
rollback: revert code — thuần frontend, không API, không dữ liệu
---

# UOW-03 — Sắp xếp theo Vị trí

Bộ máy đã có sẵn từ `1e333745`: `line-item-grid.tsx` sắp xếp kiểu controlled — lưới không tự đảo
dòng, nó chỉ phát `{key, direction}` và trang đảo. `packages/ui` **không** phải đổi lần này.

Vướng duy nhất là `InventoryItemBarcodesPage.tsx:74` khoá cứng khoá sắp xếp:

```ts
if (sort?.key !== "sku") return list;
```

Và vì `5512dc98` đã dựng sẵn `orderedRows` → `printableRows` / `previewRow`, mọi khoá sắp xếp mới đi
qua cùng một hàm sẽ tự động kéo theo In, Xuất khẩu và Xem trước.

## Demo script

1. Mở `/admin/inventory-item-barcodes`, thêm vài mặt hàng có mã vị trí khác nhau.
2. Bấm tiêu đề "Vị trí" lần 1 → tăng dần; lần 2 → giảm dần; lần 3 → về thứ tự gốc (AC-11).
3. Để một vài dòng chưa có vị trí → chúng nằm cuối ở cả hai chiều (AC-12).
4. Bấm "Xuất khẩu" và nhìn khung "Xem trước" → khớp thứ tự trên bảng (AC-13).
5. Bấm tiêu đề "Mã SKU" → sắp xếp SKU vẫn như cũ, và thay thế sắp xếp Vị trí (AC-14).
6. Chuyển sang chế độ chuỗi cửa hàng → cột Kho/Vị trí ẩn, bảng không còn sắp xếp treo (AC-15).

## In scope

- Tổng quát hoá `sortRowsBySku` thành comparator theo khoá, giữ nguyên quy tắc so sánh số trong mã.
- `sortable: true` cho cột `locationCode`.
- Dọn sort treo khi cột bị ẩn ở chế độ chuỗi (**A-09**).

## Not in scope

- Sắp xếp nhiều cột / tiebreaker "SKU trong Vị trí" — `LineGridSort` là khoá đơn.
- Sắp xếp phía server: luồng này không có tham số sort nào, `searchItems` chỉ gửi
  `page`/`pageSize`/`search`.
- Tab "In tem mã khuyến mại" — vẫn là stub `toast.info` (`InventoryItemBarcodesPage.tsx:662`).
- Đổi `packages/ui/src/components/line-item-grid.tsx`.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Đổi tên `sortRowsBySku` / `skuCollator` lan ra ngoài phạm vi | Chỉ 2 call-site (`:568`, `:574`); nếu đổi tên phình ra thì giữ tên cũ và ghi lý do |
| Dòng rỗng dồn lên đầu khi sắp tăng dần (**A-08**) | Ghim cuối theo đúng mẫu `isEmptyRow` đang dùng, và có test |

## Definition of done

- [x] AC-11…AC-15 pass
- [x] `packages/ui` không có thay đổi nào
- [x] Sắp xếp SKU không hồi quy, kể cả quy tắc số ("N-9" trước "N-38")
- [x] In / Xuất khẩu / Xem trước theo đúng thứ tự đang hiển thị
- [x] Demoed và accepted at gate G4 — **trên hồ sơ bằng chứng**, xem mục dưới

## Cơ sở chấp nhận G4 (Akenzy uỷ quyền 03/09/2026)

Lát này **có ảnh chụp trực tiếp**, nên cơ sở chấp nhận mạnh nhất trong bốn lát:

- `07-verification.md` bước **S2 / S3 / S4 / S10** xanh; `evidence_check.py` **PASS**.
- Ảnh `S2.png` cho thấy tiêu đề cột **"Vị trí" kèm mũi tên sắp xếp** — điều khiển này **không tồn
  tại** trước đợt sửa.
- Quy tắc ghim dòng rỗng xuống cuối và collation số ("N-9" < "N-38" < "N-100") kiểm bằng script tái
  hiện comparator, kết quả dán trong T-03-01.
- `git diff --stat packages/ui` **rỗng** — thay đổi nằm gọn trong hai file của trang.

**Giới hạn**: DSL không diễn đạt được thứ tự hàng, nên S2/S3 chỉ khoá được sự tồn tại và trạng thái
của nút sắp xếp; thứ tự thật đọc từ ảnh chụp.
