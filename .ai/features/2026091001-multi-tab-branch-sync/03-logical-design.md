---
feature: multi-tab-branch-sync
adr_count: 4
---

# Logical design — multi-tab-branch-sync

## Approach

Ba mảnh, lặp lại cho mỗi app, cộng một mảnh gỡ mìn ở chỗ code cũ đang tự sửa.

### 1. Detector — "chi nhánh của phiên có đổi sau khi tab này khởi tạo không?"

Một **module singleton cho mỗi tab** cộng một hook mỏng đọc nó qua
`useSyncExternalStore`. Không phải `useRef` trong hook: baseline có phạm vi **tab**, còn
`useRef` có phạm vi **instance** — và hook này có ít nhất hai chỗ gọi (dialog ở layout, và
chỗ đổi chi nhánh gọi `resetBaseline`). Hai instance ôm hai baseline khác nhau thì tab tự
đổi chi nhánh sẽ tự bật dialog cho chính mình (ADR-01).

```ts
// một bản cho mỗi tab, nằm ở tầng module
let baseline: string | null | undefined = undefined;  // chốt lần đọc đầu, không tự ghi lại
let snapshot = { drifted: false, sessionBranchId: null, tabBranchId: null };
const listeners = new Set<() => void>();
```

Tín hiệu để đọc lại: `storage` (bắn ở **tab khác**, đúng cái ta cần), `visibilitychange`
khi tab trở lại `visible`, `focus`, và một lần lúc mount. Ba tín hiệu sau là lưới an toàn
cho ca tab bị trình duyệt đóng băng và `storage` rơi mất.

`drifted = sessionBranchId != null && sessionBranchId !== baselineRef.current`.

Đo theo **baseline**, không đo theo zustand (ADR-01). Đây là chỗ dễ làm sai nhất và là
lý do cả hai ca hợp lệ — tab mới mở, và đồng bộ token sau đăng nhập — không bị dính dialog.

Nguồn "chi nhánh của phiên" khác nhau giữa hai app, có lý do (ADR-02):

| App | Đọc từ | Vì sao không đọc chỗ kia |
|---|---|---|
| backoffice | `localStorage.active_branch_id` | access token nằm trong bộ nhớ tab, lại đã bị thu hồi → không đọc được chi nhánh mới từ JWT |
| POS | `branchId` trong `localStorage.pos_access_token` (`parseAccessTokenPayload`) | khoá persist `pos-branch` chỉ nói ý muốn của tab đã ghi; JWT mới là thứ `@Actor` dùng |

Cả hai đều **tắt** khi phiên không còn (`refresh_token` / `pos_refresh_token` rỗng) — AC-08.

### 2. Dialog bắt buộc chọn

Backoffice dùng thẳng `Dialog`/`DialogContent` của `@erp/ui`, không sửa package (A-08):

```tsx
<Dialog open={drifted}>            {/* không truyền onOpenChange ⇒ không có đường tự đóng */}
  <DialogContent
    showCloseButton={false}
    onEscapeKeyDown={(e) => e.preventDefault()}
    onInteractOutside={(e) => e.preventDefault()}
  >
```

POS đi qua `PosDialog` và cần một prop opt-in `dismissible?: boolean` (mặc định `true`,
nên 20+ chỗ dùng không đổi hành vi — ADR-03). Nội dung dùng lại bố cục của
`PosErrorDialog` (icon + tiêu đề + hai nút) chứ không dựng khung mới.

Hai nút, đúng thứ tự: `Dùng chi nhánh <mới>` (chính) và `Quay về <cũ>`. Kèm câu cảnh báo
mất dữ liệu chưa lưu, và ở POS thêm câu về giỏ hàng (AC-14).

### 3. Hai hành động

| | backoffice | POS |
|---|---|---|
| Dùng chi nhánh mới | `setActiveBranch(new)` (đã đúng sẵn) → `window.location.reload()`. **Không** gọi `switch-branch`: token dùng chung đã mang chi nhánh mới | `setBranch(new, name)` + `resetCheckoutSelections()` + `queryClient.clear()`. Không reload, không gọi `switch-branch` (A-11) |
| Quay về chi nhánh cũ | `POST /auth/switch-branch {branchId: old}` → `persistSwitchBranchResponse` → `reload()` — đúng đường `moveTo` đang chạy | `switchBranch.mutate(old)` → `setBranch` + reset + `clear()` — đúng đường `handleChange` đang chạy |

Gọi thừa một `switch-branch` ở nhánh "dùng chi nhánh mới" sẽ **xoay jti lần nữa** và đẩy
chính tab vừa đổi vào trạng thái lệch. Đó là ping-pong do máy tự gây ra, khác hẳn ping-pong
do người dùng cố tình chọn "quay về" — cái sau chấp nhận được, cái trước thì không.

### 4. Gỡ hai đường tự sửa âm thầm

- `BranchSelector.tsx:59-66` — hôm nay effect này làm hai việc dính nhau: giải **tên** cho
  branchId hiện tại, và **đổi luôn branchId** sang giá trị mới trong localStorage. Giữ việc
  đầu, bỏ việc sau (AC-07). Đường xử lý chi nhánh ngừng hoạt động ở `:75-97` **không đụng**:
  nó phản ứng với chi nhánh biến mất khỏi `/branches/me`, không phải với lệch tab.
- `PosLocationIndicator.tsx:38-57` — thêm một guard: đang lệch thì không tự
  `switch-branch`. Không xoá effect: ca đăng nhập mới (JWT mang chi nhánh mặc định khác
  chi nhánh đã persist) vẫn phải chạy, và theo ADR-01 ca đó không phải lệch (AC-13).

## Alternatives rejected

| Option | Why not |
|---|---|
| **Chi nhánh theo từng tab**: bỏ `branchId` khỏi JWT, để `@Actor` ưu tiên `X-Branch-Id`, chuyển sang `sessionStorage` | Đây là cách sửa tận gốc và xoá hẳn lớp bug này — nhưng nó đụng `@Actor`, `switchBranch`, `refresh`, và **mọi** chỗ đọc `actor.branchId` trong `apps/api/src`. Sót một chỗ là rò dữ liệu chéo chi nhánh, loại lỗi không ai nhìn thấy cho tới khi thấy trên báo cáo. Chủ sở hữu chốt 2026-09-10: làm dialog trước. Ghi lại ở ADR-04 |
| So zustand với localStorage, không cần baseline | Đúng với ca "TAB B vừa đổi", sai với ca tab mới mở: store khởi tạo `branchId: getActiveBranch()` **lúc module load**, còn tên chi nhánh thì mãi sau mới có → mọi tab mới sẽ tự hỏi chính nó. Và ở POS thì nó chặn luôn ca đồng bộ token hợp lệ (AC-13) |
| `BroadcastChannel` hoặc websocket push để báo lệch tức thì | Thêm một kênh nữa để giữ đồng bộ, trong khi `storage` đã bắn đúng sự kiện cần, ở đúng các tab cần, không tốn hạ tầng. Người dùng cũng chỉ cần biết khi họ quay lại tab |
| Tự động nhận chi nhánh mới, chỉ hiện toast | Đó gần như **chính là bug hiện tại** (`BranchSelector.tsx:59-66` đang tự nhận, chỉ thiếu toast). Yêu cầu là được chọn, và im lặng đổi phạm vi dữ liệu tài chính là thứ không nên tự quyết hộ |
| Khoá tab kia (leader election qua `localStorage`) để chỉ một tab được đổi chi nhánh | Giải quyết sai vấn đề: người dùng có lý do chính đáng để mở hai chi nhánh cạnh nhau. Khoá chỉ biến "màn hình nói dối" thành "màn hình từ chối làm việc" |
| Tách detector + dialog thành package dùng chung cho cả hai app | Hai app đọc hai nguồn khác nhau (localStorage vs JWT), hai bộ dialog khác nhau (`@erp/ui` vs `PosDialog`), hai hành động khác nhau (reload vs reset giỏ). Phần dùng chung còn lại là ~15 dòng nối event listener. Một abstraction với hai nhánh `if (app === …)` đắt hơn hai file nhỏ. ADR-03 |
| Giữ nguyên dữ liệu đang nhập dở khi đổi chi nhánh (không reload, chỉ invalidate) | Form dở còn mang id kho/nhân viên/khách của chi nhánh cũ; submit lên là ghi nhầm chi nhánh — nặng hơn hẳn việc mất form. Chủ sở hữu chốt: chỉ cảnh báo trước |

## Contracts

**Không có API nào đổi.** `POST /auth/switch-branch` giữ nguyên hợp đồng, chỉ thêm một nơi
gọi nó. Không migration, không `openapi:generate`, không sửa `packages/api-client`.

### `useBranchDrift()` — backoffice

```ts
// apps/backoffice-web/src/hooks/useBranchDrift.ts
export function useBranchDrift(): {
  drifted: boolean;
  sessionBranchId: string | null;   // chi nhánh của phiên (localStorage)
  tabBranchId: string | null;       // baseline của tab
  resetBaseline: () => void;        // tab tự đổi chi nhánh thì gọi (AC-05)
}
```

### `usePosBranchDrift()` — POS

```ts
// apps/pos-web/src/hooks/common/use-branch-drift.ts
export function usePosBranchDrift(): {
  drifted: boolean;
  sessionBranchId: string | null;   // branchId trong pos_access_token
  tabBranchId: string | null;
  resetBaseline: () => void;
}
```

### `PosDialog` — thêm một prop

```ts
dismissible?: boolean;  // mặc định true; false ⇒ ẩn nút X, chặn Esc và click nền
```

## Error taxonomy

| Tình huống | Xử lý | Vì sao |
|---|---|---|
| `switch-branch` lỗi mạng / 5xx khi bấm "quay về cũ" | Toast `"Không thể đổi chi nhánh. Vui lòng thử lại."`, **dialog vẫn mở**, nút bật lại | Đóng dialog sau lỗi là trả người dùng về đúng màn hình nói dối |
| `switch-branch` trả 403 (chi nhánh cũ đã bị gỡ khỏi người dùng) | Toast báo chi nhánh cũ không còn dùng được, ẩn nút "quay về", chỉ còn "dùng chi nhánh mới" | Không có đường quay về thật, hỏi tiếp là hỏi vô nghĩa |
| Không đọc được JWT / JSON hỏng ở `pos_access_token` | Coi như **không lệch**, không dialog, không throw | Fail-open: một token đọc không ra không phải bằng chứng có lệch, và dialog chặn màn hình là thứ đắt nhất để bật nhầm |
| `localStorage` ném lỗi (chế độ riêng tư, bị chặn) | Detector im lặng trả `drifted: false` | Đúng hành vi của `auth-storage` hiện tại: không có nơi nào bọc try/catch quanh `localStorage`, nhưng detector chạy trên mọi trang nên nó phải chịu được |
| Danh sách `/branches/me` chưa tải, hoặc chi nhánh mới không có trong danh sách | Hoãn dialog cho tới khi có tên (A-05); nếu danh sách đã tải mà thiếu → để đường "chi nhánh ngừng hoạt động" sẵn có xử lý | Dialog không tên chi nhánh thì người dùng không chọn được gì có nghĩa |
| Phiên đã mất (không còn refresh token) | Không dialog; đi đường 401 → `/login` sẵn có | AC-08 |

## ADRs

### ADR-01 — Lệch đo theo baseline lúc tab khởi tạo, không theo state hiện tại

**Context:** "Chi nhánh trên header khác chi nhánh trong storage" là mô tả trực giác,
nhưng nó đúng cả trong hai ca hoàn toàn bình thường: tab vừa mở (store khởi tạo trước khi
có phiên, `branchName` còn `null`), và POS vừa đăng nhập (JWT mang chi nhánh mặc định,
khác chi nhánh đã persist — `PosLocationIndicator.tsx:38-57` tồn tại chính vì ca này).

**Decision:** Chốt baseline tại lần đọc đầu tiên của tab và **không bao giờ tự ghi lại**.
Lệch = giá trị hiện tại khác baseline, tức là "có ai đó đổi trong lúc tab này đang sống".
Tab tự đổi chi nhánh thì tự gọi `resetBaseline()`.

Baseline sống ở **tầng module**, không phải trong `useRef` của hook. Phạm vi của nó là
**tab**, và một tab có nhiều chỗ gọi hook: dialog ở layout, cộng chỗ đổi chi nhánh gọi
`resetBaseline`. Mỗi instance một `useRef` là mỗi instance một sự thật — `resetBaseline()`
ở chỗ này không tới được dialog ở chỗ kia. Ở POS, nơi đổi chi nhánh **không** reload trang,
hệ quả là tab vừa tự đổi chi nhánh lập tức tự bật dialog hỏi chính nó (vi phạm AC-05).
Backoffice chỉ thoát vì `window.location.reload()` xoá sạch mọi instance — đúng vì may,
không phải vì thiết kế. Hook đọc singleton qua `useSyncExternalStore` để mọi chỗ gọi nhìn
thấy cùng một trạng thái và cùng cập nhật khi baseline đổi.

**Consequences:** Hai ca hợp lệ trên đi qua đường cũ, không thấy dialog. Đổi lại, một tab
mở sẵn từ trước khi đăng nhập (hiếm: `/login` không mount layout) sẽ có baseline `null` —
xử lý bằng cách coi `null → giá trị` là không lệch. State ở tầng module có cái giá quen
thuộc: nó sống qua mọi lần unmount, nên `resetBaseline()` phải được gọi tường minh ở đúng
chỗ (`moveTo` của backoffice, `handleChange` của POS) chứ không trông vào việc component
bị tháo. `getSnapshot` phải trả về object đã cache — dựng object mới mỗi lần gọi là vòng
lặp render vô hạn của `useSyncExternalStore`.

**Status:** accepted

### ADR-02 — Hai app đọc hai nguồn "chi nhánh của phiên" khác nhau

**Context:** Thứ quyết định dữ liệu là `branchId` trong JWT (`actor-context.decorator.ts:33`).
Nhưng backoffice giữ access token **trong bộ nhớ** và jti của tab bị `switchBranch` thu hồi
(`auth.service.ts:226`), nên nó không có cách nào đọc được JWT mới. POS thì ngược lại: token
nằm ở `localStorage.pos_access_token`, dùng chung mọi tab.

**Decision:** backoffice đọc `localStorage.active_branch_id`; POS đọc `branchId` trong
`pos_access_token`. Không ép hai app dùng chung một nguồn.

**Consequences:** Backoffice đo gián tiếp — nếu có đường nào ghi `active_branch_id` mà
không đổi phiên thì nó báo lệch giả. Hôm nay chỉ có `persistSession`,
`persistSwitchBranchResponse` và `setActiveBranch` ghi khoá này, cả ba đều đi kèm đổi
phiên, nên rủi ro bằng không cho tới khi ai đó thêm đường thứ tư. POS đo trực tiếp thứ
server dùng, chính xác hơn, và cũng là thứ `PosLocationIndicator` đã đọc sẵn.

**Status:** accepted

### ADR-03 — Hai bản cài đặt riêng cho hai app, không tách package dùng chung

**Context:** Detector và dialog nghe giống nhau ở hai app.

**Decision:** Viết riêng: `useBranchDrift` + `BranchDriftDialog` cho backoffice,
`usePosBranchDrift` + `PosBranchDriftDialog` cho POS. Phần duy nhất chạm vào code dùng
chung là một prop `dismissible` cộng thêm cho `PosDialog`.

**Consequences:** Có trùng lặp thật: khoảng 15 dòng nối `storage`/`focus`/`visibilitychange`
xuất hiện hai lần. Đổi lại, mỗi bên đọc đúng nguồn của mình, dùng đúng bộ dialog của mình
(`@erp/ui` vs `PosDialog`, hai ngôn ngữ thiết kế khác hẳn nhau) và làm đúng hành động của
mình (reload vs reset giỏ hàng). Nếu sau này xuất hiện app thứ ba thì lúc đó hãy tách —
hai lần chưa đủ để biết cái gì thật sự chung.

**Status:** accepted

### ADR-04 — Giữ một phiên cho mỗi người dùng; chi nhánh theo tab để lại

**Context:** Gốc rễ của cả lớp bug này là chi nhánh được gắn vào **phiên**, không phải vào
**tab**: `switchBranch` thu hồi jti và phát token mới cho toàn trình duyệt. Dialog không
xoá được điều đó — nó chỉ làm điều đó hiện ra, và "quay về chi nhánh cũ" vẫn sẽ kéo tab kia
theo.

**Decision:** Ở feature này không đụng backend. Ghi lại hướng sửa gốc để làm sau: bỏ
`branchId` khỏi access token, đổi `@Actor` sang ưu tiên `X-Branch-Id` (đã có sẵn kiểm tra
`allowed.includes(headerBranch)` nên phạm vi quyền không nới ra), và chuyển chi nhánh đang
chọn sang `sessionStorage`.

**Consequences:** Người dùng vẫn không thể mở hai chi nhánh cạnh nhau — mỗi lần đổi vẫn là
đổi cho cả trình duyệt. Feature này chỉ đảm bảo họ **biết** điều đó thay vì đọc nhầm số
liệu. Khi nào việc so sánh hai chi nhánh cạnh nhau trở thành yêu cầu thật thì hướng ở trên
là việc kế tiếp, và nó cần một vòng rà soát mọi chỗ đọc `actor.branchId`.

**Status:** accepted
