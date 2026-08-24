---
id: UOW-01
slug: carrier-picker-branch-scope
title: Chọn được người vận chuyển trong nhân viên chi nhánh, tìm 3 trường, cuộn nạp thêm
demoable: true
duration: 1d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-07, AC-12, AC-13]
risk: medium
status: todo
rollback: revert diff — không có migration, không có feature flag; endpoint carriers vốn đã tồn tại và không đổi hợp đồng cũ (chỉ thêm field optional)
---

# UOW-01 — Người vận chuyển theo chi nhánh (Chuyển kho tạm)

## Demo script

1. Đăng nhập POS bằng tài khoản admin có `iam.user.read.all`, chọn chi nhánh B (chi nhánh có
   > 20 user active — nếu dữ liệu local không đủ thì seed thêm trước, xem A-07)
2. Vào màn Chuyển kho tạm, focus ô "Người vận chuyển" mà chưa gõ gì
   → dropdown hiện nhân viên của chi nhánh B, khác rỗng (AC-01)
3. Gõ một phần tên → danh sách thu hẹp (AC-02)
4. Xoá, gõ một phần email → đúng người đó hiện ra (AC-03)
5. Xoá, gõ mã nhân viên `NV…` → đúng người đó hiện ra, dòng có hiện mã (AC-04)
6. Xoá, cuộn xuống đáy dropdown → nạp thêm trang 2, danh sách dài ra, không lặp dòng (AC-05)
7. Gõ tên đầy đủ của một nhân viên chỉ thuộc chi nhánh C → không có kết quả (AC-07)
8. Chọn một người, thêm dòng vào phiếu, tải lại màn → dòng vẫn hiện đúng tên người vận chuyển (AC-13)
9. Đổi sang chi nhánh C, mở lại ô → danh sách là nhân viên chi nhánh C (AC-06)
10. Mở picker tìm mặt hàng ở màn Checkout, cuộn trong dropdown → vẫn cắt ở 8 gợi ý, không phát request (AC-12)

## In scope

- Đường đọc đầy đủ: `users` + `user_branch_assignments` + `employee_profiles` → controller →
  service FE → hook React Query → page hook → component picker.
- Phân trang cuộn ở `PosSearchPopover`, dưới dạng khả năng optional dùng chung.

## Not in scope

- Bộ lọc Thu ngân / NVBH ở màn Báo cáo theo ngày (UOW-02).
- Sửa `GET /branches/:id/salesmen` và picker NVBH ở màn Checkout.
- Sửa hành vi nuốt lỗi của `PosSearchPopover` (ghi nhận ở `03-logical-design.md`).

## Risks

| Risk | Mitigation |
| --- | --- |
| Chi nhánh local có < 20 user nên không kiểm chứng được cuộn nạp thêm (A-07) | Seed thêm user gán chi nhánh trước khi chụp evidence, hoặc tạm hạ `pageSize` trong lúc demo và ghi rõ trong báo cáo verify |
| Bỏ cắt `maxSuggestions` làm rò sang picker khác | Nhánh này chỉ chạy khi `loadMore` khác undefined; AC-12 canh đúng chỗ đó |
| Trang 2 lặp dòng của trang 1 khi hai user trùng tên | `ORDER BY` có tiebreaker `u.id`; AC-05 kiểm bằng mắt trên danh sách nối |

## AC không nằm trong `verifies:` của UoW này

**AC-06** (đổi chi nhánh thì danh sách đổi theo) vẫn do UOW-01 giao và vẫn nằm ở `verifies:` của
T-01-03 — chỗ quyết định traceability 13/13. Nó bị bỏ khỏi `verifies:` của UoW vì trường đó điều
khiển `evidence_check`, mà checker ấy chỉ biết một loại bằng chứng: ảnh chụp. Bước đổi chi nhánh
gọi `/auth/switch-branch`, cấp token mới rồi reload — session của bộ chạy thành cũ, và **mọi bước
sau nó cùng cả viewport chạy sau đều đỏ**. Đã thử, đã đo, xem `07-verification.md`.

Thay thế: cache picker tách theo chi nhánh qua `TEMP_WAREHOUSE_KEYS.CARRIERS(branchId, …)`, và
mọi query đều đi kèm `branchId` của store — reviewer T-01-03 đã xác nhận. Muốn có ảnh thì phải
chạy lần hai với `LOCAL_POS_BRANCH_ID` trỏ chi nhánh khác rồi đối chiếu hai bộ ảnh bằng mắt.

## Definition of done

- [x] AC-01 đến AC-07, AC-12, AC-13 pass
- [x] Không còn request `GET /branches/:id/salesmen` trên màn Chuyển kho tạm
- [x] `pnpm --filter @erp/api test -- temp-warehouse.service.spec.ts employee-listing-surfaces.spec.ts` xanh
- [x] `pnpm build:shared && pnpm build` sạch (bắt import mồ côi sau khi xoá code chết)
- [x] `pnpm openapi:generate` đã chạy, snapshot + schema generated đã commit
- [x] Demoed và accepted ở gate G4

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated and its commit sha matches HEAD
