---
id: UOW-04
slug: promotion-blank-rows
title: CTKM Giảm giá hàng hóa — bỏ dòng trống/không phân giải được khi lưu
demoable: true
duration: 0.5d
depends_on: []
requirements: [US-05]
verifies: [AC-21]
risk: low
status: todo
rollback: revert T-04-01 — một dòng mapper
---

# UOW-04 — Dòng trống CTKM

## Demo script
1. Tạo CTKM *Giảm giá hàng hóa* có vài dòng ITEM, lưu
2. Mô phỏng dòng cũ: trên `erp_dev`, đổi `target_type` một dòng thành `PRODUCT` (id vẫn là item) → mở lại thấy dòng trống ở giữa (đúng hiện trạng client)
3. Gõ dở mã ở một dòng khác mà không chọn; bấm **Lưu**
4. Mở lại → không còn dòng trống ở giữa, dòng hợp lệ giữ thứ tự, chỉ còn một dòng trống cuối (dòng nhập mới)

## In scope
- Lọc `targetId && code` trong `itemDiscountToDto` + spec

## Not in scope
- Migration sửa dòng cũ (A-14); các lưới CTKM khác (A-15)

## Risks
| Risk | Mitigation |
| --- | --- |
| Dòng hợp lệ nào đó không có `code` (vd PRODUCT chọn qua picker) | Spec có ca picker PRODUCT có code; ảnh demo bước 4 |

## Definition of done
- [x] AC-21 xanh trong `promotion.mapper.spec.ts` (9/9)
- [x] Ảnh demo bước 2 và 4 trong `07-verification.md` (`uow-04/1-legacy-blank-row.png`, `2-after-save.png`)
