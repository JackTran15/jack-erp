---
id: UOW-01
slug: target-type-per-row
title: Dòng chọn từ lưới được áp dụng ở POS (targetType theo dòng)
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04]
risk: medium
status: todo
rollback: revert T-01-01 — mapper quay về hardcode PRODUCT; không có dữ liệu phải dọn (A-06)
---

# UOW-01 — Dòng chọn từ lưới được áp dụng ở POS (targetType theo dòng)

## Demo script
1. Đăng nhập backoffice, **Khuyến mại → Chương trình khuyến mại → Thêm mới → Giảm giá hàng hóa**
2. Phạm vi *Hàng hóa*, phương thức *%*: gõ `SKU-685` ở ô tra cứu, chọn, đặt **10**; mở picker chọn thêm một **mẫu mã**, đặt **5**
3. Bấm **Lưu** → `SELECT target_type FROM promotion_lines WHERE program_id = …` ra `ITEM` cho SKU-685 và `PRODUCT` cho mẫu mã
4. Mở lại CTKM → hai dòng hiện đúng mã/tên; lưu lại không sửa → `target_type` không đổi
5. POS (hoặc `POST /v2/promotions/evaluate`) với `SKU-685` → giảm **68.500**

## In scope
- `GoodsDiscountRow.targetType`, gán tại ô tra cứu / picker / đọc lại
- `itemDiscountToDto` gửi `targetType` theo dòng; phạm vi nhóm ép `CATEGORY`
- E2E khẳng định ngữ nghĩa engine (item id dưới `PRODUCT` không khớp) và round-trip `ITEM`/`PRODUCT`

## Not in scope
- Sửa CTKM đã lưu sai (A-06 — không sửa)
- Đổi engine / API / schema

## Risks
| Risk | Mitigation |
| --- | --- |
| Mapper spec phía web (`promotion.mapper.spec.ts`) không chạy (A-08) nên không phải bằng chứng | Bằng chứng là e2e T-01-02 + ảnh/SELECT sau khi lưu qua UI |
| Phạm vi *Nhóm hàng hóa* bị ảnh hưởng nhầm | Mapper vẫn ép `CATEGORY` khi phạm vi là nhóm; demo bước kiểm nhóm ở DoD |

## Definition of done
- [x] AC-03/AC-04 xanh trong `promotion-item-discount-target-type.e2e-spec.ts`
- [x] **(trước khi merge)** AC-01: lưu qua UI một dòng chọn bằng ô tra cứu → `SELECT` ra `target_type='ITEM'`, ảnh + câu SQL ghi ở `07-verification.md`
- [x] **(trước khi merge)** AC-02: dòng chọn qua picker (một mẫu mã + một hàng hóa) lưu đúng `PRODUCT`/`ITEM`
  - 2026-09-28: lưu thật qua UI → `erp_dev_3008`, SELECT ghi ở `07-verification.md` (lookup `ITEM`, picker `PRODUCT`+`ITEM`, nhóm `CATEGORY`)
- [x] **(trước khi merge)** CTKM phạm vi *Nhóm hàng hóa* lưu vẫn ra `CATEGORY`
- [x] `tsc --noEmit` của backoffice-web sạch
- [x] Không file nào ngoài `touches:` của các ticket bị đụng
