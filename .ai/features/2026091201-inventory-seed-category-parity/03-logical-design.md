---
feature: inventory-seed-category-parity
adr_count: 1
---

# Logical design — `seed:inventory` dùng chung danh sách mặc định

## Approach

Thay khối `INSERT … VALUES` 28 dòng literal trong `inventory.seed.ts` bằng vòng lặp dựng `VALUES` tham số hoá từ
`DEFAULT_CASH_VOUCHER_CATEGORIES`, sao chép nguyên mẫu đã chạy ở `org-baseline-seed.core.ts:330-350`:

```ts
const cvcValues: string[] = [];
const cvcParams: unknown[] = [IDS.organization, IDS.user];
let vp = cvcParams.length;
for (const c of DEFAULT_CASH_VOUCHER_CATEGORIES) {
  cvcValues.push(`(gen_random_uuid(), $1, $${vp + 1}, $${vp + 2}, $${vp + 3}::cash_voucher_category_direction_enum, $${vp + 4}, true, $2, NOW(), NOW())`);
  cvcParams.push(c.code, c.name, c.direction, c.displayOrder);
  vp += 4;
}
```

Giữ nguyên `ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name, display_order = EXCLUDED.display_order`
(A-02), giữ nguyên thứ tự cột, và không đụng khối seed nào khác trong file.

Thêm một spec quét mã nguồn: đọc `inventory.seed.ts` và assert không còn chuỗi mã danh mục — khuôn lấy từ
`rbac/employee-listing-surfaces.spec.ts`, một test cùng kiểu đã có trong repo (A-04).

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Để nguyên, coi là nợ kỹ thuật | Akenzy chốt 12/09/2026 là dọn. Danh sách đã lệch hai lần, và lần nào cũng im lặng |
| Cho `inventory.seed.ts` gọi `CashVoucherCategorySeederService` | Service cần Nest DI và repository; seed là script `ts-node` chạy trên `AppDataSource`. Đắt hơn hẳn so với đọc một constant |
| Gọi `seedOrgBaselineData` từ `inventory.seed.ts` | Hàm đó seed cả COA, payment accounts, membership card types theo bộ id riêng của nó — trộn hai bộ seed là thay đổi lớn hơn nhiều so với vấn đề đang sửa |
| Chỉ thêm 15 mục còn thiếu vào literal | Sửa triệu chứng; lần đổi danh sách sau lại lệch tiếp |

## Domain model

Không đổi. Không có entity, migration hay cột nào mới.

## Contracts

Không có endpoint nào đổi. Hợp đồng duy nhất bị đụng là nội bộ: `inventory.seed.ts` nay phụ thuộc
`DEFAULT_CASH_VOUCHER_CATEGORIES` (import từ `modules/accounting/cash-vouchers/cash-voucher-categories/cash-voucher-category.seeder`),
đúng như `org-baseline-seed.core.ts:12` đang import.

## Error taxonomy

| Condition | Where | Behaviour |
| --- | --- | --- |
| Mã trong constant dài hơn `varchar(32)` | `INSERT` | Postgres lỗi, seed dừng — spec của `2026091104` đã chốt giới hạn 32 ký tự |
| Org demo đã có mục với mã đó | `ON CONFLICT` | Upsert tên và `display_order` (AC-02) |
| Constant rỗng (không xảy ra) | vòng lặp | `VALUES` rỗng ⇒ câu lệnh sai cú pháp; spec quét mã nguồn cũng assert constant có 43 dòng |

## Observability

Không thêm log. Seed đã in tiến trình từng bước; số dòng chèn suy ra từ độ dài constant.

## ADRs

### ADR-01 — Một nguồn sự thật cho danh sách mặc định, kèm test chặn literal quay lại
**Context:** Danh sách mục thu/chi tồn tại ở hai chỗ: constant dùng bởi `OrganizationService.create` và `seed:org`,
và một literal riêng trong `inventory.seed.ts`. Literal đã lệch hai lần (`BANK_FEE`, rồi 14 mục mới của
`2026091104`), lần nào cũng không có gì báo.
**Decision:** `inventory.seed.ts` đọc `DEFAULT_CASH_VOUCHER_CATEGORIES`; thêm spec quét mã nguồn để literal không
quay lại được mà vẫn xanh.
**Consequences:** Seed demo phụ thuộc một constant thuộc module accounting — chấp nhận, vì `org-baseline-seed.core.ts`
đã phụ thuộc đúng constant đó. Spec quét mã nguồn sẽ đỏ nếu ai cố ý chèn lại literal, kể cả có lý do chính đáng; khi
đó phải sửa cả spec và ghi lý do.
**Status:** accepted — Akenzy chọn "Mở ticket dọn", 12/09/2026
