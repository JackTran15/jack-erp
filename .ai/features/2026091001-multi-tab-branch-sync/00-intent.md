---
feature: multi-tab-branch-sync
slug: 2026091001-multi-tab-branch-sync
owner: Akenzy
created: 2026-09-10
status: draft
---

# Intent — multi-tab-branch-sync

## Problem

Hai tab, một phiên. Màn hình nói một chi nhánh, dữ liệu là của chi nhánh khác.

Phiên đăng nhập là **một-user-một-jti**, không phải một-tab-một-phiên. `switchBranch()`
(`apps/api/src/modules/auth/auth.service.ts:226`) **thu hồi jti hiện tại** rồi phát token
mới mang `branchId` mới. Mọi tab đang mở dùng chung phần lưu trữ đó, nên một cú đổi chi
nhánh ở TAB B là một cú đổi cho **cả trình duyệt**.

Ba nguồn sự thật về "chi nhánh đang đứng", và chúng lệch nhau được:

| Nguồn | Nơi lưu | Phạm vi | Ai đọc |
|---|---|---|---|
| Tên trên header | `useBranchStore.branchId/branchName` (zustand, trong bộ nhớ; `partialize` chỉ giữ `isChain` — `branch.store.ts:25`) | **từng tab** | người dùng |
| `X-Branch-Id` | `localStorage.active_branch_id` (`api-axios.ts:25`) | cả trình duyệt | `@Actor` — nhưng chỉ khi JWT không có |
| `branchId` trong JWT | access token | cả trình duyệt (qua refresh token dùng chung) | **`@Actor` ưu tiên trước hết** |

`@Actor` giải theo `jwt > header > jwtList` (`actor-context.decorator.ts:33`), nên **JWT
thắng** — thứ duy nhất người dùng không nhìn thấy.

### Backoffice — TAB A đọc dữ liệu chi nhánh B dưới cái tên chi nhánh A

1. TAB A và TAB B cùng đứng ở "Chi nhánh Hà Nội".
2. TAB B chọn "Chi nhánh Hồ Chí Minh" ở menu góc phải → `POST /auth/switch-branch` →
   `persistSwitchBranchResponse` ghi đè `refresh_token` + `active_branch_id`
   (`BranchSelector.tsx:49`), rồi `window.location.reload()` (`:52`).
3. Access token của TAB A **đã bị thu hồi** ở bước 2. Request kế tiếp của TAB A trả 401 →
   interceptor refresh bằng `refresh_token` dùng chung (`api-axios.ts:96-128`) → token mới
   **mang branchId Hồ Chí Minh** (`auth.service.ts:161-166` giữ `session.branchId`).
4. TAB A giờ trả về dữ liệu **Hồ Chí Minh**, trong khi header vẫn ghi **Hà Nội** — zustand
   trong bộ nhớ tab không hề biết gì.
5. Rồi effect ở `BranchSelector.tsx:59-66` đọc `localStorage` và **âm thầm** ghi đè store
   sang Hồ Chí Minh. Đó chính là "header activebranch bị set lại": không ai báo, tên đổi
   một mình, và giữa bước 4 với bước 5 là một khoảng thời gian màn hình nói dối.

### POS — hai tab giành nhau phiên

POS còn nặng hơn một bậc, vì `PosLocationIndicator` **tự sửa** theo chiều ngược lại:
effect lúc mount so `branchId` trong JWT với chi nhánh của store rồi gọi
`switch-branch` để kéo token về chi nhánh của **tab mình**
(`PosLocationIndicator.tsx:38-57`).

- `Authorization` lấy từ `localStorage.pos_access_token` — **dùng chung mọi tab**
  (`apps/pos-web/src/lib/common/api-axios.ts:21`).
- `X-Branch-Id` lấy từ `usePosBranchStore.getState().branchId` — **trong bộ nhớ từng tab**
  (`:29`). Nhưng JWT thắng, nên header này không cứu được gì.

Nên: TAB B đổi sang HCM → TAB A vẫn hiện "Hà Nội" nhưng đọc dữ liệu HCM; và ngay khi TAB A
mount lại (đổi route, mở lại tab), effect kia **đá phiên ngược về Hà Nội** — lần này đến
lượt TAB B nói dối. Hai tab lần lượt cướp phiên của nhau, không ai được báo.

## Success signal

- TAB A quay lại (focus) sau khi TAB B đã đổi chi nhánh → hiện **dialog bắt buộc chọn**:
  "Chi nhánh đã được đổi ở tab khác", hai nút `Dùng chi nhánh <mới>` và
  `Quay về <cũ>`. Không đóng được bằng Esc, click ra ngoài hay nút X.
- Dialog nói rõ hai hệ quả: **dữ liệu chưa lưu trên trang này sẽ mất**, và chọn "quay về"
  thì **tab kia sẽ được hỏi lại**.
- Chọn `Dùng chi nhánh <mới>` → tab tải lại, header và dữ liệu cùng là chi nhánh mới.
- Chọn `Quay về <cũ>` → `POST /auth/switch-branch` về chi nhánh cũ, tab trở lại đúng
  chi nhánh cũ; TAB B lần focus kế tiếp nhận đúng dialog đó (ping-pong có kiểm soát,
  không phải im lặng).
- Không còn khoảnh khắc nào header ghi chi nhánh X trong khi lưới/báo cáo là chi nhánh Y:
  hai đường âm thầm sửa store (`BranchSelector.tsx:59-66`) và âm thầm đổi phiên
  (`PosLocationIndicator.tsx:38-57`) đều phải đi qua dialog.
- POS: mở hai tab, đổi chi nhánh ở tab B, chuyển về tab A → dialog, **không** có
  `POST /auth/switch-branch` nào tự bắn trước khi người dùng chọn.

## Out of scope

- **Chi nhánh độc lập theo từng tab** (bỏ `branchId` khỏi JWT, để server ưu tiên
  `X-Branch-Id`, chuyển sang `sessionStorage`). Chủ sở hữu chốt 2026-09-10: làm dialog
  trước. Hướng này được ghi lại ở ADR-01 như việc kế tiếp, không làm ở đây.
- Đổi thứ tự `jwt > header > jwtList` trong `@Actor`. **Không đụng backend** ở feature này.
- Đăng xuất / hết phiên ở tab khác (`refresh_token` biến mất). Đường đó đã có xử lý riêng
  ở interceptor; feature này chỉ được **không** bật dialog chi nhánh trong tình huống đó.
- Chế độ "Chuỗi cửa hàng" (`isChain`) — vẫn phát hiện lệch như thường, nhưng không thêm
  hành vi mới nào cho chế độ chuỗi.
- Đồng bộ tức thời không cần focus (BroadcastChannel, websocket push). Chỉ dùng sự kiện
  `storage` + `focus`/`visibilitychange`.
- Backoffice ↔ POS: hai app dùng khoá khác nhau (`refresh_token` vs `pos_refresh_token`)
  và **hai phiên server khác nhau**, nên không ảnh hưởng nhau. Không xử lý chéo app.
- Giữ nguyên dữ liệu đang nhập dở khi đổi chi nhánh. Chủ sở hữu chốt: chỉ **cảnh báo**
  trong dialog, không cố khôi phục form.

## Constraints

- **Không đổi backend, không migration, không `openapi:generate`.** Toàn bộ nằm ở hai SPA.
- Một phiên cho mỗi người dùng là tính chất của thiết kế hiện tại: "quay về chi nhánh cũ"
  **luôn** kéo tab kia theo. Dialog không xoá được ràng buộc đó, chỉ làm nó hiện ra.
- `refetchOnWindowFocus: false` ở cả hai app (`backoffice-web/src/App.tsx:71`,
  `pos-web/src/lib/common/query-client.ts:8`) — không thể dựa vào TanStack Query để phát
  hiện lệch; phải tự bắt `storage` + `focus`.
- **Không có test runner ở frontend**: `vitest` không có trong `node_modules/.bin` của
  root lẫn hai app, `"test": "echo test"` ở cả hai `package.json`. Nghiệm thu bằng
  `tsc --noEmit`, `build` và demo trên trình duyệt thật.
- Dialog dùng lại `Dialog` của `@erp/ui` (backoffice) và `PosDialog` (POS). Không dựng
  primitive mới.
- Mọi chuỗi hiển thị bằng tiếng Việt.
