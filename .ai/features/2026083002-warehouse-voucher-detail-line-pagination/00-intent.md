---
feature: warehouse-voucher-detail-line-pagination
slug: 2026083002-warehouse-voucher-detail-line-pagination
owner: Akenzy
created: 2026-08-30
status: draft
---

# Intent — Phân trang lưới dòng hàng trong dialog xem chi tiết phiếu nhập / phiếu xuất kho

## Problem

Dialog xem chi tiết phiếu nhập kho và phiếu xuất kho tải và dựng **toàn bộ** dòng
hàng của phiếu trong một lưới duy nhất. Với phiếu vài trăm dòng (phiếu nhập từ
import Excel là ca thường gặp), dialog mất vài giây mới mở được và cuộn giật.

Khảo sát mã nguồn ngày 2026-08-30 (nhánh `main`, commit `0a9d54bb`):

1. **Toàn bộ dòng nằm trong một state, dựng một lượt.** Cả
   `components/document/GoodsIssueFormDialog.tsx` (75KB) và
   `components/document/GoodsReceiptFormDialog.tsx` (85KB) giữ dòng hàng trong một
   mảng `useState<FormLine[]>` (`GoodsIssueFormDialog.tsx:439`), khởi tạo bằng
   `initial.lines.map(...)` (`:442`), rồi render thẳng thành một `<table>` không cắt trang.
2. **Dialog không tự tải dữ liệu — trang truyền vào.** Dialog nhận prop `initial`
   (`GoodsIssuePage.tsx:817`, `PurchaseOrdersPage.tsx:870`). Trang lấy phiếu đầy đủ
   bằng `GET /:id`, vốn trả **mọi dòng** trong một payload (`GoodsIssuePage.tsx:595`).
   Nên chi phí không chỉ ở render: payload của một phiếu 500 dòng đi qua mạng
   nguyên vẹn mỗi lần mở dialog.
3. **Endpoint phân trang dòng ĐÃ CÓ SẴN cho cả hai loại phiếu.** Đây là phát hiện
   quan trọng nhất và nó thu nhỏ hẳn phạm vi việc:
   - `GET /inventory/goods-issues/:id/lines` — `goods-issue.controller.ts:228`
     → `GoodsIssueService.getLines` (`goods-issue.service.ts:778`)
   - `GET /goods-receipts/:id/lines` — `goods-receipt.controller.ts:91`
     → `GoodsReceiptService.getLines` (`goods-receipt.service.ts:~1120`)

   Cả hai nhận `PaginationQueryDto`, trả `{ items, page, pageSize, hasMore, total }`,
   quan hệ `item` và `location` đều `eager: true` nên dòng trả về đã kèm mã/tên/ĐVT
   mặt hàng và vị trí. Trang danh sách phiếu xuất **đã dùng** endpoint này cho panel
   chi tiết cuộn vô hạn (`GoodsIssuePage.tsx:879-896`). Việc còn thiếu là **dialog xem
   chi tiết chưa dùng nó** — nó vẫn ăn `initial.lines`.
4. **Phiếu xuất đang sắp dòng theo thứ tự ngẫu nhiên.** `GoodsIssueService.getLines`
   sắp `order: { id: 'ASC' }` (`goods-issue.service.ts:796`), mà `id` là
   `@PrimaryGeneratedColumn('uuid')` → UUID v4 **ngẫu nhiên**. Thứ tự vì thế tuy ổn
   định giữa các lần gọi nhưng **không phải thứ tự người dùng nhập**, và
   `GoodsIssueLineEntity` **không có cột `createdAt`** để sắp cho đúng. Phía phiếu nhập
   thì ngược lại: `GoodsReceiptLineEntity` có `@CreateDateColumn` và `getLines` sắp
   `order: { createdAt: 'ASC' }` — đúng thứ tự nhập.

   Chừng nào còn hiển thị một danh sách dài liền mạch thì thứ tự lộn xộn còn dễ bỏ
   qua; **cắt trang xong thì nó thành lỗi thấy rõ** — dòng cuối phiếu nhảy lên trang 1.
   Phân trang phiếu xuất mà không sửa thứ tự là làm cho vấn đề tệ hơn, nên nó nằm
   trong phạm vi feature này chứ không để lại.

5. **Ô lọc trên header lưới chạy ở client, nên phân trang đã biến nó thành sai chức
   năng.** Phát hiện ngày 2026-09-03, sau khi UOW-02 và UOW-03 đã giao. `LineItemGrid`
   (`packages/ui/src/components/line-item-grid.tsx:89`) render một ô lọc cho **mọi**
   cột, và vì hai dialog không truyền `onFilterChange` nên lưới chạy ở chế độ
   **không kiểm soát**: nó tự lọc trên mảng `rows` mà nó nhận được. Ở chế độ xem,
   `rows` giờ chỉ còn **một trang** (`gridRows = isView ? viewLines : lines`,
   `GoodsIssueFormDialog.tsx:548`), nên gõ vào ô lọc chỉ tìm trong 50 dòng đang hiện.

   Đây không phải "chưa tối ưu" mà là **hồi quy do chính feature này gây ra**: trước
   khi phân trang, `rows` là toàn bộ phiếu nên ô lọc tìm đúng cả phiếu. Người dùng
   không có cách nào biết mình đang tìm trên một phần dữ liệu — lưới trả "không có
   dòng khớp" y hệt như khi phiếu thật sự không chứa mặt hàng đó.

   Sửa nó không thể làm ở client: muốn lọc đúng cả phiếu mà vẫn chỉ tải một trang thì
   điều kiện lọc phải đi xuống server. Quyết định của Akenzy ngày 2026-09-03: chuyển
   đường đọc dòng sang **`POST /search` theo đúng mẫu V2** đang dùng cho danh sách
   phiếu (`POST /v2/inventory/goods-issues/search` → `SearchGoodsIssuesV2Query` →
   handler dùng `FilterBuilder`), và **thay thế** `GET /:id/lines` chứ không dựng
   song song.

## Affected personas

| Persona | Hiện tại | Mong muốn |
|---|---|---|
| Thủ kho | Mở phiếu nhập 500 dòng, chờ vài giây, cuộn giật | Dialog mở gần như tức thì, chuyển trang mượt |
| Kế toán kho | Muốn xem một dòng cụ thể phải cuộn qua hàng trăm dòng | Chuyển thẳng tới trang chứa dòng cần xem |
| Thủ kho (phiếu xuất) | Dòng hàng hiện không theo thứ tự đã nhập, khó đối chiếu với chứng từ giấy | Dòng hiện đúng thứ tự đã nhập, trang 1 là các dòng đầu phiếu |
| Kế toán kho (tìm một mặt hàng) | Gõ mã SKU vào ô lọc, lưới báo không có dòng khớp dù phiếu có mặt hàng đó ở trang khác | Gõ mã SKU thì tìm trên **cả phiếu**, kết quả gom về trang 1 và vẫn theo thứ tự dòng |

## Success signal

Trên môi trường local, với một phiếu nhập và một phiếu xuất **≥ 200 dòng**:

- Mở dialog xem chi tiết: request lấy dòng chỉ trả về **một trang** dòng hàng
  (kiểm bằng tab Network — độ lớn payload không còn tỉ lệ với tổng số dòng của phiếu).
- Điều hướng qua các trang hiển thị đủ và **không trùng, không sót** dòng nào;
  tổng số dòng hiển thị trên thanh phân trang khớp `total` của phiếu.
- Với phiếu xuất, thứ tự dòng qua các trang **khớp thứ tự đã nhập** — dòng đầu phiếu
  nằm ở trang 1.
- Thời gian từ lúc bấm "Xem" tới lúc lưới hiện dòng đầu tiên **giảm rõ rệt** so với
  bản hiện tại, đo trên cùng phiếu, cùng máy (số đo trước/sau ghi vào bằng chứng G4).
- Chế độ tạo và chế độ sửa của cả hai dialog **giữ nguyên hành vi cũ** — không hồi quy.
- Gõ mã SKU của một mặt hàng **chỉ nằm ở trang cuối** vào ô lọc cột Mã SKU: lưới
  hiện đúng dòng đó ngay, dù nó không thuộc trang đang xem. Kiểm bằng tab Network —
  có một request `POST .../lines/search` mang điều kiện lọc, và số dòng trả về nhỏ
  hơn hẳn một trang đầy.
- Ba số ở chân lưới (Số dòng / Số lượng / Thành tiền) khi đang lọc phản ánh **tập đã
  lọc**, không phải toàn phiếu.
- Thứ tự dòng **không đổi** khi lọc và không có cách nào đổi được: hợp đồng API không
  nhận tham số sắp xếp nào, cả hai loại phiếu luôn trả theo `line_no` tăng dần.

Đo bằng bằng chứng ai-dlc-verify (ảnh chụp trang 1 / trang cuối, số đo trước–sau)
cộng test cho tầng sắp xếp dòng phiếu xuất.

## Out of scope

- **Không** phân trang chế độ tạo (`mode="create"`) và chế độ sửa (`mode="edit"`).
  Quyết định của Akenzy ngày 2026-08-30: chỉ chế độ xem. Hai chế độ kia phải giữ
  toàn bộ dòng chưa lưu trong bộ nhớ để validate và gửi đi một lượt, phân trang
  chúng là một bài toán khác hẳn.
- **Không** đụng panel chi tiết cuộn vô hạn sẵn có ở `GoodsIssuePage.tsx:866-900` —
  nó đã dùng endpoint phân trang và đang chạy đúng.
- **Không** tách nhỏ hai file dialog hay refactor chúng ngoài phần lưới dòng, dù cả
  hai đều quá lớn. Đó là việc riêng, không gộp vào đây.
- **Không** đụng phiếu chuyển kho (`StockTransferPage`), phiếu kiểm kê, hay đơn mua hàng.
- **Không** thêm sắp xếp theo cột trên lưới dòng. Ngược lại: thứ tự bị **đóng cứng**
  theo `line_no`, và hợp đồng API cố tình không có tham số sắp xếp nào để không ai
  thêm được về sau mà không sửa hợp đồng.
- **Không** lọc phía server theo cột **Kho**, **Vị trí** và **Đơn vị tính**. Quyết định
  của Akenzy ngày 2026-09-03: chỉ Mã SKU, Tên hàng hóa, Số lượng, Đơn giá, Thành tiền
  đi xuống server. Ba cột kia phải **tắt ô lọc tường minh** ở chế độ xem — để lại một ô
  gõ được mà không lọc gì còn tệ hơn không có ô nào.
- **Không** áp lọc phía server cho chế độ tạo và chế độ sửa. Hai chế độ đó giữ dòng
  chưa lưu trong bộ nhớ, server không thể tìm thứ chưa tồn tại; ô lọc ở đó tiếp tục
  chạy client-side như hôm nay.
- **Không** đổi endpoint in và xuất Excel (`/:id/print-payload`, `/:id/export`) —
  chúng phải tiếp tục lấy đủ mọi dòng.

## Constraints

- ~~Endpoint `/:id/lines` đã tồn tại, ưu tiên dùng lại, không dựng endpoint mới.~~
  **Đảo ngày 2026-09-03 (A-13, ADR-06).** `GET /:id/lines` chỉ nhận `PaginationQueryDto`
  và không có chỗ nào nhét điều kiện lọc vào cho ra hồn. Đường đọc dòng chuyển sang
  `POST /v2/.../:id/lines/search` theo mẫu CQRS V2, và `GET /:id/lines` **bị xoá** ở cả
  hai controller. Nó có đúng một consumer khác — panel chi tiết cuộn vô hạn ở
  `GoodsIssuePage.tsx:879` — và consumer đó phải được chuyển sang endpoint mới trong
  cùng UoW, không để lại sau.
- Endpoint mới phải bám đúng mẫu V2 sẵn có, không phát minh mẫu thứ hai: DTO ghép từ
  `StringFilterDto` / `CompareFilterDto` (`common/filters/filter.dto.ts`), một
  `*.query.ts`, một `@QueryHandler` dùng `FilterBuilder`, controller `@Version('2')`
  dispatch qua `QueryBus`. Cả hai module đã import `CqrsModule` và đã có sẵn một
  controller V2 để gắn vào.
- Ký hiệu toán tử phải khớp cái người dùng nhìn thấy trên header lưới: `*` của lưới là
  `StringOperator.CONTAINS`, `≤` của lưới là `CompareOperator.LTE`. Lệch một cái là ô
  lọc chạy khác hẳn thứ nó đang tự quảng cáo.
- Phiếu **nhập** cũng nhận cột `line_no` (quyết định của Akenzy ngày 2026-09-03,
  ADR-05). `created_at` của nó tuy đang cho ra đúng thứ tự nhập nhưng là một cơ chế
  khác với phiếu xuất, và hai bảng dùng hai cơ chế thứ tự khác nhau là thứ sẽ phân kỳ.
  Tức là **migration viết tay thứ hai**, cộng backfill, cộng mọi đường ghi dòng phiếu
  nhập phải gán `lineNo` — gồm cả đường sinh phiếu nhập từ kiểm kê
  (`stock-take.service.ts:1590`).
- `GoodsIssueLineEntity` **không có** cột thứ tự cũng không có `createdAt`. Sắp lại
  cho đúng thứ tự nhập cần thay đổi schema — tức là **một migration viết tay**
  (`migration:generate` sinh drift lớn trên repo này) cộng một bước backfill cho
  dòng đã có. Đây là phần rủi ro nhất của feature.
- Phân trang phải là **server-side** (quyết định của Akenzy): payload chỉ mang một
  trang, không tải hết rồi cắt ở client.
- Mọi truy vấn phải giữ nguyên phạm vi `organizationId` + `branchId` và
  `@RequirePermission` hiện có trên hai controller.
- Dữ liệu server đọc qua TanStack Query, `queryKey` bắt đầu bằng tên tài nguyên và
  chứa mọi tham số lọc; không đưa dữ liệu server vào Zustand.
- Chuỗi hiển thị bằng **tiếng Việt**; source backend bằng **tiếng Anh**.
- Nếu chữ ký response của `/lines` đổi, phải chạy lại `pnpm openapi:generate` và
  commit `openapi.snapshot.json` cùng `packages/api-client/src/generated/schema.ts`.
