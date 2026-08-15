---
feature: temp-warehouse-sale-status
slug: temp-warehouse-sale-status
owner: Loc Tran
created: 2026-08-15
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Sửa nhãn trạng thái bán trên báo cáo "Hàng hóa xuất kho tạm"

Nguồn: yêu cầu của chủ sở hữu ngày 2026-08-15, kèm ảnh chụp báo cáo chi nhánh Buôn Ma Thuật
(Tháng 08/2026, 67 dòng) và màn hình Chuyển kho tạm của chi nhánh Nha Trang.

> **Sửa phạm vi 2026-08-15, sau khi đã cài rồi gỡ.** Bản đầu của intent này có hai vế: đổi nhãn,
> **và** thêm nguồn `invoice_items` để hàng trưng showroom bán ra hiện thành `Bán hàng trưng bày`.
> Vế thứ hai đã cài xong, chạy đúng, kiểm chứng đủ — rồi **gỡ** theo quyết định của chủ sở hữu:
> trên `erp_dev` kỳ 08/2026 nó làm báo cáo phình từ 7 lên 71 dòng, trong đó **64/71 là hàng chưa
> từng vào kho tạm**. Một báo cáo tên "Hàng hóa xuất kho tạm" mà 90% nội dung không xuất kho tạm.
> Lý do đầy đủ và những gì học được ở **ADR-05**.
>
> Phạm vi còn lại: **chỉ đổi nhãn**. Sau thay đổi, không dòng nào mang nhãn `Bán hàng trưng bày`,
> nên giá trị đó bị gỡ khỏi danh sách lọc. Nghiệp vụ bán hàng trưng bày vẫn nằm ngoài báo cáo này —
> đúng như trước, nhưng giờ là có chủ đích chứ không phải do thiếu sót.

## Problem

Báo cáo `inventory-temp-warehouse-out` chỉ có **một** trạng thái cho việc bán, và nó gắn sai nghiệp vụ.

**1. Nhãn hiện tại mô tả sai thứ nó đang đếm.**
`temp-warehouse-report.service.ts:271` gán `'Bán hàng trưng bày'` cho mọi dòng có `invoice_id`:

```sql
WHEN p.invoice_id IS NOT NULL THEN 'Bán hàng trưng bày'
```

Nhưng `invoice_id` chỉ được ghi ở đúng một chỗ — `fulfillInvoiceFromTempWarehouse`
(`temp-warehouse.service.ts:1382-1388`) — và hàm đó chỉ tiêu thụ dòng `warehouse_to_showroom`
đang ACTIVE (`:1292-1321`). Nghĩa là mọi dòng mang nhãn "Bán hàng trưng bày" trong ảnh chụp
**đều là hàng lấy từ kho, scan vào kho tạm, rồi mới bán** — đúng nghiệp vụ phải đọc là
*Bán hàng kho tạm*. Doc-comment của chính file đó (`:28-36`) cũng mô tả nhánh này là "dòng xuất
có invoice_id", không phải hàng trưng bày.

**2. Bộ lọc trạng thái lệch nhau ở ba nơi.**
Backend phát 5 chuỗi; `TemporaryIssuesReportPage.tsx:39-43` liệt kê 3; và registry chuỗi cửa hàng
(`report-temporary-warehouse-out-goods.registry.ts`) vẫn còn giá trị mock tiếng Anh
(`exported` / `pending` / `cancelled`) không bao giờ khớp — filter trạng thái ở chế độ chuỗi
cửa hàng hiện **không lọc được gì**.

## Affected personas

| Persona | Hành vi hiện tại | Hành vi mong muốn |
| --- | --- | --- |
| Quản lý cửa hàng | Đọc "Bán hàng trưng bày" tưởng là hàng trưng showroom bán ra; thực chất là hàng kho scan kho tạm | Nhãn đọc đúng luồng đã xảy ra: `Bán hàng kho tạm` |
| Kế toán kho | Không chắc "SL bán" đang đếm nghiệp vụ nào | Biết chắc mọi dòng đều là hàng đã đi qua kho tạm |
| Người dùng chế độ chuỗi | Chọn filter Trạng thái, lưới trả về rỗng | Dropdown liệt kê đúng các giá trị backend phát ra, chọn giá trị nào cũng lọc đúng |

## Success signal

Mọi dòng báo cáo đều đến từ `temp_warehouse_lines` — **số dòng không đổi** so với trước thay đổi,
chỉ nhãn trạng thái đổi. Trên bộ dữ liệu `erp_dev` kỳ 08/2026: 7 dòng trước, 7 dòng sau; 4 dòng có
số hóa đơn chuyển từ `Bán hàng trưng bày` sang `Bán hàng kho tạm`, 3 dòng `Xuất không bán` giữ
nguyên. Kiểm chứng bằng test chạy SQL thật và bằng ảnh chụp trước/sau ở G4.

Chỉ báo phụ: dropdown Trạng thái liệt kê đúng những giá trị backend thực sự phát ra ở cả hai chế độ
(đơn cửa hàng và chuỗi cửa hàng), và file Excel xuất khẩu đọc cùng bộ đó — cả ba đi chung
`TempWarehouseReportService.list` qua `TempWarehouseOutReport`, nên không có đường nào lệch.

## Out of scope

- **Bán hàng trưng bày (hàng đã trưng sẵn ở showroom, bán ra).** Nghiệp vụ này không sinh dòng
  `temp_warehouse_lines` nào — POS trừ tồn thẳng từ vị trí showroom
  (`resolveBranchItemLocations(..., { showroomOnly: true })`) và `fulfillInvoiceFromTempWarehouse`
  thoát sớm khi không có dòng nào staged. Đã cài thử bằng nguồn `invoice_items` trừ đi phần kho tạm
  đã nhận, chạy đúng, rồi gỡ: nó chiếm 64/71 dòng và làm báo cáo không còn đúng tên. Xem ADR-05.
  Muốn con số này thì dùng báo cáo doanh thu, không phải báo cáo kho tạm.
- **Backfill dữ liệu trước 25/06/2026.** Luồng fulfill và cột `invoice_id` (trên cả
  `temp_warehouse_lines` lẫn `stock_transfers`) cùng ra đời ở commit `ddaacee3` ngày 25/06/2026;
  module kho tạm có từ 16/05/2026. Trong cửa sổ đó, hàng scan kho tạm rồi bán không được ghi
  `invoice_id`, nên theo logic mới sẽ hiện thành `Bán hàng trưng bày` dù thực tế đi qua kho tạm.
  Không ghép ngược được — phiếu chuyển kho thời đó không mang bất kỳ tham chiếu hóa đơn nào
  (cả cột `invoice_id` lẫn chuỗi mô tả `fulfillTransferDescription` đều sinh ra ở đúng commit đó).
  Chủ sở hữu chốt 2026-08-15: chấp nhận, ghi thành ADR, không đoán bằng FIFO.
  *(Sau khi gỡ nguồn showroom, ảnh hưởng nhẹ hơn hẳn: dòng cũ đó chỉ đơn giản không xuất hiện, thay
  vì xuất hiện dưới nhãn sai.)*
- **Trả hàng của khách (RETURN / dòng `direction = 'IN'`).** Báo cáo này chưa từng mô hình hóa
  trả hàng của khách; nhãn `Trả hàng trưng bày` sẵn có nghĩa là *trả về kho*, không phải khách trả.
  Đưa dòng IN vào sẽ đổi nghĩa một nhãn đang dùng.
- **Sửa lệch `columnFilters` giữa hai đường.** `TempWarehouseOutReport.buildData:108` áp lọc bằng
  JS, REST cũ áp bằng SQL — hai đường có thể ra tổng khác nhau. Defect có sẵn, không sinh ra từ
  thay đổi này.
- **Ghi provenance vào `invoice_items`.** Thêm cột đánh dấu "bán từ kho tạm / bán từ trưng bày"
  lúc checkout sẽ chính xác hơn suy diễn, nhưng là đổi schema + đổi đường ghi của POS.

## Constraints

- **Không migration, không đổi schema.** Trạng thái là biểu thức `CASE` tính lúc query, không lưu.
- **Không đổi số dòng của báo cáo.** Đây là ràng buộc rút ra từ lần đảo phạm vi: mọi dòng phải đến
  từ `temp_warehouse_lines`. Thêm nguồn khác là đổi bản chất báo cáo, không phải sửa nhãn.
- **Một nguồn sự thật duy nhất**: mọi thay đổi công thức nằm trong
  `apps/api/src/modules/inventory-reports/services/temp-warehouse-report.service.ts`. Lưới (REST cũ),
  chế độ chuỗi cửa hàng, Xuất khẩu và In đều đi qua đó — sửa một chỗ là cả bốn khớp.
- **Danh sách trạng thái chỉ khai báo một lần** ở `TEMP_WAREHOUSE_OUT_STATUS_OPTIONS`
  (`packages/shared-interfaces/src/inventory-report/column.ts:266-272`); hai chỗ hard-code ở
  frontend phải import lại từ đó thay vì tự liệt kê.
- **Giữ nguyên thứ tự 6 tham số `baseParams`** của query hiện tại, để
  `buildReportColumnFilter(..., baseParams.length)` và `LIMIT/OFFSET` không phải đánh số lại.
- **Response được cache Redis** theo report key `'temporary-warehouse-out-goods2'`
  (`inventory-reports.service.ts:360`) — đổi công thức phải bump key, nếu không user vẫn đọc nhãn
  cũ tới khi hết TTL.
- Chuỗi hiển thị tiếng Việt; giá trị filter dùng đúng chuỗi backend phát ra (đây là quy ước sẵn
  có của báo cáo này, không đổi sang mã enum trong phạm vi này).

## Rủi ro theo dõi

Không còn rủi ro trần 50.000 dòng: sau khi gỡ nguồn showroom, số dòng báo cáo trở về đúng như
trước thay đổi, nên `assertUnderRowCap` (`temp-warehouse-out.report.ts:95-105`) không gặp áp lực
mới nào.
