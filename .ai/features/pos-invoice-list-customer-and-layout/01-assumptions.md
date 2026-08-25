---
feature: pos-invoice-list-customer-and-layout
blocking_open: 0
resolved: 11/11
---

# Assumption register

Bốn dòng `confirmed` do user chốt trực tiếp trong phiên lập kế hoạch 2026-08-25 (một vòng
3 câu + một vòng follow-up 1 câu). Bảy dòng còn lại đóng ở G4 bằng **test hoặc số đo sống**,
không dòng nào do agent tự nâng cấp trạng thái bằng suy luận. Ở lúc đóng feature: 11/11 đã
giải quyết, không dòng nào còn `open`.

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | Tràn layout do `h-screen` ở container gốc trang chồng lên vỏ `PosLayout` (`h-[100dvh]` + header + `overflow-hidden`) — trang tự khai chiều cao khung nhìn thay vì tiêu phần vỏ còn chừa | medium | no | Đổi class không hết tràn → phải đo lại. Nghi phạm số 2: `PosDataTable fillHeight` (`PosDataTable.tsx:49,120`) | **verified** | Đúng, và đo được bằng số: độ tràn = **+53px = đúng chiều cao header**, ở cả 1440×900 lẫn 1440×720, trên cả `/invoices` lẫn `/return-goods`. Trang giữ nguyên `100vh` và **không** co (`pageH` 900 khi chỗ được cấp chỉ 847). Sau khi đổi class: `overflowPx = 0`, `docScrolls = false`. `PosDataTable` vô can — không sửa dòng nào. **Bẫy:** lưới rỗng KHÔNG tái hiện lỗi (trang rỗng co vừa được); lần đo đầu suýt bác bỏ A-01 nhầm |
| A-02 | `customer` inline chỉ gồm `{ id, code, name, phone }` — **không** phải toàn bộ `CustomerEntity` | high | yes | Đổi contract response + DTO + mapper FE | confirmed | Akenzy chốt 2026-08-25 sau khi được chỉ ra `CustomerEntity` mang `nationalId` (CCCD), `birthDate`, `address`, `taxCode`, `note` — và `@RequirePermission('pos.read')` trên `invoice-v2.controller.ts:18` **đang bị comment**, nên endpoint chỉ chặn ở `AuthGuard` toàn cục |
| A-03 | Lấy customer bằng **một truy vấn thứ hai theo trang** (`In(ids)`, select 4 cột) rồi gắn inline — không dùng `leftJoinAndMapOne` như ba endpoint anh em | high | no | Nếu đổi sang join-and-map thì kéo lại đúng đống cột PII vừa loại bỏ ở A-02 | confirmed | Hệ quả trực tiếp của A-02: `leftJoinAndMapOne` của TypeORM select **mọi** cột của alias, không có tham số chiếu cột. Xem ADR-01 |
| A-04 | Giữ nguyên `leftJoin` trong `buildQuery` ⇒ truy vấn totals không đổi, test sẵn có *"keeps the customer join on the totals query — three filters need its alias"* (`search-invoices-v2.handler.spec.ts:163`) vẫn xanh | high | no | Tổng cuối bảng lệch với lưới — đúng lỗi mà test đó được viết ra để chặn | **verified** | `buildQuery` không có dòng nào đổi (diff handler = 61 insertion, 0 deletion). 6 test sẵn có xanh nguyên vẹn, gồm cả *keeps the customer join on the totals query* và *is invariant to limit* |
| A-05 | pos-web gọi API qua `http` riêng (`@erp/pos/lib/common/http`), **không** qua `@erp/api-client` ⇒ không cần `pnpm openapi:generate` cho thay đổi này | medium | no | Thiếu bước commit `openapi.snapshot.json` + `schema.ts` | **verified** (mạnh hơn giả định) | Endpoint **có** trong snapshot (`packages/api-client/openapi.snapshot.json:15858`) nhưng schema response là `{"type": "object"}` — controller không khai `@ApiResponse` nên Swagger không mô tả gì. Thêm field không thể làm schema đổi ⇒ regenerate là no-op |
| A-06 | Các ô Mã khách hàng / Khách hàng trống trong ảnh chụp prod là hoá đơn khách lẻ (`customerId = null`), **không** phải lỗi tải bị `catch { return [id, null] }` nuốt | medium | no | Nếu sai thì còn một lỗi thứ ba chưa lộ | **verified** | Trên `erp_dev`, mọi dòng có ô khách trống đều là hoá đơn `DRAFT-*` chưa gắn khách; dòng có khách (`2608240003`) hiện đủ ba cột. Sau bản sửa, ô trống chỉ còn **một** nghĩa: `customer = null`. Không còn `catch` nào nuốt lỗi mạng |
| A-07 | Thêm `code?: string \| null` vào `CustomerRow` (pos-web) không phá consumer nào — field optional | high | no | Build TS đỏ | **verified** | `pnpm --filter @erp/pos-web build` (`tsc && vite build`) xanh |
| A-08 | `ReturnGoodsPage` đổi class gốc không phá bố cục bên trong: cùng cấu trúc 3 tầng (`gốc → flex-1 px-4 py-4 → flex-1 min-h-0`) như `InvoiceListPage` | high | no | Trang đổi trả vỡ bố cục | **verified** | `/return-goods` tràn **đúng cùng +53px** trước khi sửa, và về `0` sau — không phải lỗi lý thuyết mà đang xảy ra thật. Số dòng giữ nguyên 42 trước/sau ⇒ bố cục bên trong không đổi |
| A-09 | Khách `status = INACTIVE`/`MERGED` vẫn hiện tên như hiện tại (`CustomerEntity` **không** có soft-delete — `BaseEntity` không khai `@DeleteDateColumn`) | high | no | Hoá đơn cũ của khách đã gộp mất tên | **verified** | Test *does not filter customers by status — merged and inactive ones still show* khẳng định mệnh đề `where` chỉ có `id` + `organizationId`, không có `status` |
| A-10 | Xoá `useInvoiceListQuery` an toàn — không importer nào ngoài chính `use-query-invoice.ts` | high | no | Build đỏ | confirmed | Akenzy chốt 2026-08-25. Xác nhận bằng grep toàn `apps/pos-web/src` + `apps/backoffice-web/src`: chỉ khớp trong chính file khai báo |
| A-11 | Sửa cả `InvoiceListPage` lẫn `ReturnGoodsPage`; **không** đụng `DailyReportPage`/`FastStockTransferPage` (hai file đã đúng pattern) | high | no | Phạm vi diff | confirmed | Akenzy chốt 2026-08-25, phương án "Both pages" |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
|----|----------------|----------------------|-------------|
| A-12 | Backend chưa biết gì về customer nên phải thêm join mới | `search-invoices-v2.handler.ts:91-96` **đã** join `CustomerEntity` từ trước — ba bộ lọc `customerCode`/`customerName`/`customerPhone` đang chạy trên chính alias đó | Không phải "thêm quan hệ", mà là "trả về thứ đã join sẵn". Phần khó (điều kiện join có kèm `organizationId`) đã xong và đã có test |
| A-13 | Nhân bản `leftJoinAndMapOne` từ `SearchReturnableInvoicesV2Handler` là lựa chọn an toàn nhất vì khớp pattern anh em | Pattern anh em trả **toàn bộ** `CustomerEntity`: CCCD, ngày sinh, địa chỉ, mã số thuế, ghi chú nội bộ — trên endpoint mà `@RequirePermission` đang bị comment | "Khớp pattern" ở đây là nhân bản một chỗ rò PII. Feature này đi chiếu cột tường minh; thu hẹp ba endpoint anh em là việc riêng, ngoài phạm vi (xem `00-intent.md` mục Out of scope) |
