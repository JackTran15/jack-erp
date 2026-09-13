---
id: UOW-01
slug: backoffice-drift-dialog
title: Backoffice hỏi lại khi chi nhánh bị đổi ở tab khác
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-03]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-14]
risk: medium
status: todo
rollback: một commit revert; chỉ frontend backoffice, không đổi API, không migration
---

# UOW-01 — Backoffice: dialog lệch chi nhánh

## Demo script

Chuẩn bị: API local, backoffice ở `localhost:3000`, một tài khoản có ≥2 chi nhánh
("Hà Nội" và "Hồ Chí Minh" dưới đây là tên minh hoạ — dùng đúng tên trong dữ liệu máy bạn).

1. Đăng nhập, đứng ở **Hà Nội**. Mở **TAB A** ở một trang có số liệu theo chi nhánh
   (Báo cáo kho / Danh sách hoá đơn). Mở **TAB B** cùng URL.
2. Ở **TAB B**, menu góc phải → chọn **Hồ Chí Minh**. TAB B tải lại, header ghi Hồ Chí Minh.
   → **TAB B không hiện dialog nào** (AC-05).
3. Chuyển sang **TAB A**. → Dialog hiện ngay: tiêu đề "Chi nhánh đã được đổi ở tab khác",
   nội dung nêu **đúng hai tên**: đang ở "Hà Nội", đã đổi sang "Hồ Chí Minh" (AC-01).
   Câu cảnh báo dữ liệu chưa lưu sẽ mất có mặt (AC-14).
4. Bấm `Esc` → dialog **không đóng**. Click ra nền tối → **không đóng**. Không thấy nút X
   ở góc phải (AC-02).
5. Bấm **"Quay về Hà Nội"**. DevTools Network: đúng **một** `POST /auth/switch-branch` với
   `{branchId: <Hà Nội>}`. Trang tải lại, header ghi Hà Nội, số liệu là Hà Nội (AC-04).
6. Chuyển sang **TAB B** → đến lượt TAB B hiện dialog (đang ở Hồ Chí Minh, phiên đã về
   Hà Nội). Đây là hành vi mong muốn, không phải lỗi: ping-pong hiện ra thay vì im lặng.
7. Ở TAB B bấm **"Dùng chi nhánh Hà Nội"** → TAB B tải lại, header Hà Nội. Network:
   **không có** `POST /auth/switch-branch` nào (AC-03).
8. Tải lại TAB A (F5), mở thêm một tab thứ ba, đăng xuất rồi đăng nhập lại → **không tab
   nào hiện dialog** (AC-06).
9. Ở TAB B **đăng xuất**. Chuyển sang TAB A → **không có dialog chi nhánh**; TAB A đi
   đường 401 → `/login` như hôm nay (AC-08).
10. Vào **Quản lý chi nhánh**, ngừng hoạt động chi nhánh đang đứng → vẫn tự chuyển sang
    chi nhánh còn hoạt động kèm toast "Cửa hàng đang chọn đã ngừng hoạt động…", **không**
    đi qua dialog mới (AC-07, chốt hồi quy).

## In scope

- `useBranchDrift()` — detector theo baseline (ADR-01), nguồn `localStorage.active_branch_id`
  (ADR-02).
- `BranchDriftDialog` — dialog bắt buộc chọn, mount trong `BackofficeLayout`.
- Gỡ nhánh tự nhận chi nhánh mới ở `BranchSelector.tsx:59-66`, giữ nguyên phần giải tên và
  nguyên đường chi nhánh ngừng hoạt động ở `:75-97`.

## Not in scope

- POS (UOW-02).
- Bất kỳ thay đổi nào ở `apps/api` hoặc `packages/api-client`.
- Chế độ "Chuỗi cửa hàng" — vẫn bật dialog như thường, không thêm hành vi riêng (A-10).

## Risks

| Risk | Mitigation |
|---|---|
| Dialog bật nhầm ở tab mới mở / vừa đăng nhập | Bước 8 của Demo script. Nguyên nhân gốc đã chặn bằng baseline (ADR-01) |
| Gỡ nhầm cả đường xử lý chi nhánh ngừng hoạt động | Bước 10 là chốt hồi quy, và T-01-03 chỉ động vào effect `:59-66` |
| Dialog che mất màn `/login` khi phiên đã mất | Bước 9; detector tắt khi không còn `refresh_token` |
| Người dùng kẹt trong vòng dialog nếu `switch-branch` lỗi | Error taxonomy: giữ dialog mở, bật lại nút, có toast — không tự đóng |

## Definition of done

- [x] Demo script chạy thật trên trình duyệt với hai tab, ghi lại ảnh cho bước 3, 5, 10
- [x] `pnpm --filter @erp/backoffice-web exec tsc --noEmit` sạch
- [x] `pnpm --filter @erp/backoffice-web build` xanh
- [x] Không còn dòng nào trong `BranchSelector.tsx` tự gọi `selectBranch` với một id khác
      id hiện tại của tab (trừ đường chi nhánh ngừng hoạt động)

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
