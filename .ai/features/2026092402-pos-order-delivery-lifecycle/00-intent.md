---
feature: pos-order-delivery-lifecycle
slug: 2026092402-pos-order-delivery-lifecycle
owner: Akenzy
created: 2026-09-24
status: draft
---

# Intent — Đơn hàng + Đơn hàng Online trên POS, có vòng đời giao hàng

## Problem

Đơn online (`sales_orders`, feature `2026092001-online-order-intake-dispatch`)
đã vào ERP, được Admin phân về chi nhánh và chi nhánh duyệt được — nhưng **chỉ
trên backoffice**. Thu ngân ngồi ở POS không có màn nào để nhận và theo dõi đơn:

- **POS không có route đơn hàng.** Menu đã khai sẵn hai mục "Đơn hàng"
  (`id: don-hang`) và "Đơn hàng online" (`id: don-hang-online`) nhưng không có
  route (`apps/pos-web/src/constants/pos-menu.constant.ts:32-51`). `App.tsx:55-63`
  chỉ có checkout, trả hàng, DS hoá đơn, báo cáo ngày.
- **Không có vòng đời giao hàng.** `sales_order_status_enum` chỉ có DRAFT / SENT /
  PROCESSED / REJECTED / CANCELLED (`sales-order.entity.ts:9-16`). Sau khi thu ngân
  "Nhận xử lý" (`approve`, `sales-order.service.ts:1367-1457`) đơn là PROCESSED và
  không còn trạng thái nào nữa — không biết hàng đã giao shipper chưa, đang giao,
  giao thất bại, hay đã hoàn về.
- **Không có dữ liệu giao hàng.** Không có cột ngày giao, đối tác giao, mã vận đơn,
  phí trả đối tác, thông tin gói hàng, nhãn (`sales-order.entity.ts`, không có
  entity carrier nào trong repo).
- **Thu COD không gắn với đơn.** COD là `invoice_debts` của hoá đơn sinh ra từ đơn;
  thu tiền đi qua `debt_payments` (`POST /invoices/debts/:debtId/payments`,
  `pos/controllers/invoice.controller.ts:138`), nhưng không có cách nào thu từ
  lưới đơn và trạng thái đơn không phản ánh việc đã thu.
- **List của chi nhánh không lọc được theo kênh.** `GET /mobile/sales-orders` chỉ
  lọc `status`, `from/to`, `awaitingCashier` (`dto/sales-order-list.query.dto.ts`) —
  không kênh, không tìm kiếm, không lọc cột, không trạng thái giao.

## Affected personas

- **Thu ngân / nhân viên kho chi nhánh (POS)** — nhận xử lý đơn online theo từng
  kênh, bàn giao shipper, cập nhật trạng thái giao, thu COD khi shipper nộp tiền.
- **Quản lý chi nhánh** — nhìn toàn bộ đơn giao của chi nhánh theo trạng thái để
  biết đơn nào kẹt.

## Success signal

1. Từ menu POS mở được **Đơn hàng Online**; sidebar liệt kê đúng các kênh đang
   hoạt động trong `sales_channels` của tổ chức; chọn một kênh thì lưới chỉ còn
   đơn của kênh đó, **của chi nhánh đang chọn**, lọc theo ngày và trạng thái
   (mặc định "Chưa xử lý").
2. Tick một hoặc nhiều đơn "Chưa xử lý" → **Nhận xử lý** → đơn có hoá đơn, rời
   trạng thái "Chưa xử lý" và xuất hiện ở màn **Đơn hàng** tab "Chờ giao/lấy hàng".
3. Trên **Đơn hàng**, thu ngân chuyển đơn qua đủ vòng đời:
   Chờ giao/lấy hàng → Đang giao hàng → Chờ thu COD → Hoàn thành, và nhánh
   Thất bại / Đã chuyển hoàn; mỗi tab đếm và lọc đúng. Mỗi lần chuyển trạng thái
   được ghi lịch sử (ai, lúc nào).
4. *(Đã bỏ 2026-09-24 — Thu COD làm sau, xem Out of scope.)*
5. Tab "Đã thanh toán" / "Chưa thanh toán/Lưu tạm" phản ánh đúng trạng thái
   thanh toán của hoá đơn gắn với đơn.
6. Đủ các cột trong ảnh tham chiếu có dữ liệu thật hoặc được đánh dấu ẩn có lý do;
   lọc từng cột theo toán tử như DS hoá đơn POS.
7. Không chi nhánh nào thấy đơn của chi nhánh khác.

## Out of scope

Chốt bởi Akenzy 2026-09-24:

- **Bán tại quầy có giao hàng** không sinh đơn giao. Đơn giao chỉ đến từ
  `sales_orders`.
- **Tab "Đợt giao hàng", tab "Đơn hàng OCM".**
- **Gửi đơn hàng** sang hãng vận chuyển (tích hợp API GHN/GHTK/…). Mã vận đơn
  nếu có là nhập tay.
- **In phiếu GH**, **Thống kê hàng hoá**. Nút hiện dạng disabled hoặc ẩn.
- Đối soát vận chuyển (phiếu đối soát, trạng thái đối soát).
- **Thu COD.** Akenzy 2026-09-24: hiện tại COD luôn bằng 0, thu COD làm sau.
  Nút "Thu COD" disabled; cột "Thu hộ" hiện 0. Trạng thái và tab "Chờ thu COD"
  vẫn có trong vòng đời để đợt sau cắm vào, không có đường nào tự đưa đơn vào đó
  ngoài "Cập nhật TT".
- Mọi thay đổi màn backoffice `/orders` / Điều phối / Tất cả đơn — ngoài việc
  backoffice đọc được trạng thái giao mới nếu cùng view.

## Constraints

- **Không dựng domain đơn thứ hai.** Đơn giao = `sales_orders` + hoá đơn của nó;
  vòng đời giao là trục trạng thái bổ sung, không thay `sales_order_status_enum`.
- **Nhận xử lý = `approve()` hiện có**: cần ca POS đang mở
  (`posSessions.findOpenForBranch`, `:1383`), tạo hoá đơn nháp trong cùng
  transaction, đơn web phải được chi nhánh duyệt (`confirm`) trước
  (`ORDER_NOT_CONFIRMED`, `:1375`). Không viết đường tạo hoá đơn thứ hai.
- **COD đi đường công nợ hiện có** (`invoice_debts` + `debt_payments`, có phiếu
  thu). Không tự trừ công nợ bằng update tay.
- **Hoá đơn bất biến sau phát hành.** Hoàn hàng / huỷ đảo qua
  `CancelInvoiceService` hoặc luồng trả hàng, không sửa hoá đơn.
- Phạm vi dữ liệu: `organizationId` + `X-Branch-Id`; endpoint mới chạy dưới
  `BranchScopeGuard` như `/mobile/sales-orders`.
- Code pos-web theo `apps/pos-web/CLAUDE.md`: `pages/` + `components/page-components/`
  + `hooks/page-hooks/` + `services/` + react-query; lưới dùng `PosDataTable` +
  `PosDataTableFilterCell` + `PosPaginationBar` như DS hoá đơn.
- Chuỗi UI tiếng Việt; mã/enum tiếng Anh.

## Mô hình màn hình (ảnh Akenzy gửi 2026-09-24)

- **Ảnh 1-2 — Đơn hàng**: 10 tab trạng thái; bộ lọc loại ngày + khoảng ngày +
  nhãn; nút Gửi đơn hàng, Giao hàng, Thu COD, Hoàn thành, Gắn nhãn, Thống kê hàng
  hoá, In phiếu GH, Cập nhật TT; 24 cột (Ngày tạo đơn … Trạng thái), hàng lọc cột,
  phân trang 100.
- **Ảnh 3 — Đơn hàng Online**: sidebar kênh; bộ lọc Hôm nay + ngày + "Chưa xử lý";
  nút Nhận xử lý; 10 cột (Mã đơn hàng (OCM) … Nhãn).
