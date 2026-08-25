---
feature: pos-invoice-list-customer-and-layout
slug: pos-invoice-list-customer-and-layout
owner: Akenzy
created: 2026-08-25
status: draft
---

# Intent — Danh sách hoá đơn POS: khách hàng inline + hết tràn layout

## Problem

Trang `/invoices` (Danh sách hoá đơn, POS) có hai lỗi độc lập, cùng nhìn thấy trên một
ảnh chụp màn hình prod.

### 1. Fetch khách hàng từng dòng (N+1)

`useInvoiceListV2Query` (`use-query-invoice.ts:262-284`) gọi `POST /v2/invoices/search`,
rồi **gọi tiếp `GET /customers/:id` cho từng `customerId` riêng biệt trong trang**:

```ts
const ids = Array.from(new Set(res.data.map(i => i.customerId).filter(Boolean)));
const entries = await Promise.all(ids.map(async id => { ... customerService.get(id) ... }));
```

Với `limit = 100` (người dùng đang để 100 dòng/trang trong ảnh) đó là tối đa **101 lượt
gọi API cho một lần mở trang**, và lặp lại mỗi lần đổi trang, đổi bộ lọc, hay gõ vào ô
tìm kiếm sau khi debounce nhả. Panel Network trong ảnh chụp cho thấy đúng chuỗi request
`/api/customers/<uuid>` nối đuôi nhau.

Điều làm lỗi này thành *sai kiến trúc* chứ không chỉ chậm: **backend đã join sẵn
`CustomerEntity` rồi**. `search-invoices-v2.handler.ts:91-96` join customer để ba bộ lọc
`customerCode` / `customerName` / `customerPhone` chạy được — nhưng dùng `leftJoin` nên
cột customer không bao giờ đi kèm entity trả về. Ba endpoint anh em
(`returnable`, `purchase-history`, `drafts`) đều đã dùng `leftJoinAndMapOne` và trả
`customer` inline; riêng endpoint này lệch đúng một từ khoá.

Hệ quả phụ, âm thầm hơn: khối `try { ... } catch { return [id, null] }` ở FE **nuốt lỗi**.
Một khách bị 403/404/timeout hiện ra y hệt khách vãng lai — ô Mã khách hàng và Khách hàng
trống trơn, không có cách nào phân biệt "hoá đơn không có khách" với "gọi API hỏng".

### 2. Layout tràn xuống dưới khung nhìn

`InvoiceListPage.tsx:43` mở bằng `<div className="flex h-screen flex-col bg-white">`.
Nhưng vỏ `PosLayout` đã là `h-[100dvh] … overflow-hidden` và đã tiêu một phần chiều cao
cho header (logo + tab + cụm điều khiển phải). Trang tự khai `h-screen` = **toàn bộ**
chiều cao khung nhìn, tức là cao hơn phần vỏ còn chừa lại đúng bằng chiều cao header —
và `overflow-hidden` của vỏ cắt phần thừa đó ở đáy. Trong ảnh: dòng `Tổng tiền:` chỉ hở
một nửa, thanh phân trang (`1-15/15 kết quả`, ô chọn số dòng/trang, nút lật trang) bị cắt
mất phần lớn.

Repo đã có sẵn pattern đúng, ngay hai file bên cạnh: `DailyReportPage.tsx:144` và
`FastStockTransferPage.tsx:14` đều mở bằng `flex min-h-0 flex-1 flex-col overflow-hidden`
— tức là *tiêu phần chiều cao vỏ còn lại*, không tự khai chiều cao khung nhìn.
`ReturnGoodsPage.tsx:52` là file thứ hai còn dùng `h-screen`, cùng lỗi tiềm ẩn.

## Affected personas

| Persona            | Hiện tại                                                                          | Mong muốn                                                   |
| ------------------ | --------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Thu ngân POS       | Mở Danh sách hoá đơn ở 100 dòng/trang phải chờ ~101 request; đổi trang là chờ lại | Một request cho một trang; lật trang tức thì                |
| Thu ngân POS       | Thanh phân trang bị cắt → không lật được trang, không đổi được số dòng/trang      | Thanh phân trang + dòng Tổng tiền luôn nằm trong khung nhìn |
| Thu ngân POS       | Ô Mã khách hàng trống — không rõ là khách lẻ hay lỗi tải                          | Trống chỉ còn nghĩa duy nhất: hoá đơn không gắn khách       |
| Người vận hành API | Mỗi lần mở danh sách là một chùm `GET /customers/:id` đập vào API                 | Tải API tỉ lệ với số trang, không tỉ lệ với số dòng         |

## Success signal

Mở `/invoices` với `limit = 100` trên một chi nhánh có ≥ 50 hoá đơn gắn khách:

1. Tab Network chỉ có **một** request `POST /v2/invoices/search` và **không có
   request `/customers/<uuid>` nào**; các cột Mã khách hàng / Khách hàng / Số điện thoại
   vẫn hiện đúng y như trước (đối chiếu tay 5 dòng bất kỳ với backoffice).
2. Ở cả hai viewport khai báo (`desktop` 1440×900 và `laptop` 1440×720), thanh phân trang
   hiện **đủ** — nút lật trang, `x-y/z kết quả`, ô chọn số dòng/trang — và dòng
   `Tổng tiền:` hiện đủ chiều cao, không bị cắt. Điều tương tự đúng với `/return-goods`.

## Out of scope

- **Không đổi bộ lọc / phân trang / cột.** Ba bộ lọc khách đã chạy server-side qua join
  sẵn có; feature này không đụng tới ngữ nghĩa lọc.
- **Không đổi endpoint hay thêm endpoint mới.** Vẫn là `POST /v2/invoices/search`, chỉ
  đổi hình dạng phần tử trong `data[]`.
- **Không đụng ba endpoint anh em** (`returnable`, `purchase-history`, `drafts`) — chúng
  đã đúng, feature này kéo endpoint lệch về ngang hàng với chúng.
- **Không refactor `PosDataTable` / `PosPaginationBar`.** Lỗi tràn nằm ở container cấp
  trang, không ở component bảng.
- **Không làm mobile layout.** Cả hai app đều là vỏ desktop; `laptop` 1440×720 chỉ là
  desktop thấp hơn (xem `.ai/aidlc.yaml`).
- **Không sửa `DailyReportPage` / `FastStockTransferPage`** — hai file đó đã đúng pattern.

## Constraints

| Kind             | Detail                                                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Platform         | API NestJS 11 + CQRS (`apps/api`), POS web React 19 + TanStack Query (`apps/pos-web`)                                                    |
| Ngôn ngữ         | Source backend tiếng Anh; chuỗi UI tiếng Việt (xem `feedback_no_vietnamese_in_backend_source`)                                           |
| Pattern bắt buộc | Mirror `SearchReturnableInvoicesV2Handler` — cùng `leftJoinAndMapOne`, cùng hình dạng `customer` inline                                  |
| DB               | Không migration, không đổi entity, không đổi index — chỉ đổi cách join đã có                                                             |
| Idempotency      | Không áp dụng: cả hai thay đổi đều nằm trên đường đọc (query), không có mutation                                                         |
| Verify           | `ai-dlc-verify` môi trường `local-pos` (:3001); cần API :4000 chạy từ **đúng** checkout (xem `reference_verify_stack_worktree_api_trap`) |
