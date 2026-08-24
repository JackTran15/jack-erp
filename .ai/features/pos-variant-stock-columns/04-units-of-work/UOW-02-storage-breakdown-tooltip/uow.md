---
id: UOW-02
slug: storage-breakdown-tooltip
title: Hover ô Tồn kho ra phân rã theo từng kho
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-07, AC-08, AC-09, AC-10, AC-11, AC-12]
risk: low
status: todo
rollback: bỏ trường `storages` khỏi DTO và gỡ `Tooltip` khỏi ô `Tồn kho` — cột trở lại con số trần của UOW-01
---

# UOW-02 — Hover ô Tồn kho ra phân rã theo từng kho

## Demo script

1. Đăng nhập POS, chọn chi nhánh **Hồ Chí Minh** (chi nhánh này có 3 kho:
   `Hồ Chí Minh - Showroom`, `Kho lưu trữ HCM`, `Kho hàng lỗi HCM`)
2. Mở dialog chọn biến thể của một product bất kỳ
3. Rê chuột vào ô **Tồn kho** của một dòng → tooltip liệt kê **đủ ba kho** kèm số dư
4. Chọn một biến thể chỉ có tồn ở `Kho lưu trữ HCM` → tooltip vẫn hiện đủ ba kho, hai
   kho còn lại hiện `0` (không bị ẩn đi)
5. Chọn một biến thể có tồn showroom âm → tooltip hiện đúng số âm ở dòng showroom, và
   con số đó khớp với cột `Tồn kho` bên ngoài
6. Kho showroom chính đứng đầu danh sách, các kho còn lại xếp theo tên
7. Tắt hoạt động một kho trong backoffice, mở lại dialog → kho đó biến mất khỏi tooltip

## In scope

- Mảng `storages` trên `PosProductVariantDto` (`storageId`, `name`, `quantity`,
  `isMainShowroom`), gồm cả kho tồn 0, đã sort sẵn ở backend
- Tooltip trên ô `Tồn kho` trong `VariantRow`, dùng `Tooltip` của `@erp/ui` dưới
  `TooltipProvider` đã bọc sẵn ở `VariantTable`
- Bằng chứng trình duyệt cho cả hai slice

## Not in scope

- Tooltip cho cột `Tồn cửa hàng khác` (A-05) — cột đó là một con số, không phân rã
- Phân rã xuống mức vị trí (kệ/ô)

## Risks

| Risk | Mitigation |
|---|---|
| Payload phình khi product có nhiều biến thể × nhiều kho | ADR-04 nêu ngưỡng và đường lùi; T-02-03 đo kích thước mảng trên case 500 biến thể |
| Tooltip che mất ô số lượng đang thao tác | Đặt `side="left"` và giữ `delayDuration` sẵn có; kiểm bằng ảnh chụp ở T-02-05 |
| Kho ngừng hoạt động vẫn lọt vào danh sách (A-08) | T-02-03 có case `is_active = false` |

## Definition of done

- [x] AC-08 pass; AC-07, AC-09, AC-10, AC-11 vẫn pass sau khi thêm tooltip — 47/47 unit test
      xanh (bao gồm cả `storages breakdown` describe block); AC-07/AC-10/AC-11 xác nhận sống lại
      lần nữa trong `07-verification.md` Ảnh 4/5 (không hồi quy khi thêm tooltip)
- [x] Tooltip hiện đủ kho tồn 0 và kho tồn âm — `07-verification.md` Ảnh 3 (toàn 0) và Ảnh 4
      (showroom -4)
- [x] Kho `is_active = false` không xuất hiện — phủ bởi unit test "excludes a deactivated
      (is_active = false) storage holding stock from the array (AC-08)"; không dựng lại bằng tay
      trên `erp_dev` vì cần deactivate một storage thật (xem `07-verification.md` § Không kiểm ở
      đây)
- [x] Có ảnh chụp hover ở `07-verification.md` — Ảnh 3, Ảnh 4
- [x] `openapi.snapshot.json` + `schema.ts` đã regenerate và commit — commit `a4038fd2` trên
      branch `feat/pos-variant-stock-columns` (cùng lượt với UOW-01, xem ghi chú ở đó)
- [x] Demo chạy trước người thật ở gate G4 — Akenzy xác nhận trực tiếp trong chat, tick theo yêu
      cầu tường minh ("tick done close the feature"), không phải Claude tự chứng kiến demo
