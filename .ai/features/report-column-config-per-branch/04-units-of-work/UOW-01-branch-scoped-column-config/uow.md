---
id: UOW-01
slug: branch-scoped-column-config
title: Chi nhánh giữ bố cục cột riêng ở Báo cáo Kho, kế thừa bản chuỗi khi chưa cấu hình
demoable: true
duration: 2d
depends_on: []
requirements: [US-01, US-03]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-07, AC-08, AC-09, AC-11]
risk: medium
status: todo
rollback: revert migration `AddBranchScopeToReportTemplates` (down() xoá mềm bản theo chi nhánh, dựng lại chỉ mục cũ — không mất bản chuỗi)
---

# UOW-01 — Bố cục cột theo chi nhánh (đầu-cuối trên Báo cáo Kho)

Lát cắt dọc đầy đủ: lược đồ → module phạm vi dùng chung → 5 handler của miền
`inventory-reports` → hook FE. Chọn miền kho vì đây là miền **duy nhất** đã bật lưu cấu
hình cột từ đầu (`TEMPLATE_SOURCES` bật `inventory` trước `invoice`), nên demo được ngay
trên UI thật mà không phải mở thêm miền nào.

## Demo script

1. Đăng nhập backoffice, đứng ở chi nhánh **Hồ Chí Minh**, mở `/reports/inventory`
   (Tổng hợp tồn kho).
2. Bấm "Hiển thị cột", ẩn 2 cột và kéo 1 cột lên đầu, bấm Lưu. Tải lại trang → bố cục giữ nguyên.
3. Chuyển sang chi nhánh **Hà Nội** (header → chọn chi nhánh). Mở lại đúng báo cáo đó →
   **không** thấy bố cục của HCM; thấy bố cục cấp chuỗi (hoặc bố cục riêng của Hà Nội nếu đã lưu).
4. Ở Hà Nội đổi bố cục khác hẳn rồi Lưu. Quay lại HCM → HCM vẫn nguyên bố cục bước 2.
5. Mở Adminer (`:18088`) chạy
   `select branch_id, report_type, name from report_templates order by branch_id;`
   → thấy đúng một hàng `NULL` (bản chuỗi) cộng một hàng cho mỗi chi nhánh, không hàng nào trùng.

## In scope

- Migration: đổi chỉ mục duy nhất sang có `branch_id`, nhân bản bản chuỗi sang mọi chi nhánh ACTIVE.
- `report-core/template-scope.ts`: phân giải phạm vi + vị từ đọc/ghi + copy-on-write, kèm unit test.
- Miền `inventory-reports`: cả 5 handler (list / get / create / update / delete) + DTO nhận `scope`.
- FE `report-template.api.ts`: gửi `scope`, đưa `scope` + `branchId` vào `queryKey`, đọc `id`
  từ response PATCH (vì copy-on-write có thể trả id mới).

## Not in scope

- Đường `scope=chain` từ UI chế độ "Xem theo chuỗi" (UOW-02).
- Ba miền invoice / debt / profit (UOW-03) — chúng vẫn chạy nguyên trạng theo chuỗi cho tới UOW-03.
- Chạy `openapi:generate` (gom về T-03-04, khi cả 4 DTO đã đổi xong).

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| `branch_id` là `varchar` còn `branches.id` là `uuid` — JOIN trong migration im lặng sai kiểu | Ép `b.id::text` tường minh; T-01-01 có bước đếm hàng trước/sau |
| Chỉ mục mới không chặn được trùng vì `NULL` (ADR-04) | `COALESCE(branch_id,'')`; T-01-01 kiểm bằng cách chèn thử hai bản chuỗi trùng tên |
| `down()` xoá mềm rồi `up()` chạy lại chèn trùng với hàng đã xoá mềm (ADR-06) | `NOT EXISTS` ở nhánh đích **không** lọc `deleted_at` |
| PATCH trả id khác id gửi lên (ADR-03) làm FE giữ id cũ rồi lần lưu sau tạo thêm bản | T-01-05 bắt buộc `invalidateQueries` + đọc id từ response |

## Definition of done

- [x] AC-01, AC-02, AC-03, AC-04, AC-07, AC-08, AC-09, AC-11 pass
- [x] `pnpm --filter @erp/api test` xanh (2 ca đỏ sẵn ở `auth.service.spec.ts`, đã đối chiếu trên cây sạch)
- [x] Migration chạy được cả `up` lẫn `revert` trên `erp_dev`, đếm hàng khớp kỳ vọng (3 → 7, revert/run lại vẫn 7)
- [x] Không handler nào của miền kho còn lọc chỉ bằng `organizationId` (ca canh gác trong `template-scope-parity.spec.ts`)
- [x] Mã backend viết bằng tiếng Anh
- [x] Demo script chạy được đầu-cuối trên máy dev — chạy thật trên trình duyệt, xem T-01-05
