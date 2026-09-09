---
feature: voucher-read-path-payload-trim
slug: 2026090801-voucher-read-path-payload-trim
owner: Akenzy
created: 2026-09-08
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Cắt payload đường đọc: chi tiết phiếu, badge điều chuyển, phiên/chi nhánh

## Problem

Ba khiếu nại rời nhau nhưng cùng một hình dạng: **client tải một tập lớn rồi chỉ dùng một
phần rất nhỏ của nó**. Cả ba đều nằm trên đường đọc, không đường nào đụng nghiệp vụ ghi.

### P1 — `GET /goods-receipts/:id` vẫn trả TOÀN BỘ dòng, dù đã có endpoint phân trang

`apps/backoffice-web/src/pages/purchase-orders/PurchaseOrdersPage.tsx:394-403` chạy

```ts
useQuery({ queryKey: ["goods-receipt", selectedId],
  queryFn: () => erpApi.GET("/goods-receipts/{id}", { params: { path: { id: selectedId! } } }) })
```

**mỗi lần người dùng tick chọn một dòng lưới** — không truyền `includeLines=false`, mà BE
mặc định `includeLines ?? true` (`goods-receipt.service.ts:1095-1105`). Đây chính là request
`b39dff3c-…` trong ảnh DevTools, trả về mảng dòng chạy tới index 72+.

Nghịch lý: cái panel "Chi tiết" ngay bên dưới **đã không dùng mảng đó nữa**. Nó phân trang
riêng qua `POST /v2/goods-receipts/{id}/lines/search`
(`PurchaseOrdersPage.tsx:979-996`, `LINES_PAGE_SIZE` mỗi trang). Nên toàn bộ số dòng tải về
trong `GET /:id` bị **vứt đi** ở trường hợp phổ biến nhất (chọn dòng để xem).

Quy mô, đo trên `erp_dev_3008`:

| bảng | số phiếu | dòng/phiếu (TB) | p95 | max |
| --- | --- | --- | --- | --- |
| `goods_receipt_lines` | 627 | **259,6** | 1 994 | **5 000** |
| `goods_issue_lines` | 459 | 15,1 | 68 | 128 |

Mỗi dòng còn kéo theo hai quan hệ `eager: true` (`item`, `location`), nên payload không
phải "vài dòng thừa" mà là hàng trăm object lồng nhau cho một cú click chọn.

`includeLines` **đã tồn tại** (`apps/api/src/modules/inventory/dto/voucher-detail-query.dto.ts`,
làm ở feature `2026083002`) và đã được 4 chỗ dùng đúng
(`PurchaseOrdersPage.tsx:334,632`, `GoodsIssuePage.tsx:293,609`). Chỗ hở là đúng query
chọn-dòng ở trên — và bản sao y hệt của nó ở `GoodsIssuePage.tsx:353-360`.

Không đóng được cửa bằng cách đổi mặc định của BE: ba nút **thật sự cần** cả mảng dòng —
"Nhân bản" (`:494`), "Sửa" (`:526`, vì `update()` thay toàn bộ dòng) và "In tem mã" khi
không tick phiếu nào (`:558`). Việc phải làm là chuyển ba nút đó sang nạp-khi-bấm.

### P2 — Badge "Điều chuyển từ cửa hàng khác (10)" đếm bằng cách tải cả danh sách

`apps/backoffice-web/src/hooks/useImportableTransferOrderCount.ts` gọi
`GET /inventory/transfer-orders/importable` rồi trả `data.length`. Hook này mount ở **ba**
nơi dùng chung một query key (`AppSidebar.tsx:42`, `MegaMenuPanel.tsx:43`,
`inventoryTabs.tsx:23`) — TanStack gộp thành một request, nhưng `AppSidebar` nằm trong layout
nên request đó chạy trên **mọi trang của backoffice**, kể cả khi người dùng không bao giờ mở
tab điều chuyển.

Giá thật nằm ở phía server, không ở payload. `TransferOrderService.listImportable`
(`transfer-order.service.ts:637-690`) nạp danh sách TO, rồi nạp các phiếu xuất bản gốc bằng
`giRepo.find(...)` **chỉ để cộng `lineTotal`** — mà `GoodsIssueEntity.lines` khai
`eager: true` (`goods-issue.entity.ts:119-121`) và mỗi `GoodsIssueLineEntity` lại eager
`item` + `location`. Đo trên `erp_dev_3008`, chi nhánh nặng nhất: 5 TO chờ nhập kéo theo
**163 dòng phiếu xuất** cùng quan hệ của chúng — để hiển thị đúng chữ số `5`.

Phụ: hook không kiểm quyền, trong khi route đòi `inventory.transfer.read`
(`transfer-order.controller.ts:383-385`) — tài khoản không có quyền ăn 403 trên mọi trang.

### P3 — `/branches/me` và `/auth/session`: cache tới đâu là thật sự còn thiếu

Ở đây tôi không đồng ý với cách đặt vấn đề, và nói trước khi làm: **phía client đã cache
rồi**, nên "thêm cache" không phải là việc còn thiếu.

- `/auth/session`: `useAuth.tsx:53` gọi đúng một lần mỗi lần khởi động app, query
  `staleTime: Infinity`. `QueryClient` đặt `refetchOnWindowFocus: false` (`App.tsx:66-74`).
- `/branches/me`: `useBranches.ts:37-48` đặt `staleTime: 5 * 60_000`.

Phần **chưa** cache là phía server, và chỉ một nửa của nó:
`AuthService.buildSessionInfo` (`auth.service.ts:429-439`) chạy song song ba việc —
`resolveUserRoles`, `resolveUserBranches` (đều đánh DB mỗi lần) và
`rbacService.getUserPermissions`, **vốn đã có Redis cache 300 s kèm invalidate**
(`rbac.service.ts:26-38,71-82`). `BranchService.listMyBranches` (`branch.service.ts:634-653`)
là hai truy vấn DB, không cache.

Rào chắn phải nêu ngay: **không được cache nguyên phản hồi `/auth/session`.**
`getSession(jti)` tra `sessionStore` trước và trả `null` khi phiên bị thu hồi
(`auth.service.ts:423-427`) — cache lớp ngoài là giữ một phiên đã thu hồi sống thêm đúng
bằng TTL. Chỉ phần dẫn xuất từ `userId + organizationId` (roles, branchIds) được phép cache.

## Success signal

1. Tick chọn một dòng ở **Nhập kho** và ở **Xuất kho** không còn tải dòng hàng: response
   `GET /:id` chứa `lines: undefined`, và số byte đo bằng DevTools trên một phiếu ≥ 200 dòng
   giảm ≥ 90 % so với hôm nay. **Không** thêm request nào trên đường này (vẫn đúng 1).
2. Ba đường thật sự cần dòng — Nhân bản, Sửa, In tem mã (không tick) — vẫn mở ra với đủ
   dòng như trước, trên phiếu 5 000 dòng cũng vậy. Phần chậm thêm chỉ rơi vào lúc bấm nút.
3. Badge điều chuyển đọc từ một endpoint đếm: phản hồi là một số, và server không còn nạp
   dòng phiếu xuất nào để dựng nó (chứng minh bằng log truy vấn, không bằng mắt).
4. Badge không còn bắn request khi người dùng thiếu `inventory.transfer.read` — hết 403 nền.
5. `/auth/session` và `/branches/me` phục vụ được từ cache Redis cho lần gọi thứ hai trở đi
   trong TTL, **và** một phiên bị thu hồi vẫn 401 ngay lập tức, một lần đổi vai trò/chi nhánh
   vẫn thấy hiệu lực ở lần tải trang kế tiếp.

Bài học bắt buộc mang sang từ `2026083002`: **payload giảm không đồng nghĩa nhanh hơn.**
Feature đó cắt payload còn 42 % nhưng wall-clock lại 136–172 % vì đổi 1 round-trip thành 2
nối tiếp. Ở đây đường phổ biến (chọn dòng) **không** thêm round-trip nào, nên tiêu chí 1 đo
cả byte lẫn wall-clock; nếu wall-clock không giảm thì ghi nhận đúng như thế, không tô hồng.

## Out of scope

- Đường ghi: create/edit/post/cancel phiếu nhập, phiếu xuất — không đụng.
- Đổi mặc định `includeLines` của BE sang `false`. Mặc định giữ nguyên `true`; chỉ client
  đổi cách gọi. (Đảo mặc định là breaking change cho `/docs-json` và mọi consumer khác.)
- Panel "Chi tiết" và dialog Xem: đã phân trang xong ở `2026083002`, không làm lại.
- Các trang phiếu khác (Chuyển kho, Lệnh điều chuyển, Kiểm kê, Điều chuyển từ cửa hàng khác)
  — trừ khi khảo sát ở G1 cho thấy chúng dùng đúng khuôn `["<x>", selectedId]` nạp cả dòng.
- Cache phía client (staleTime, refetchOnWindowFocus): đã đặt, không chỉnh.
- Cache HTTP (`Cache-Control`) cho các endpoint có `Authorization`: không làm — phản hồi
  theo người dùng, đặt sai một lần là rò dữ liệu chéo tài khoản.
- `pos-web`: `branch.service.ts:9` cũng gọi `/branches/me`, được hưởng cache server miễn phí,
  nhưng không sửa gì bên POS trong feature này.

## Constraints

- Multi-tenant: mọi truy vấn mới lọc theo `actor.organizationId` (+ `branchId` khi endpoint
  có `@RequireBranchScope()`). Endpoint đếm mới phải khớp **đúng** vị từ của
  `listImportable`, nếu không badge và danh sách sẽ nói hai con số khác nhau.
- Cache mới dùng lại `CacheService.getOrSet` / `invalidate` / `invalidatePattern`
  (`modules/redis/cache.service.ts`) — đã là khuôn của `RbacService`, không dựng cơ chế thứ hai.
- Mọi cache đều phải có đường vô hiệu hoá tường minh (đổi vai trò, gán/bỏ chi nhánh,
  đổi trạng thái chi nhánh), không chỉ trông vào TTL.
- Endpoint mới phải xuất hiện trong `/docs-json`; sau khi đổi API chạy `pnpm openapi:generate`
  và commit `openapi.snapshot.json` + `packages/api-client/src/generated/schema.ts`.
- Backend source tiếng Anh; chuỗi UI tiếng Việt.
- `forbidNonWhitelisted: true` — mọi query param mới phải khai trong DTO, nếu không là 400.
