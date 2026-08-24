---
id: UOW-02
slug: bien-mat-khoi-o-chon
title: Cửa hàng đã ngừng biến mất khỏi mọi ô chọn, ở cả backoffice lẫn POS
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12]
risk: high
status: todo
rollback: revert 3 commit; không có migration. Cache `branch-status:*` trong Redis tự hết hạn
---

# UOW-02 — Biến mất khỏi mọi ô chọn

Đây là lát cắt mang lại phần lớn giá trị của cả feature, và cũng là lát rủi ro nhất: nó đổi
`resolveUserBranches` — hàm quyết định mọi người nhìn thấy chi nhánh nào.

Đòn bẩy: lọc ở đó thì `ActorContext`, `BranchScopeGuard`, `permittedBranchIds()` và **toàn bộ
inventory-report** tự động hết thấy cửa hàng đã ngừng, không phải sửa một dòng nào trong
`modules/inventory-reports/`. Màn chọn chi nhánh của POS cũng vậy: nó dựng danh sách từ
`payload.branchIds` chứ không gọi `/branches/me`.

## Demo script

1. Trước khi ngừng: đăng nhập backoffice, mở ô chọn chi nhánh ở header → thấy **Hà Nội**;
   mở POS → màn chọn chi nhánh có **Hà Nội**
2. Ngừng hoạt động Hà Nội (đường của UOW-01)
3. `curl GET /branches` và `GET /branches/me` → không còn Hà Nội;
   `GET /branches?includeInactive=true` → vẫn có
4. `curl POST /auth/switch-branch` với id Hà Nội bằng token cũ → 403
5. Gọi một endpoint nghiệp vụ bất kỳ bằng access token cũ đang đứng ở Hà Nội → bị từ chối
   **ngay**, không đợi hết 15 phút
6. Tải lại backoffice → ô chọn chi nhánh không còn Hà Nội, không kẹt lỗi
7. Tải lại POS → quay về màn chọn chi nhánh, danh sách không còn Hà Nội
8. Mở lại hoạt động Hà Nội → cả hai app thấy lại

## In scope

- Lọc trong `resolveUserBranches`, `BranchService.list`, `listMyBranches`; cờ `includeInactive`
- `switchBranch` từ chối chi nhánh đã ngừng
- `AuthGuard` từ chối request có `branchId` đã ngừng (ADR-02)
- Hoà giải chi nhánh đang chọn đã lưu ở localStorage, hai app; invalidate cache react-query

## Not in scope

- Bộ lọc và số liệu báo cáo (UOW-03)
- Trạng thái rỗng khi mất hết chi nhánh (UOW-05)

## Risks

| Risk | Mitigation |
|---|---|
| `AuthGuard` là guard toàn cục — hỏng ở đây là hỏng cả hệ thống | T-02-02 chỉ thêm một nhánh từ chối, mặc định là cho qua khi không đọc được cache; e2e phải phủ ca "cache rỗng" |
| Vòng phụ thuộc `AuthGuard` (common) → `BranchStatusService` (modules/branch) | Tách `BranchStatusService` sang chỗ `common/` truy cập được, hoặc `forwardRef`; quyết ở T-02-02 |
| Người đang thao tác dở bị đá ra giữa chừng | Đúng ý đồ (A-12); FE đã có đường xử lý `SESSION_REVOKED` |

## Definition of done
- [ ] AC-06..AC-12 pass
- [ ] Không một dòng nào trong `modules/inventory-reports/` bị sửa ở lát này
- [ ] e2e phủ ca cache Redis rỗng
- [ ] Demo được chấp nhận ở G4
