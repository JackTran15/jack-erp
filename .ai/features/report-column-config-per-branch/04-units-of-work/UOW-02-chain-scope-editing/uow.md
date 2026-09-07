---
id: UOW-02
slug: chain-scope-editing
title: Chế độ "Xem theo chuỗi" sửa bản chuỗi, chi nhánh không xoá được bản chuỗi
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-05, AC-06]
risk: low
status: todo
rollback: đổi `scope` ở FE về hằng `"branch"` — backend giữ nguyên, không cần revert migration
---

# UOW-02 — Sửa bản chuỗi từ chế độ "Xem theo chuỗi"

Sau UOW-01, bản chuỗi là thứ mọi chi nhánh chưa cấu hình đang kế thừa — nhưng chưa ai sửa
được nó qua UI, vì FE mới chỉ gửi `scope: "branch"`. Lát cắt này nối
`useIsChainSelected()` vào `scope` và khoá đường xoá bản chuỗi từ ngữ cảnh chi nhánh.

## Demo script

1. Đăng nhập bằng tài khoản có quyền xem chuỗi; ở header chọn **"Toàn chuỗi"**.
2. Mở `/reports/inventory`, đổi bố cục cột, bấm Lưu.
3. Chạy `select branch_id, updated_at from report_templates order by branch_id;` →
   **chỉ** hàng `branch_id IS NULL` có `updated_at` mới; các hàng theo chi nhánh không đổi.
4. Chuyển sang một chi nhánh **chưa** có bản riêng → thấy bố cục vừa lưu ở bước 2 (kế thừa).
5. Chuyển sang chi nhánh **đã** có bản riêng (từ demo UOW-01) → vẫn thấy bố cục riêng của nó,
   không bị bước 2 đè.

## In scope

- FE: `scope = useIsChainSelected() ? "chain" : "branch"` trong `useReportColumnTemplate`.
- BE: `writeScopeWhere` ở delete handler dùng `IsNull()` cho bản chuỗi, để chi nhánh không
  xoá được bản chuỗi (AC-06).
- Test cho hai AC trên.

## Not in scope

- Kiểm quyền riêng cho việc sửa bản chuỗi. Bốn controller đang **chú thích tắt**
  `@RequirePermission(TEMPLATE_MANAGE)` ở create/update/delete; ticket này không bật lại
  (A-10) — ai vào được chế độ chuỗi (`canViewChain()`) thì sửa được bản chuỗi.
- Ba miền invoice / debt / profit (UOW-03).

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| `isChain` persist ở localStorage nhưng `canViewChain()` có thể trả false ⇒ `scope` lệch với cái người dùng thấy | Dùng đúng selector `useIsChainSelected()` (đã gộp sẵn `canViewChain()`), không đọc thẳng `useBranchStore(s => s.isChain)` |
| `setView()` đổi chuỗi ↔ chi nhánh **không** reload trang | `queryKey` đã mang `scope` từ T-01-05 |

## Definition of done

- [x] AC-05, AC-06 pass
- [x] `pnpm --filter @erp/api test` xanh
- [x] Lưu ở chế độ chuỗi không chạm hàng nào có `branch_id` — vị từ tầng chuỗi chỉ có `IsNull()`, có ca test khẳng định hình dạng vị từ
- [x] Demo script chạy được — đường ghi tầng chuỗi đo qua API (`scope=chain` sửa tại chỗ; `scope=branch` lên id bản chuỗi trả 404 ở delete)

**Một điểm chưa đo bằng UI:** kịch bản demo bước 1–2 (bật "Toàn chuỗi" trên header rồi bấm Lưu)
chưa chạy trên trình duyệt — tài khoản seed vào thẳng chế độ chi nhánh. Đường mã đã có test và
đã đo ở tầng API; ai chạy demo nên bấm qua UI một lượt để chốt.
