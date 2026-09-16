---
feature: pos-catalog-product-images
adr_count: 3
---

# Logical design — POS hiển thị ảnh hàng hoá trên lưới catalog và dialog chọn biến thể

## Approach

Thuần frontend, năm điểm chạm trong `apps/pos-web/src`, không đụng API:

1. **Đưa `imageUrl` qua shape nội bộ.** `CatalogProduct` (`interfaces/checkout.interface.ts:78-86`)
   thêm `imageUrl: string | null`; map trong `use-checkout-catalog.ts:141-149` truyền
   `imageUrl: c.imageUrl`. `PosProductCard` (`interfaces/catalog.interface.ts:66`) đã có sẵn trường
   này nên không có gì đổi ở tầng service/query.

2. **Một component ảnh có fallback** — `components/page-components/Checkout/ProductImage/ProductImage.tsx` (xem ghi chú ADR-02):
   `{ src: string | null; alt: string; className?: string; fallback: ReactNode; loading?: "lazy" | "eager" }`.
   `src` null **hoặc** `<img>` bắn `onError` → render `fallback`; ngược lại render
   `<img src alt decoding="async" loading={loading ?? "lazy"} className>`. State lỗi là
   `useState` cục bộ, reset khi `src` đổi (key theo `src`). Đây là toàn bộ luật AC-02/AC-03/AC-06,
   viết một lần cho cả hai chỗ dùng (ADR-02).

3. **Card lưới** (`ProductCard.tsx`): vùng ảnh `relative flex flex-1 … bg-gray-300` giữ nguyên
   kích thước; bên trong thay `<ShoppingBagIcon>` cố định bằng
   `<ProductImage src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" fallback={<ShoppingBagIcon …/>} />`.
   Badge giá vẫn là `span.absolute bottom-1.5 left-1.5` đặt **sau** ảnh trong DOM nên đè lên
   trên (A-05).

4. **Header dialog** (`ProductHeaderInfo.tsx`): thêm prop `imageUrl: string | null`. Ô 96×96:
   - có ảnh → `<button type="button" aria-label="Xem ảnh {name}" onClick={() => setViewerOpen(true)}>`
     chứa `<ProductImage … className="h-full w-full object-cover rounded-lg" loading="eager">` và nhãn
     "Xem" đè ở mép dưới (nền mờ) để bố cục giữ nguyên với trạng thái placeholder;
   - không ảnh → `div` placeholder y như hiện tại (túi + "Xem"), không phải button (A-11).
   - `viewerOpen` là `useState` cục bộ; render `<PosDialog open={viewerOpen} onClose width={720} ariaLabelledBy>`
     với `PosDialog.Header title={name}` và `PosDialog.Body` chứa một `<img>` `max-h-[70vh] w-full object-contain`.
     `PosDialog` sẵn có xử lý Esc, nút đóng, overlay và trả focus (ADR-03, A-07).

5. **Nối dây** (`ProductVariantSelectionModal.tsx:200-203`): `<ProductHeaderInfo name imageUrl={detail?.imageUrl ?? null} description />`.
   Trong lúc `detailQuery.isLoading`, `detail` chưa có → header là placeholder rồi đổi sang ảnh
   khi chi tiết về; chấp nhận (xem Alternatives).

Không có hook mới, không có query mới, không có store mới.

## Alternatives rejected

| Option | Why not |
| --- | --- |
| Mở rộng `GET …/catalog/products/:id` trả `images: string[]` để "Xem" có gallery | Chủ sở hữu chọn ảnh đơn, FE-only (A-01). Đổi contract kéo theo DTO + service + `openapi:generate` + commit `schema.ts`/`openapi.snapshot.json`, và phối hợp với media-storage đang chờ merge. Làm sau nếu cần, không chặn việc này. |
| Tải ảnh qua `erpApi`/fetch rồi `URL.createObjectURL` để "kiểm soát lỗi" | Interceptor gắn `Authorization` + `X-Branch-Id` vào mọi request → lộ token sang storage; media-storage cấm đường này. `<img onError>` đã đủ để rơi về placeholder. |
| Truyền `imageUrl` của card vào `openVariantDialog` target để header hiện ảnh ngay khi mở, không chờ chi tiết | Target còn được tạo từ `openForItem`/`openForQuery` (gợi ý tìm kiếm, không có `imageUrl`) nên vẫn phải có đường "chờ chi tiết"; thêm trường vào store `checkout-ui` chỉ để tiết kiệm ~100 ms nháy placeholder. Không đáng. |
| Lặp `useState(imgError)` trong cả `ProductCard` và `ProductHeaderInfo` thay vì `ProductImage` | Hai chỗ phải cùng một luật fallback (AC-03 và AC-06 giống nhau); tách ra một component 20 dòng rẻ hơn hai bản copy lệch nhau dần. |
| Lightbox tự viết bằng `div.fixed inset-0` + `onKeyDown` | `PosDialog` đã có overlay, focus trap, Esc, nút đóng và `onCloseAutoFocus` trả focus; Radix `DismissableLayer` chỉ cho lớp trên cùng nhận Esc nên lồng dialog an toàn (A-07). Viết lại là thêm một cơ chế thứ hai cho cùng việc. |
| Thumbnail theo từng dòng trong `VariantTable` | `variants[].imageUrl` luôn bằng ảnh mẫu mã (A-03); 20 dòng cùng một ảnh không thêm thông tin, chỉ thêm 20 request ảnh. |

## Domain model

Không có domain model mới. Một trường thêm vào type nội bộ của checkout:

```ts
// interfaces/checkout.interface.ts
export interface CatalogProduct {
  id: string;
  name: string;
  price: number;
  kind: PosProductKind;
  /** URL ảnh đầu tiên (public), null khi chưa có ảnh — mirror `PosProductCard.imageUrl`. */
  imageUrl: string | null;
}
```

## Contracts

Không đổi hợp đồng API. Hai endpoint đã trả `imageUrl` từ UOW-03 của media-storage:

| Endpoint | Trường dùng | Ghi chú |
| --- | --- | --- |
| `GET /pos/branches/:branchId/catalog/products` | `data[].imageUrl` | card lưới |
| `GET /pos/branches/:branchId/catalog/products/:id?kind=` | `imageUrl` (mức product) | header dialog; `variants[].imageUrl` **không** dùng |

Contract nội bộ mới (props):

```ts
// components/page-components/Checkout/ProductImage/ProductImage.tsx
export interface ProductImageProps {
  src: string | null;
  alt: string;
  className?: string;
  /** Render khi không có src hoặc ảnh tải lỗi. */
  fallback: ReactNode;
  loading?: "lazy" | "eager";
}

// ProductHeaderInfo
export interface ProductHeaderInfoProps {
  name: string;
  description: string | null;
  imageUrl: string | null;   // mới
}
```

## State ownership

| State | Owner | Lifetime |
| --- | --- | --- |
| `failed` (ảnh tải lỗi) | `ProductImage` (`useState`, key theo `src`) | Vòng đời phần tử; đổi `src` là reset |
| `viewerOpen` | `ProductHeaderInfo` (`useState`) | Trong lúc dialog chọn biến thể mở; unmount cùng dialog cha |
| `imageUrl` trên card / chi tiết | TanStack Query (`useCatalogProductsQuery`, `useCatalogProductDetailQuery`) — đã có | Không đổi |

## Error taxonomy

| Condition | Failure subtype | UI |
| --- | --- | --- |
| `imageUrl === null` | Không phải lỗi | Placeholder túi xám (card) / túi + "Xem" không bấm được (header) |
| `<img>` bắn `error` (404, bucket chưa mở ở prod, `Content-Type` sai) | Tài nguyên ngoài không tải được | Rơi về placeholder y hệt trường hợp null; **không** toast, **không** `console.error` (verify `failure_signals` bắt toast lỗi) |
| Chi tiết sản phẩm chưa về (`detailQuery.isLoading`) | Trạng thái tải | Header là placeholder, đổi sang ảnh khi `detail` có |
| Chi tiết lỗi (`detailQuery.error`) | Đã có xử lý | Header giữ placeholder (`detail` undefined → `imageUrl` null); thông báo lỗi hiện tại không đổi |

## Cache & offline

Ảnh do trình duyệt cache theo header của storage (bucket công khai). Không có cache ở tầng
app; `imageUrl` đi theo cache của TanStack Query như mọi trường khác của card/chi tiết.

## Observability

Không thêm log/metric. Ảnh lỗi cố ý im lặng (A-04): ở prod trước khi nginx mở bucket, mọi ảnh
đều lỗi và log mỗi card một dòng chỉ là nhiễu.

## ADRs

### ADR-01 — Hiển thị bằng `<img src>` thẳng từ URL công khai, không đổi API

**Context:** Cả hai endpoint POS đã trả `imageUrl` công khai (UOW-03 media-storage). Câu hỏi
là POS lấy ảnh thế nào và có cần thêm gì ở API không.

**Decision:** Render `<img src={imageUrl}>` trực tiếp; `loading="lazy" decoding="async"` trên
card, `eager` trên header dialog (một ảnh, đang nhìn). Không đổi DTO, không `openapi:generate`.
Không có skeleton: nền xám sẵn có là trạng thái tải (A-10).

**Consequences:** Feature nằm trọn trong `apps/pos-web/src`; merge độc lập với media-storage
(chỉ cần đứng sau nó trên nhánh). Ảnh là file gốc ≤ 2 MB co bằng CSS — tối đa 20 ảnh/trang, chấp
nhận vì media-storage không có thumbnail (A-24 của nó); nếu về sau có, chỉ đổi URL. Ở prod ảnh
chỉ hiện sau khi T-05-02 (nginx) xong; trước đó `onError` giữ giao diện như hôm nay (A-04).

**Status:** accepted

### ADR-02 — Một component `ProductImage` giữ luật fallback cho cả hai chỗ dùng

**Context:** Card lưới và header dialog cùng cần "null hoặc lỗi → placeholder". Viết
`useState` + `onError` hai lần là hai bản copy của cùng một luật.

**Decision:** `components/page-components/Checkout/ProductImage/ProductImage.tsx` nhận `src | null`, `alt`, `className`,
`fallback`, `loading`; tự quản state lỗi, reset khi `src` đổi. Card và header chỉ truyền
`fallback` của mình.

**Consequences:** Thêm một file ~30 dòng; AC-03 và AC-06 được chứng minh ở một chỗ. Component
không biết gì về sản phẩm — dùng lại được cho ảnh khác của POS sau này nhưng **không** thêm
prop cho việc đó bây giờ.

*Sửa 2026-09-16 (khi thi công T-01-02):* đường dẫn là
`components/page-components/Checkout/ProductImage/ProductImage.tsx`, không phải
`components/common/PosImage/PosImage.tsx` như viết ban đầu — `apps/pos-web/CLAUDE.md` §3 chỉ cho
`common/` + prefix `Pos` khi component được dùng ở **2+ trang**; cả hai chỗ dùng đều thuộc màn
Bán hàng. Nếu về sau một trang khác cần, dời sang `common/PosImage` khi đó.

**Status:** accepted

### ADR-03 — Ảnh cỡ lớn là một `PosDialog` lồng trong dialog chọn biến thể

**Context:** "Xem" phải mở ảnh lớn trên nền dialog chọn biến thể đang mở, đóng lại thì dialog
cha còn nguyên (AC-05).

**Decision:** `ProductHeaderInfo` giữ `viewerOpen` và render `<PosDialog width={720}>` thứ hai
với `Header` (tên hàng) + `Body` chứa `<img object-contain max-h-[70vh]>`. Không viết overlay
riêng.

**Consequences:** Esc chỉ đóng lớp trên cùng — Radix `DismissableLayer` `isHighestLayer`
(`@radix-ui/react-dismissable-layer@1.1.12/dist/index.mjs:60-62`); `PosDialog.onCloseAutoFocus`
trả focus về nút "Xem" (`PosDialog.tsx:115-124`), nên AC-05 đi theo hành vi sẵn có. Hai overlay
`bg-black/40` chồng nhau làm nền tối hơn một chút khi xem ảnh — chấp nhận, thậm chí có lợi cho
việc nhìn ảnh.

**Status:** accepted
