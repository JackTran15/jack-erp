---
feature: online-order-intake-dispatch
slug: 2026092001-online-order-intake-dispatch
owner: Akenzy
created: 2026-09-20
status: draft
---

# Intent — Nhận đơn từ web công ty qua API key, Admin phân thủ công về chi nhánh

## Problem

Công ty sắp mở web bán hàng riêng. Khách tự đặt trên web, không có tư vấn viên
đứng sau, và **không thuộc chi nhánh nào** tại thời điểm đặt — web bán cho cả
nước, kho nào giao là quyết định của người điều phối chứ không phải của khách.
ERP hiện không nhận được loại đơn này:

- **Không có cửa ngõ ghi cho đối tác.** `api_keys` (shadow user mang permission,
  `branch_ids`, ip whitelist) và `/partner/catalog` v2 đã có và đã chạy — nhưng
  chỉ đọc: tìm sản phẩm, xem chi tiết, xem tồn
  (`partner-catalog/controllers/partner-product-v2.controller.ts:43-46`). Không
  có endpoint nào để đối tác **đặt** một đơn.
- **`sales_orders` buộc phải có chi nhánh ngay lúc tạo.** Cột `branch_id` là
  nullable trong DB (`1789950000000-CreateSalesOrders.ts:20`) nhưng `create()`
  bắt buộc `X-Branch-Id` (`sales-order.service.ts:552`), và `list()` hard-filter
  `so.branchId = actor.branchId` (`:271`) — tức là **không tồn tại đường nhìn
  cấp tổ chức**. Admin không có màn hình nào thấy được đơn chưa phân.
- **`salesperson_id` là NOT NULL.** Mô hình đơn hiện tại giả định luôn có tư vấn
  viên gửi đơn từ app mobile. Đơn khách tự đặt không có người đó.
- **Không có địa chỉ giao có cấu trúc.** `customers.address` là một dòng text
  (`customer.entity.ts:33`); không có tỉnh/phường, không có địa chỉ trên đơn.
  Dữ liệu địa giới thì đã có sẵn — `geo_provinces` + `geo_wards` (dataset 2026,
  PR #284) với `GET /geo/provinces`, `GET /geo/wards`.
- **`/orders` trên backoffice chạy mock.** Route đã có (`App.tsx:98`), nav đã có
  ("Danh sách đơn hàng"), UI đã vẽ đủ cột kênh bán / mã đơn sàn / địa chỉ giao —
  nhưng nguồn dữ liệu là `_mock/orders.mock.ts` và **không có cột chi nhánh**.

Hệ quả: đơn web hoặc phải nhập tay lại vào POS (mất truy nguồn, sai tồn), hoặc
phải gán cứng về một chi nhánh lúc đặt (sai nghiệp vụ — chưa ai biết kho nào còn
hàng).

## Affected personas

- **Khách hàng trên web công ty** — chọn hàng, nhập địa chỉ giao (tỉnh → phường),
  đặt COD; thấy giá đã chốt tại thời điểm đặt.
- **Admin điều phối (cấp tổ chức)** — màn hình duy nhất thấy mọi đơn chưa phân
  của toàn chuỗi, phân tay về chi nhánh, hoặc tự xử lý.
- **Thu ngân chi nhánh** — nhận đơn Admin đẩy về, chốt tồn và phát hành hoá đơn
  khi đóng gói giao shipper; được trả đơn về pool kèm lý do nếu không đáp ứng nổi.
- **Kế toán công nợ** — theo dõi công nợ COD tới khi shipper nộp tiền.

## Success signal

1. Web công ty POST được một đơn qua API key; đơn xuất hiện trong pool "chưa phân"
   của Admin trong vòng một lần refresh, mang đủ địa chỉ giao (tỉnh/phường theo
   mã `geo_*`), giá đã chốt, và **nguồn đơn** truy được.
2. Admin phân đơn về một chi nhánh; đơn biến mất khỏi pool và xuất hiện trong
   danh sách đơn của đúng chi nhánh đó, **không** cần chi nhánh đang mở ca.
3. Thu ngân chi nhánh xử lý đơn → hoá đơn phát hành, tồn bị trừ, công nợ COD mở;
   `invoices.sales_channel` và `invoices.sales_order_id` trỏ ngược về đơn gốc,
   nên báo cáo doanh thu tách được kênh web khỏi kênh tại quầy.
4. Chi nhánh trả đơn về pool kèm lý do; Admin phân lại cho chi nhánh khác mà
   không phải huỷ đơn của khách.
5. **Chi nhánh chỉ thấy đơn đã được phân cho chính mình.** Đơn còn trong pool
   không xuất hiện ở bất kỳ chi nhánh nào. Admin có màn riêng thấy toàn chuỗi,
   kèm cột chi nhánh đang giữ đơn.
6. Huỷ một đơn đã phát hành hoá đơn thì tồn, điểm tích, điểm đã tiêu và công nợ
   COD **tự quay về trạng thái trước khi bán** — không phải thao tác tay nào.
7. Thêm một kênh mới (Shopee/TikTok/Lazada) **không cần migration và không sửa
   enum** — chỉ đăng ký một kênh mới và cấp một API key.

## Out of scope

- **Khuyến mãi trên đơn online.** Quyết định của Akenzy 2026-09-20: đợt này đơn
  web chỉ dùng giá niêm yết, không áp CTKM. Lý do kỹ thuật: `EvaluateCartHandler`
  bắt buộc `actor.branchId` (`evaluate-cart.handler.ts:27,48`) và CTKM có phạm vi
  chi nhánh (`promotion_branches`, rỗng = toàn chuỗi) — đơn chưa phân chi nhánh
  thì không có phạm vi để tính. Để lại cho V2.
- **Giữ hàng / reservation.** Tồn chỉ chốt lúc thu ngân xử lý. Đơn nằm trong pool
  không giữ gì; hết hàng là rủi ro nghiệp vụ chấp nhận được, xử lý bằng luồng
  trả đơn về pool.
- **Tách một đơn cho nhiều chi nhánh.** Một đơn = một chi nhánh. Không đủ hàng ở
  đâu cả thì Admin tách tay thành hai đơn hoặc huỷ.
- **Tích hợp sàn TMĐT.** Chỉ web công ty. Thiết kế phải *cho phép* thêm sàn sau,
  không *làm* sàn lần này.
- **Vòng đời giao hàng.** Dải tab trạng thái trong ảnh tham chiếu 2 (Chờ
  giao/lấy hàng → Đang giao hàng → Chờ thu COD → Hoàn thành / Thất bại / Đã
  chuyển hoàn) **không** làm đợt này. `sales_order_status_enum` giữ nguyên 5
  trạng thái. Thay vào đó: đơn hỏng thì **huỷ**, và huỷ tự rollback (xem
  Constraints).
- **Đối tác vận chuyển, mã vận đơn, đối soát vận chuyển, mã đơn trên sàn.** Bảy
  cột `shippingPartner`, `carrierStatus`, `trackingCode`, `shippingFeePartner`,
  `packageInfo`, `reconciliationSlip`, `reconciliationStatus`,
  `marketplaceOrderCode` bị **ẩn khỏi dialog cột** đợt này. Giữ lại đúng hai cột
  có nghĩa với COD thuần: `cod` (Thu hộ — số tiền phải thu) và
  `shippingFeeCustomer` (Phí GH thu khách).
- **Sổ địa chỉ của khách hàng.** Địa chỉ giao thuộc về đơn, snapshot trên đơn.
  Không đụng `customers.address`.
- **Cổng thanh toán online.** COD only.

## Constraints

- **Điều phối không phải là duyệt.** `approve()` gọi `findOpenForBranch()` và ném
  `NO_OPEN_SESSION` nếu chi nhánh chưa mở ca
  (`pos-session.service.ts:118-122`). Hành động của Admin chỉ được gán chi nhánh;
  việc tạo hoá đơn nháp vẫn do thu ngân chi nhánh làm khi đã mở ca. Gộp hai việc
  là hỏng mọi lần Admin phân đơn ngoài giờ mở ca.
- **Nguồn đơn phải là dữ liệu, không phải enum.** `sales_orders.sales_channel`
  hiện là varchar tự do NOT NULL. Để "biết source đến từ đâu" một cách tin được
  và để mở sàn về sau, cần kênh đăng ký được + `external_order_id` duy nhất theo
  kênh (vừa là attribution, vừa là khoá chống trùng khi đối tác retry).
- **Không dựng domain đơn hàng thứ hai.** `sales_orders` đã có vòng đời
  `DRAFT → SENT → PROCESSED / REJECTED / CANCELLED`, số chứng từ, snapshot khách,
  dòng hàng, và `approve()` tạo hoá đơn nháp trong cùng transaction. Hai bảng đơn
  song song nghĩa là mọi báo cáo doanh thu phải hợp nhất hai nguồn.
- **COD đi đường công nợ hiện có.** `invoice_debts` là 1-1 với hoá đơn và
  `customer_id` NOT NULL — nên mọi đơn web phải tạo hoặc khớp được một khách hàng
  (khớp theo số điện thoại).
- Giá chốt tại thời điểm khách đặt. Khả thi vì `items.selling_price` là một giá
  duy nhất cấp tổ chức, không theo chi nhánh.
- Mọi ghi đều đi qua `IdempotencyInterceptor` sẵn có (`X-Idempotency-Key`) —
  không tự chế lại cơ chế chống trùng ở tầng endpoint.
- **Huỷ đơn tái dùng nguyên đường đảo đã có, không viết mới.**
  `CancelInvoiceService.cancel()` đã đảo trọn gói: bút toán kho đảo
  (`INVOICE_CANCEL` — "Huỷ hoá đơn bán hàng",
  `stock-ledger-reference.constants.ts:26,38`), claw back `pointsEarned`, trả lại
  `pointsRedeemed`, tất toán `invoice_debts`, bắn `invoice.cancelled`. Huỷ đơn web
  đã phát hành hoá đơn = gọi service đó rồi set đơn `CANCELLED`. Huỷ đơn chưa
  phát hành hoá đơn = chỉ đổi trạng thái đơn. Hoá đơn đã phát hành **không bị
  sửa** — đúng quy tắc bất biến của repo.
- Chuỗi hiển thị tiếng Việt; mã/enum tiếng Anh.

## Mô hình màn hình (ảnh tham chiếu Akenzy gửi 2026-09-20)

Ba ảnh Sapo là mô hình đích cho lưới đơn hàng. Phần lớn **đã được dựng sẵn**
trên backoffice, chạy mock:

- `ORDER_COLUMNS` (`pages/orders/_lib/order-columns.ts`) là bản 1:1 của bảng cột
  trong ảnh 1 — đủ 27 cột, đúng thứ tự, đúng nhãn tiếng Việt, đúng 6 cột ghim
  mặc định. Dựng theo một spec có đánh số mục (§4.3.2 trong comment).
- `OrdersColumnSettingsDialog` là dialog "Thiết lập cột hiển thị" trong ảnh 3.
- Nguồn dữ liệu là `_mock/orders.mock.ts`. **Không có cột "Chi nhánh".**

Việc của đợt này trên lưới đó: nối dữ liệu thật, thêm cột chi nhánh, ẩn 8 cột
vận chuyển/đối soát/sàn, và tách quyền nhìn.

### Ba màn, ba phạm vi

| Màn | Ai dùng | Phạm vi dòng | Hành động |
|-----|---------|--------------|-----------|
| **Điều phối** (mới) | Admin, quyền cấp tổ chức | chỉ đơn `branch_id IS NULL` | phân về chi nhánh; tự xử lý |
| **Tất cả đơn** (mới) | Admin, quyền cấp tổ chức | toàn chuỗi, **có cột Chi nhánh** | tra cứu; huỷ |
| **Đơn hàng** `/orders` (có sẵn, đang mock) | chi nhánh | **chỉ đơn đã phân cho chính chi nhánh đó** | xử lý → hoá đơn; trả về pool; huỷ |

Hai màn Admin tách biệt theo chốt của Akenzy: màn Điều phối tối ưu cho thao tác
phân hàng loạt, màn Tất cả đơn để tra cứu. Cả hai dùng chung bộ cột và bộ lọc
của `/orders`, khác nhau ở phạm vi dòng và cột Chi nhánh.

Đơn trong pool **không xuất hiện ở bất kỳ chi nhánh nào** — đây là hệ quả tự
nhiên của `branch_id IS NULL` + `list()` đang hard-filter theo branch
(`sales-order.service.ts:271`), không phải một cơ chế ẩn phải viết thêm.

## Mở rộng 2026-09-24 — yêu cầu khách (G1 reopened)

Ba việc thêm, cùng một mục tiêu: người điều phối biết **đủ hay thiếu hàng** trước
khi quyết định, nhưng không bị hệ thống chặn.

1. **Duyệt đơn** (US-09): **chi nhánh** duyệt đơn web vừa được phân về, trên màn
   đơn hàng của chi nhánh; duyệt nhiều đơn một lúc, cảnh báo thiếu hàng theo tồn
   của chi nhánh, đồng ý thì vẫn duyệt. Thu ngân chỉ xử lý đơn đã duyệt. Màn
   Điều phối không có bước duyệt (Akenzy đổi 2026-09-24, lần 2).
2. **Nhãn Thiếu hàng** (US-10): đơn đối tác vào ERP được đối chiếu tồn toàn chuỗi
   theo `itemCode`; thiếu thì vẫn nhận nhưng gắn nhãn.
3. **Chọn chi nhánh từng đơn** (US-11): tick đơn trên lưới Điều phối, bấm "Điều phối"
   → dialog chọn chi nhánh cho từng đơn (ô đầu cột điền cả danh sách), nút Validate
   bên trái nút Lưu (Akenzy đổi 2026-09-24, lần 3: bỏ cột chọn trên lưới).

Vẫn **ngoài phạm vi**: giữ hàng / reservation (xem trên) — đủ/thiếu so với tồn
thực tế, không trừ đơn đang chờ (A-33).
