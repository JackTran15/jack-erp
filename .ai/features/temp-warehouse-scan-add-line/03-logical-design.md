---
feature: temp-warehouse-scan-add-line
adr_count: 6
---

# Logical design — Sửa luồng quét mã ở màn "Kho tạm"

Toàn bộ thay đổi nằm trong `apps/pos-web`. Không có endpoint mới, không có migration,
không đụng `apps/api`.

## Approach

Ba lỗi trong báo cáo QA đều là **một lỗi gốc: trạng thái được đọc ở sai thời điểm.**
Ô *Hàng hóa* chạy hai đường chọn-hàng song song (đường debounce và đường Enter), cả hai
cùng ghi vào một draft Zustand, rồi `onSubmitQuery` lại đọc draft đó qua **closure React
đã cũ** — nên Enter thấy `product = null` trong khi draft đã có hàng. Ô *Vị trí* thì được
ghi bởi một promise không ai đợi và không ai hủy, nên nó mang kệ của mặt hàng trước.

Bản sửa gom về **một đường duy nhất**, tuần tự, không phụ thuộc nhịp render:

```
Enter / click gợi ý
   └─ resolve mặt hàng   (gợi ý đang nổi → khớp tuyệt đối → tìm gần đúng)
        └─ chọn hàng     (setProduct + xóa vị trí ngay + bắt đầu tra kệ)
             └─ await lượt tra kệ đang chạy của chính mặt hàng đó
                  └─ đọc draft bằng store.getState()   ← không qua closure
                       └─ POST /temp-warehouse/lines
                            └─ giữ carrier, xóa hàng+vị trí, focus về ô Hàng hóa
```

Đường debounce chỉ còn một việc: **đổ danh sách gợi ý** (dòng đầu nổi sẵn). Nó không còn
tự chọn hàng nữa, nên hai đường không còn đua nhau và biến `claimRef` khử trùng biến mất
cùng lý do tồn tại của nó.

## Alternatives rejected

| Option | Why not |
|---|---|
| Giữ 2 nhịp Enter (Enter → focus nút Thêm → Enter) và chỉ vá chỗ đọc state cũ | Chốt A-01: thủ kho muốn 1 nhịp. Vá xong vẫn còn 2 lần bấm cho mỗi mã |
| Đổi thẳng mặc định của `PosSearchPopover` (luôn highlight dòng đầu) | `PosSelect` cũng dựng trên popover này → mọi dropdown POS đổi hành vi Enter. Vi phạm A-04 / AC-09 |
| Cho `handleAddRow` nhận mặt hàng + vị trí qua tham số thay vì đọc `getState()` | Sinh 2 đường dựng body (nút Thêm dùng draft, Enter dùng tham số) → chính là kiểu lệch đã đẻ ra lỗi này |
| Chặn nút Thêm khi *Vị trí* trống để ép dữ liệu sạch | Chốt A-03. Có mặt hàng vốn không gán kệ; chặn là đứng hình cả ca quét |
| Mở khóa ô *Vị trí* cho chọn tay | Chốt A-03: giữ read-only. Nếu G4 cho thấy còn nhiều mặt hàng thiếu kệ thì mở feature riêng |
| Bắt sự kiện máy quét riêng (đo tốc độ gõ để phân biệt quét vs gõ tay) | A-06: máy quét là bàn phím ảo, không có sự kiện riêng. Đoán theo tốc độ gõ là heuristic dễ sai |
| Đồng bộ luôn Checkout theo cùng một khuôn | Ngoài phạm vi (Out of scope trong intent). Checkout đang chạy tốt vì nó **xóa ô tìm** sau khi thêm |
| Thêm `jsdom` + `@testing-library/react` để test component | Cả monorepo **không có** dependency nào loại đó; 7 test hiện có của `pos-web` đều là test logic thuần trên `lib/page-libs`. Xem ADR-06 |

## State ownership

| State | Owner | Lifetime | Thay đổi |
|---|---|---|---|
| `toolbarDraft.{carrier,product,location}` | `fast-stock-transfer-workflow.store` (Zustand) | Cho tới khi Thêm xong / đổi tab | `resetToolbarAfterAdd` nay nhận carrier hiện tại thay vì `null` |
| Chuỗi đang gõ trong ô *Hàng hóa* | `fast-stock-transfer-picker.store` → `productToolbar.query` | Cho tới khi chọn hàng / Thêm xong | Không đổi |
| `suggestions` / `highlightIdx` / `open` | Nội bộ `PosSearchPopover` | Trong lúc popover mở | `highlightIdx` khởi tạo 0 khi bật `autoHighlightFirst` |
| Lượt tra kệ đang chạy | `useRef` trong `use-fast-stock-transfer-actions` | Từ lúc chọn hàng tới lúc Thêm xong | **Mới**: giữ cả `promise`, không chỉ `itemId` |
| Cờ "đang thêm dòng" | `addLineMutation.isPending` (TanStack Query) | Trong lúc POST | Dùng để chặn Enter dồn (AC-05) |

Zustand `set` là đồng bộ, nên `store.getState()` ngay sau `setToolbarProduct(p)` đã thấy
`p`. Đây là điều làm cho đường "chọn rồi thêm ngay trong cùng một tick" chạy được mà
không phải chờ React commit — và cũng là tiền lệ đã có trong repo
(`useCheckoutCartActions` đọc `usePosCheckoutUiStore.getState()`).

## Contracts

Không có contract mới. Ba endpoint đang dùng, giữ nguyên:

| Endpoint | Vai trò trong luồng | Ghi chú |
|---|---|---|
| `GET /pos/branches/:id/catalog/lookup?code=` | Khớp **tuyệt đối** mã vạch/SKU | Trả 0 dòng khi mặt hàng chưa gán mã vạch → đây là nguồn của "lâu lâu" (A-08) |
| `GET /pos/branches/:id/catalog?search=` | Tìm gần đúng ILIKE tên/SKU/mã vạch | Đường rơi về khi lookup trượt |
| `POST /inventory/preferred-shelf/batch` | Kệ ưu tiên của (itemId, storageId) | `batchPreferredShelf`; nay được `await`, và có `.catch` |
| `POST /pos/temp-warehouse/lines` | Thêm dòng | `sourceLocationId` + `notes` đều optional → dòng không kệ vẫn hợp lệ |

## Error taxonomy

| Condition | Hành vi | AC |
|---|---|---|
| Chưa chọn người vận chuyển | `setPageError("Vui lòng chọn người vận chuyển.")`, không POST, focus về ô Người vận chuyển | AC-03 |
| Enter khi ô trống, chưa chọn hàng | Không làm gì, không báo lỗi | AC-04 |
| Lookup + tìm gần đúng đều 0 kết quả | Popover hiện "Không có kết quả.", giữ nguyên chuỗi đã gõ, không POST | AC-08 |
| Nhiều ứng viên | Popover mở, dòng đầu nổi sẵn, **không** POST; Enter kế tiếp mới chọn+thêm | AC-06, AC-07 |
| `batchPreferredShelf` lỗi/timeout | `.catch` → vị trí về `null`, dòng vẫn thêm được | AC-12 |
| `POST lines` lỗi | `setPageError(getErrorMessage(err))` như hiện tại; draft **không** bị xóa để quét lại không mất công | — |
| Enter tới khi đang POST | Bỏ qua (`addLineMutation.isPending`) | AC-05 |

## Điểm sửa cụ thể

| File | Sửa gì |
|---|---|
| `lib/page-libs/fast-stock-transfer/fast-stock-transfer-scan-resolve.ts` | **Mới.** Hàm thuần `decideScanOutcome({ highlighted, query, candidates })` → `add` / `suggest` / `empty` / `none`. Đây là chỗ duy nhất chứa bảng quyết định của phím Enter, và là chỗ duy nhất có test tự động (ADR-06) |
| `components/common/PosSearchPopover/PosSearchPopover.tsx` | Thêm prop `autoHighlightFirst` (mặc định `false`) và ref mệnh lệnh `popoverRef` với `close()`. Không đổi mặc định nào |
| `.../AddLineRow/FastStockTransferProductSearchInput.tsx` | Bỏ auto-select khỏi `search`; `onSelect` = chọn + thêm; `onSubmitQuery` = resolve → chọn + thêm; đóng popover sau khi chọn |
| `hooks/.../use-fast-stock-transfer-product-picker.ts` | Bỏ `claimRef` / `resetLookupGuard` / tham số `onAutoSelect`; tách hàm `resolveOneProduct(q)` trả về `PosCatalogLine \| null \| PosCatalogLine[]` |
| `hooks/.../use-fast-stock-transfer-actions.ts` | `applyPreferredShelf`: xóa vị trí trước, giữ promise, có `.catch`. `handleAddRow`: async, `await` promise kệ, đọc `getState()`, `resetToolbarAfterAdd(carrier)` |
| `.../AddLineRow/AddLineRow.tsx` | Sau khi thêm thì focus về ô *Hàng hóa*; thiếu carrier thì focus ô *Người vận chuyển* |

| `hooks/.../use-fast-stock-transfer-table-columns.tsx` | Ô sửa SKU trong dòng (`SkuEditCell`) cũng tiêu thụ picker hook → đổi theo API mới |

Không đụng: `apps/api`, `PosSelect`, mọi file của Checkout / Đổi trả hàng.

> **Đính chính 2026-08-19 (phát hiện lúc làm T-01-03).** Bản G2 ban đầu ghi
> "`handleEditDraftProduct` / `handleStartEdit` / `handleSaveRow` hiện không component nào
> gọi" — **sai**. Bộ máy sửa dòng có nối UI, qua `SkuEditCell` và `TransporterEditCell`
> render inline trong `use-fast-stock-transfer-table-columns.tsx`; grep ban đầu trượt vì
> chúng được gọi qua `actions.handleEditDraftProduct` chứ không phải tên trần.
> Không quyết định nào trong ADR-01..06 đổi vì việc này — chỉ thêm một file vào danh sách
> phải sửa, và ô sửa SKU trong dòng cũng mất auto-select như ô toolbar (nhất quán, và lấy
> lại được bằng bàn phím khi UOW-02 bật `autoHighlightFirst`).

## ADRs

### ADR-01 — Enter đi qua một đường resolve → chọn → thêm duy nhất
**Context:** `onSubmitQuery` đọc `toolbarDraft.product` từ closure của lần render trước;
khi máy quét gửi Enter ngay sau chuỗi ký tự, closure đó vẫn thấy `null` nên Enter "không ăn".
**Decision:** Enter không đọc state React. Nó gọi một hàm bất đồng bộ tự resolve mặt hàng,
gọi `setToolbarProduct`, rồi đọc lại draft bằng `usePosFastStockTransferWorkflowStore.getState()`.
**Consequences:** `handleAddRow` thành `async`. Đổi được vì Zustand `set` đồng bộ; nếu sau này
draft chuyển sang `useState` thì ADR này gãy — ghi lại để người sau biết vì sao nó bám Zustand.
**Status:** accepted

### ADR-02 — Mọi thay đổi ở `PosSearchPopover` là prop opt-in
**Context:** `PosSelect` cũng dựng trên `PosSearchPopover`, nên đổi mặc định là đổi hành vi
Enter của **mọi** dropdown trong POS, gồm cả Checkout đang chạy ổn.
**Decision:** Thêm `autoHighlightFirst?: boolean` (mặc định `false`) và `popoverRef` để đóng
popover bằng lệnh. Không sửa dòng nào của các consumer khác.
**Consequences:** AC-09 kiểm được bằng test và bằng đọc diff (không file Checkout nào bị chạm).
Đổi lại, hai màn POS có hành vi Enter khác nhau — chấp nhận, xem ADR-03.
**Status:** accepted

### ADR-03 — Bỏ auto-select trong adapter tìm kiếm; chỉ chọn qua `onSelect`
**Context:** `productHybridAdapter` vừa trả gợi ý vừa **tự chọn hàng** qua callback
`onAutoSelect`. Nó được gọi từ hai chỗ (debounce và Enter) nên phải có `claimRef` khử trùng,
và đường tự chọn không đi qua `selectItem` nên popover không bao giờ đóng — đúng cái khung
"Không có kết quả." treo trong ảnh QA.
**Decision:** Adapter chỉ trả dữ liệu. Việc chọn hàng do popover (click/Enter) hoặc do
`onSubmitQuery` quyết định. Xóa `claimRef` và `resetLookupGuard`.
**Consequences:** Với mã khớp tuyệt đối, người dùng thấy 1 dòng gợi ý trong ~150ms trước khi
Enter tới — chấp nhận được, và với nhịp quét thật thì Enter tới trước cả debounce.
Checkout vẫn giữ kiểu auto-add trong adapter → hai màn lệch khuôn; **cố ý**, vì đồng bộ hóa
Checkout nằm ngoài phạm vi và Checkout không dính lỗi (nó xóa ô tìm sau khi thêm).
**Status:** accepted

### ADR-04 — Chọn hàng bằng chuột hay Enter đều thêm dòng ngay
**Context:** Lời than gốc là *"phải nhấn chọn sp ở option dưới select, **sau đó mới enter được**"*
— tức chọn bằng chuột xong vẫn còn một nhịp nữa.
**Decision:** `onSelect` (click gợi ý) và Enter-trên-dòng-đang-nổi đi chung một đường: chọn
rồi thêm dòng. Nút "Thêm" giữ lại cho đường sửa lỗi (vd thêm hụt vì thiếu carrier).
**Consequences:** Không còn "xem trước rồi mới thêm". Với màn quét kho thì đây là điều mong
muốn; với màn có tiền bạc thì sẽ không hợp — thêm một lý do nữa để không lây sang Checkout.
**Status:** accepted

### ADR-05 — Thêm dòng phải đợi lượt tra kệ đang chạy
**Context:** `applyPreferredShelf` chạy `void lookup().then(...)` — không ai đợi, không ai
`catch`. Thêm dòng ngay sau khi quét thì kệ chưa về, và ô *Vị trí* lúc đó vẫn giữ kệ của mặt
hàng **trước**, nên dòng có thể được lưu với kệ sai.
**Decision:** Xóa vị trí **trước** khi gọi (không bao giờ còn kệ cũ), giữ `{itemId, promise}`
trong ref, và `handleAddRow` `await` promise đó khi nó thuộc về mặt hàng đang chọn. Thêm
`.catch` để promise luôn settle.
**Consequences:** Mỗi lần Thêm chậm thêm đúng phần còn lại của một request đã bay. Không đặt
timeout nhân tạo: promise luôn settle nhờ `.catch`, và request đã có timeout của HTTP client.
Nếu G4 đo thấy `batchPreferredShelf` chậm tới mức cản nhịp quét thì mở lại ADR này.
**Status:** accepted

### ADR-06 — Test tự động chỉ cho phần logic thuần; phần bất đồng bộ nghiệm bằng demo thật
**Context:** `apps/pos-web` có 7 file test, **tất cả** đều là logic thuần trong `lib/page-libs`
chạy bằng vitest môi trường node. Cả monorepo không có `jsdom`, `@testing-library/react` hay
`happy-dom` ở bất kỳ workspace nào, và `vite.config.ts` của pos-web không có khối `test:`.
Nghĩa là: không thể render component hay bắn sự kiện bàn phím trong test nếu không **thêm
dependency mới** cho một repo đang cố ý không có test DOM.
**Decision:** Rút bảng quyết định của phím Enter ra một hàm thuần
(`decideScanOutcome`) trong `lib/page-libs/fast-stock-transfer/` và test hàm đó theo đúng
khuôn 7 test đang có. Phần còn lại — thứ tự bất đồng bộ của lượt tra kệ, focus, đóng popover —
nghiệm bằng **Demo script** của từng UoW ở G4, có máy quét thật.
**Consequences:** AC-01, AC-04..AC-08 có test tự động qua hàm thuần. AC-02, AC-03, AC-09..AC-13
**không** có test tự động — chúng phụ thuộc DOM/nhịp thời gian và chỉ được nghiệm ở G4.
Đây là đánh đổi có ý thức: đổi lại là không thêm dependency và không dựng hạ tầng test DOM
trong một feature sửa lỗi. Nếu về sau repo nhận `@testing-library/react` thì bổ sung test
component cho các AC đó.
**Status:** accepted
