---
feature: inventory-seed-category-parity
blocking_open: 0         # count of blocking + pending; must be 0 to pass G1
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Không test nào phụ thuộc vào đúng 28 mục mà `inventory.seed.ts` đang chèn — seed không được gọi trong test (e2e dùng `test-app.ts` và các seeder service) | high | yes | Phải sửa cả test đó; hoặc phát hiện seed đang được dùng làm fixture ngầm | confirmed | Akenzy chốt 12/09/2026. **Đã kiểm cùng ngày:** `grep -rn "inventory.seed\|inventory-seed" apps/api/src apps/api/test` chỉ cho ra chú thích văn xuôi ở `inventory-demo.seed.ts`, `org-baseline.seed.ts` và `cash-vouchers-phase2.e2e-spec.ts` — không file test nào import hay chạy seed này; chỉ hai script `seed:inventory` và `seed:dev-admin` gọi nó. File hiện có đúng 28 chuỗi mã danh mục. **Chờ Akenzy chốt** — A-01 là blocking nên G1 vẫn bị chặn |
| A-02 | Giữ nguyên `ON CONFLICT (organization_id, code) DO UPDATE SET name, display_order` của khối hiện tại là đúng: chạy lại seed sẽ cập nhật tên và thứ tự cho khớp constant | high | no | Seed chạy lần hai không cập nhật tên đã đổi, org demo mắc ở tên cũ | pending | — |
| A-03 | Cách dựng `VALUES` tham số hoá trong `org-baseline-seed.core.ts:330-350` chạy được nguyên xi ở `inventory.seed.ts` (cùng `AppDataSource.query`, cùng bảng, khác biến id) | high | no | Phải viết lại vòng lặp theo kiểu khác; không đổi kết quả | pending | — |
| A-04 | Test quét mã nguồn (đọc file `inventory.seed.ts` và assert không còn mã danh mục) là bằng chứng đủ cho AC-03, theo khuôn `rbac/employee-listing-surfaces.spec.ts` đã có trong repo | medium | no | Cần dựng DB trắng trong CI mới chặn được literal quay lại | pending | — |
| A-05 | Dựng DB trắng để kiểm AC-01 là việc Akenzy tự chạy (bộ phân loại quyền chặn `migration:run` của Claude) — xem [[migration-run-blocked-by-permissions]] | high | no | AC-01 không có bằng chứng chạy thật, chỉ có test quét mã nguồn và đọc mã | pending | — |
