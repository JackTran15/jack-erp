---
feature: inventory-seed-category-parity
stories: 1
acceptance_criteria: 3
---

# Requirements — `seed:inventory` dùng chung danh sách mặc định

## US-01 — DB dev dựng mới có đúng danh mục thu/chi như org thật

Là dev dựng môi trường, tôi muốn org demo của `seed:inventory` có cùng danh mục thu/chi với org tạo qua ứng dụng,
để không phải tự thêm mục khi thử màn phiếu thu/chi.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Org demo khớp danh sách mặc định
```gherkin
Given một DB trắng đã chạy hết migration
When tôi chạy pnpm seed:inventory
Then org demo có đúng 43 mục thu/chi
And từng dòng (code, name, direction, display_order) khớp DEFAULT_CASH_VOUCHER_CATEGORIES
```

**AC-02** — Chạy lại seed vẫn là upsert
```gherkin
Given org demo đã có danh mục từ lần seed trước, trong đó một mục còn tên cũ
When tôi chạy lại pnpm seed:inventory
Then không có dòng trùng mã nào được thêm
And tên cùng display_order của mục đó được cập nhật theo DEFAULT_CASH_VOUCHER_CATEGORIES
```

**AC-03** — Literal không quay lại được
```gherkin
Given inventory.seed.ts sau khi sửa
When test quét nội dung file
Then không còn chuỗi mã danh mục nào (THU_…, CHI_…, BANK_FEE) trong file
And test đỏ nếu ai đó chèn lại một danh sách literal
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Tương thích | Không đổi chữ ký hay hành vi của `DEFAULT_CASH_VOUCHER_CATEGORIES`; chỉ thêm một chỗ đọc nó | T-01-01 |
| Phạm vi | Không đụng các khối seed khác trong cùng file | T-01-01 |
