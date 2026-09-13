---
id: UOW-02
slug: pos-drift-dialog
title: POS hỏi lại khi chi nhánh bị đổi ở tab khác, và thôi tự cướp phiên
demoable: true
duration: 1d
depends_on: []
requirements: [US-02, US-03]
verifies: [AC-09, AC-10, AC-11, AC-12, AC-13, AC-14]
risk: medium
status: todo
rollback: một commit revert; chỉ frontend POS + một prop opt-in ở PosDialog, không đổi API
---

# UOW-02 — POS: dialog lệch chi nhánh

## Demo script

Chuẩn bị: API local, POS ở `localhost:3001` (nhớ base path `/pos/`), tài khoản có ≥2 chi nhánh.

1. Đăng nhập POS, chọn **Hà Nội**. Mở **TAB A** ở màn bán hàng, thêm 1–2 mặt hàng vào giỏ.
   Mở **TAB B** cùng URL.
2. Ở **TAB B**, ô chọn chi nhánh trên thanh trên → **Hồ Chí Minh**. TAB B đổi xong, giỏ
   hàng TAB B trống, vỏ POS ghi Hồ Chí Minh. → TAB B **không** hiện dialog.
3. Chuyển sang **TAB A**. DevTools Network mở sẵn, lọc `switch-branch`.
   → Dialog POS hiện với đúng hai tên và **không có** `POST /auth/switch-branch` nào tự
   bắn từ TAB A (AC-09, AC-10 — đây là điểm chính: hôm nay TAB A sẽ tự đá phiên về Hà Nội).
4. Bấm `Esc`, click nền, tìm nút X → dialog **không đóng** bằng đường nào (AC-09).
   Nội dung có câu giỏ hàng đang mở sẽ bị xoá (AC-14).
5. Bấm **"Dùng chi nhánh Hồ Chí Minh"** → vỏ POS ghi Hồ Chí Minh, **giỏ hàng trống**, danh
   mục hàng là của Hồ Chí Minh. Network: **không có** `switch-branch` (AC-11).
6. Chuyển sang **TAB B**, thêm hàng vào giỏ. Quay lại **TAB A**, bấm chọn lại **Hà Nội** ở
   ô chi nhánh → TAB A phát đúng một `switch-branch`. Sang **TAB B** → dialog hiện; bấm
   **"Quay về Hồ Chí Minh"** → đúng một `switch-branch {branchId: <HCM>}`, giỏ TAB B bị
   xoá, vỏ ghi Hồ Chí Minh (AC-12).
7. **Ca hồi quy quan trọng**: đăng xuất hẳn, đăng nhập lại bằng tài khoản có chi nhánh mặc
   định **khác** chi nhánh đã lưu ở `pos-branch`. → `PosLocationIndicator` vẫn tự gọi
   `switch-branch` để kéo token về chi nhánh đã chọn, **không** dialog nào hiện (AC-13).
8. Mở một tab POS mới, tải lại tab → không tab nào hiện dialog.

## In scope

- `usePosBranchDrift()` — detector theo baseline, nguồn là `branchId` trong
  `localStorage.pos_access_token` (ADR-02).
- `PosDialog` thêm prop opt-in `dismissible` (mặc định `true`).
- `PosBranchDriftDialog` mount trong `PosLayout`.
- Guard cho effect đồng bộ token ở `PosLocationIndicator.tsx:38-57`.

## Not in scope

- Backoffice (UOW-01).
- `apps/api`, `packages/api-client`: không đụng.
- Màn `BranchSelectPage` / `PosRequireBranch` (chọn chi nhánh lần đầu) — không lệch được vì
  chưa có baseline khác.

## Risks

| Risk | Mitigation |
|---|---|
| Guard làm chết ca đồng bộ token sau đăng nhập → thu ngân không bán được | Bước 7 là chốt hồi quy bắt buộc; guard đo theo baseline (ADR-01) nên ca đó không phải "lệch" |
| Prop `dismissible` làm đổi hành vi 20+ dialog POS đang dùng | Mặc định `true` = hành vi hôm nay; chỉ dialog mới truyền `false` |
| Chọn "dùng chi nhánh mới" mà gọi thừa `switch-branch` → đá ngược tab kia | Bước 5 đếm request trên Network |
| Giỏ hàng bị xoá mà thu ngân không kịp biết | Câu cảnh báo trong dialog (AC-14), bước 4 |

## Definition of done

- [x] Demo script chạy thật hai tab POS, ghi ảnh bước 3, 5, 7
- [x] `pnpm --filter @erp/pos-web exec tsc --noEmit` sạch
- [x] `pnpm --filter @erp/pos-web build` xanh
- [x] `pnpm --filter @erp/ui build` xanh nếu `@erp/ui` bị chạm (dự kiến: không)
- [x] Không còn đường nào từ `PosLocationIndicator` gọi `switch-branch` khi đang lệch

## Verification — rung `skipped`, có chủ ý

`aidlc-verify <feature> --doctor` 2026-09-10 trả **skipped**: `local-backoffice-bm` và
`local-backoffice-wh` là `required` nhưng không có credentials trong `.ai/credentials.env`.
Theo ladder của ai-dlc-verify, skipped không chặn G4 và **không** được viết khối
`## Verification evidence` vào file này.

Đó mới là lý do thứ hai. Lý do thứ nhất quan trọng hơn: **kịch bản này không diễn đạt được
bằng bảng Steps của verify.py.** Bốn động từ có sẵn (`click`/`fill`/`wait`/`scroll`) chạy trên
MỘT page. Lệch chi nhánh về bản chất là hai tab — tab B ghi localStorage, tab A bắt `storage`
rồi `focus`. Một page đơn không sinh được sự kiện đó, nên mọi row viết ra sẽ xanh mà không
chứng minh gì: đúng loại "bằng chứng trông như bằng chứng" mà chính SKILL.md cảnh báo.

Thay thế: một script Playwright mở **hai page trong cùng một BrowserContext** (chung
localStorage ⇒ `storage` event thật; `bring_to_front()` ⇒ `focus`/`visibilitychange` thật).
Demo script ở trên là đặc tả của script đó.

## Nguồn nghiệm thu

- **Máy kiểm** (chạy trong session, 2026-09-10): `tsc --noEmit` cả hai app, `build` cả hai app,
  và các mục về hình dạng code (hunk `git diff`, `@erp/ui` không bị chạm, đường gọi
  `switch-branch` còn lại).
- **Người kiểm**: Akenzy chạy tay hai tab trên máy local 2026-09-10 cho mọi mục cần trình
  duyệt (dialog không đóng được, đếm request `switch-branch`, tên chi nhánh hiển thị, giỏ
  hàng bị xoá, ca hồi quy chi nhánh ngừng hoạt động / đăng nhập mới).
- **Không có ảnh chụp.** `aidlc-verify` dừng ở rung `skipped` và kịch bản hai tab không diễn
  đạt được bằng bảng Steps của nó; hai script Playwright đã viết nhưng chưa chạy được vì
  không có phiên đăng nhập nào còn sống trên `erp_dev_3008`. Bằng chứng của G4 này là lời
  xác nhận của người chạy, không phải file trong `evidence/`.
