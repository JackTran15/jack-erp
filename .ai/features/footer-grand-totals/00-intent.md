---
feature: footer-grand-totals
slug: footer-grand-totals
owner: Loc Tran
created: 2026-08-13
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Footer tổng toàn tập kết quả (Kho hàng + Báo cáo kho)

Nguồn: rà soát footer toàn app ngày 2026-08-13, khởi từ ảnh chụp màn hình Nhập kho /
Tổng hợp tồn kho / Chuyển kho của chi nhánh Buôn Ma Thuật.

## Problem

Dòng footer của bảng danh sách **cộng dồn đúng những dòng đang hiển thị trên trang hiện tại**,
rồi trình bày con số đó như thể là tổng của cả bộ lọc.

- Nhập kho hiện 14 phiếu, footer ghi `4.141.161.000` — thực chất là tổng của 10 dòng đang xem.
  Đổi từ 20 sang 50 dòng/trang, con số nhảy. Sang trang 2, nhảy tiếp.
- Không có nhãn nào nói đó là tổng của trang. Người dùng đọc nó như tổng thật, chép vào báo cáo,
  đối chiếu với sổ sách rồi không khớp.
- `BaseDataTable` (`apps/backoffice-web/src/components/table/BaseDataTable.tsx:60-65`) chỉ nhận
  `footer:` dạng `ReactNode` — **bản thân bảng không tính gì**. Nên đây không phải một lỗi ở một
  chỗ, mà là cùng một lỗi được chép lại ở từng trang.

Nặng hơn cả: 8 trang **Báo cáo kho** hard-code `pageSize: 200, page: 1`
(`pages/reports/storage/_shared/apiFilters.ts:103-106`) rồi phân trang giả phía client. Với báo
cáo Tổng hợp NXT (~8.265 dòng), **dòng thứ 201 trở đi không bao giờ hiển thị**, trong khi pager
vẫn hiện tổng số dòng thật lấy từ API. Footer ở đó không chỉ sai — nó sai trên một tập dữ liệu
đã bị cắt cụt mà không báo.

## Affected personas

| Persona            | Hành vi hiện tại                                                        | Hành vi mong muốn                                                    |
| ------------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Kế toán kho        | Chép số footer làm tổng nhập/xuất trong kỳ, lệch với sổ, dò tay lại      | Số footer bằng đúng tổng toàn bộ kết quả lọc, chuyển trang không đổi  |
| Quản lý chi nhánh  | So tồn kho giữa hai lần xem thấy số khác nhau vì lỡ đổi số dòng/trang    | Một bộ lọc cho ra một con số duy nhất                                 |
| Người xem báo cáo  | Xem báo cáo NXT tưởng đủ, thực tế chỉ thấy 200/8.265 dòng                | Duyệt được tới trang cuối; footer là tổng thật của cả tập             |
| Developer          | Mỗi trang tự `reduce` một kiểu; không có chỗ nào chặn lỗi tái diễn       | Tổng do server tính, cùng một `buildQuery` với lưới nên không lệch được |

## Success signal

Với **cùng một bộ lọc**, giá trị footer không đổi khi người dùng chuyển trang hoặc đổi số
dòng/trang — kiểm chứng được bằng unit test (`limit: 1` và `limit: 100` trả cùng một tổng) trên
cả 12 bảng trong phạm vi, và bằng ảnh chụp trước/sau ở G4.

Chỉ báo phụ: trên Báo cáo kho, số dòng duyệt được bằng đúng `total` mà API trả về (hết cắt ở 200).

## Out of scope

- **3 bảng POS** (Danh sách hóa đơn, Lịch sử mua hàng, Đổi trả hàng) — cùng lỗi, nhưng khác app
  và khác module API; tách feature riêng để lát cắt này không phình.
- **Thêm footer cho bảng chưa có** (Điều chuyển từ cửa hàng khác, Chi tiết vị trí hàng hóa,
  Lệnh điều chuyển, Kiểm kê kho, Vị trí hàng hóa) — quyết định của chủ sở hữu: đợt này chỉ sửa
  footer đang tính sai, không thêm cái mới.
- **Defect có sẵn của `getSummary`**: `total` khác nhau giữa trang 1 và trang ≥2 (`:513`), và các
  dòng pending-only không chịu filter của lưới (`:452-455`). Totals sẽ **tái hiện đúng** các quirk
  này để footer luôn khớp cột đang hiển thị; sửa bản chất là việc khác.
- **Quirk khử trùng `incomingAssigned`** (`stock-period.service.ts:259-267`) — giữ nguyên hành vi,
  ghi lại thành câu hỏi nghiệp vụ.
- Đổi giao diện footer (nhãn, định dạng, vị trí) — chỉ đổi *nguồn số*.

## Constraints

| Kind     | Detail                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------- |
| Kiến trúc| Tổng phải do **server** tính, dùng chung `buildQuery` với query lưới — footer không được phép lệch lưới |
| Kiến trúc| Mọi bảng trong phạm vi phải **phân trang phía server**; kéo theo lọc-theo-cột cũng phải xuống server   |
| Dữ liệu  | Không đổi schema, không migration — chỉ thêm aggregate trên truy vấn đọc                             |
| Hiệu năng| Tập kết quả thực tế ~8k dòng; thêm aggregate không được thêm round-trip tuần tự (chạy trong `Promise.all`) |
| Tương thích | `stock-summary` còn phục vụ export (`stock-summary-export.service.ts:80-98`) và báo cáo chuỗi — không được làm chậm chúng |
| Nền tảng | Desktop only, `vi-VN`; sửa response v2 phải chạy lại `pnpm openapi:generate` và commit file sinh ra |

## Existing surface touched

**Mẫu có sẵn để chép, không phát minh lại:**
- `apps/api/src/modules/accounting/deposit-recon/queries/search-deposit-recon-v2.handler.ts:69-91,133-178`
  — `buildQuery` gọi hai lần (rows + totals), `Promise.all`, trả `totalAmount`. Cảnh báo về
  correlated subquery vs join ở `:28-36` áp dụng nguyên vẹn cho các handler kho.
- `apps/api/src/modules/accounting/cash-vouchers/queries/search-cash-vouchers-v2.handler.ts:143-177`
  — biến thể raw SQL/CTE, dùng cho các service báo cáo.
- FE: `pages/promotions/vouchers/VouchersTable/VouchersTable.tsx:134`,
  `pages/treasury/cash/receipts-expenses/TreasuryCashReceiptsPage.tsx:177` — footer đọc thẳng từ API.
- `common/filters/filter.builder.ts` + `components/crud/crudV2Search.ts` (`buildV2Body`) — cơ chế
  lọc-theo-cột phía server đã dùng cho 3 trang phiếu kho.

**Sẽ sửa:**
- API: `inventory/goods-receipt|goods-issue|transfer/queries/search-*-v2.handler.ts`,
  `inventory/ledger/stock-summary.service.ts`, `inventory-reports/` (facade + 5 service + DTO).
- Web: 3 trang phiếu kho, `pages/inventory/InventoryManagementPage.tsx`,
  `pages/reports/storage/_shared/{StorageReportShell.tsx,apiFilters.ts}` + 8 trang báo cáo,
  `api/{stock-summary,inventory-reports}.ts`.

**Feature lân cận:** `export-print` (dùng chung `stock-summary`/`inventory-reports` service),
`line-item-grid-column-filter` (cùng vốn từ lọc-theo-cột).
