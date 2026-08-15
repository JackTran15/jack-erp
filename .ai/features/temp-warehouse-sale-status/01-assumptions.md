---
feature: temp-warehouse-sale-status
blocking_open: 0         # count of blocking + pending; must be 0 to pass G1
---

# Assumption register

> **2026-08-15.** Các giả định về nhánh bán showroom được đánh `superseded` sau ADR-05 (nguồn đó
> đã cài rồi gỡ). Chúng không phải câu hỏi mở nữa — chủ thể của chúng không còn tồn tại. Còn hiệu
> lực trên code đang ship: **A-10, A-11, A-12**.

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | Dấu hiệu duy nhất phân biệt hai luồng bán là **lúc trừ POS có tiêu thụ dòng kho tạm hay không**; không tồn tại cờ provenance nào trên `invoices` / `invoice_items` | high | yes | Nếu sai, cả cách cắt nghiệp vụ sai — phải đổi nguồn dữ liệu, kế hoạch làm lại từ G2 | superseded | Đúng vào thời điểm chốt, nhưng câu hỏi không còn đặt ra: báo cáo không đọc `invoice_items` nữa (ADR-05) |
| A-02 | Không backfill dữ liệu trước 25/06/2026; chấp nhận cửa sổ 16/05→25/06 hiển thị sai luồng | high | yes | Báo cáo kỳ cũ đọc sai luồng; không có cách phát hiện tự động | resolved | Chủ sở hữu chốt 2026-08-15 phương án (1) "chấp nhận + ghi chú". Không ghép ngược được: `invoice_id` và `fulfillTransferDescription` cùng sinh ở commit `ddaacee3`. Vào ADR-03. Sau ADR-05 ảnh hưởng nhẹ hơn: dòng đó chỉ đơn giản không có nhãn bán, thay vì mang nhãn sai |
| A-03 | Chỉ dòng `invoice_items.direction = 'OUT'` của hóa đơn `is_draft = FALSE` và `status <> 'cancelled'` tính vào `Bán hàng trưng bày`; dòng `IN` (khách trả / đổi trả lại) không đưa vào | medium | yes | Nếu sai, thiếu hẳn chiều trả của khách ⇒ +1 UoW và phải đổi nghĩa nhãn `Trả hàng trưng bày` đang dùng | superseded | Vị từ lọc hóa đơn đã gỡ cùng nhánh showroom (ADR-05) |
| A-04 | Người ký gate là `Loc Tran` | high | yes | Chỉ ảnh hưởng audit trail, nhưng `pass` bị từ chối nếu không có tên người thật | resolved | Chủ sở hữu chốt 2026-08-15 (khác `Akenzy` của phần lớn feature trước) |
| A-05 | `tw_claimed` phải gộp theo `(invoice_id, item_id)` **không giới hạn kỳ** — dòng kho tạm có thể stage trước kỳ nhưng bán trong kỳ | high | no | Chặn theo kỳ sẽ đếm trùng ở ranh giới kỳ: cùng một SL vừa ra dòng kho tạm vừa ra dòng showroom | superseded | `tw_claimed` không còn tồn tại (ADR-05) |
| A-06 | Không cần ràng buộc `location_id` thuộc storage showroom cho nhánh mới; "phần dư không phải kho tạm" đã đủ định nghĩa | medium | no | Thêm ràng buộc sẽ rơi dòng cũ có `location_id` NULL; bỏ ràng buộc thì dòng bán từ vị trí lạ (nếu có) vẫn vào nhóm trưng bày | superseded | Nhánh showroom đã gỡ (ADR-05) |
| A-07 | Một dòng báo cáo `Bán hàng trưng bày` = một dòng `invoice_items` với `SL bán` = phần dư (có thể > 1), khác granularity dòng kho tạm (luôn = 1 đơn vị) | medium | no | Người dùng thấy hai loại dòng có granularity khác nhau; nếu không chấp nhận thì phải bung theo đơn vị ⇒ số dòng tăng theo SL | superseded | Granularity của dòng showroom không còn nghĩa (ADR-05) |
| A-08 | `SL xuất` / `SL trả` / `SL tồn` = 0 cho dòng bán showroom là cách trình bày đúng (hàng chưa từng qua kho tạm) | medium | no | Nếu để `SL tồn = −SL bán` theo công thức cũ, tổng cột "còn trưng bày ở kho tạm" bị âm giả | superseded | Nhánh showroom đã gỡ (ADR-05) |
| A-09 | `Ngày/Giờ xuất` = `COALESCE(issued_at, created_at)`, `Nhân viên xuất` = `invoices.staff_id`, `Mã vị trí` = vẫn resolve bằng 2 LATERAL sẵn có | medium | no | Cột hiển thị lệch kỳ vọng; sửa rẻ, chỉ đổi biểu thức trong CTE | superseded | Nhánh showroom đã gỡ (ADR-05) |
| A-10 | Không migration, không đổi schema — mọi thứ lấy từ cột sẵn có | high | no | Nếu sai, phạm vi đổi hẳn: có migration thì phải xét lại toàn bộ kế hoạch | confirmed | Đúng: diff cuối không có migration nào, và `temp-warehouse-report.service.ts` chỉ đổi doc-comment + một chuỗi nhãn |
| A-11 | Bump **report key** (không phải `CACHE_NAMESPACE`) từ `'temporary-warehouse-out-goods2'` sang `...goods3` là đủ để entry mang nhãn cũ không sống sót qua deploy | high | no | Cache lạnh trong thời gian ngắn sau deploy | confirmed | Đúng cho đường REST v1: report key là thành phần đầu của cache key `${reportKey}:${orgId}:${hash}`. **Không** che đường report-registry (`SearchInventoryReportHandler`, key `sha256(orgId + dto)`, không version token) — đường đó phục vụ chuỗi cửa hàng / Xuất khẩu / In và có thể trả nhãn cũ tối đa 45s (TTL). Chấp nhận cửa sổ đó, ghi tại chỗ trong code |
| A-12 | Giữ giá trị filter là **chuỗi tiếng Việt** backend phát ra (không đổi sang mã enum) trong phạm vi này | high | no | Đổi sang enum sẽ phá template báo cáo người dùng đã lưu và URL đã chia sẻ | confirmed | Giữ nguyên quy ước. LƯU Ý phát hành: template cũ lọc theo `Bán hàng trưng bày` giờ trả về rỗng — giá trị đó không còn tồn tại (ADR-05); phải nhắc người dùng đổi sang `Bán hàng kho tạm` |
| A-13 | Thêm nguồn showroom không đẩy tổng số dòng chạm trần `MAX_REPORT_ROWS` (50.000) ở kỳ lọc thông thường | low | no | Export fail ở kỳ rộng; van xả là mở UoW riêng đẩy `columnFilters` xuống SQL hoặc keyset cho export | superseded | Số dòng trở về đúng như trước tính năng ⇒ không có áp lực mới lên trần 50.000 (ADR-05) |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
|----|-----------------|----------------------|-------------|
| A-R1 | Có thể phân biệt hai luồng ngay trong `temp_warehouse_lines`, chỉ bằng đổi biểu thức `CASE` | Luồng bán hàng trưng bày **không sinh dòng nào** trong bảng đó — `fulfillInvoiceFromTempWarehouse` thoát sớm ở `:1323` khi không có dòng nào staged | Sinh ra UOW-02 (nguồn `invoice_items` + `tw_claimed`). ADR-05 sau đó **gỡ** nguồn đó: đúng là không phân biệt được trong một bảng, nhưng kết luận đúng là nghiệp vụ kia nằm ngoài phạm vi báo cáo, chứ không phải phải kéo nó vào |
| A-R2 | `temp_warehouse_lines.source_location_id` phân biệt được kho thường vs showroom | Cột này đi theo `direction` của chính dòng đó, nullable, và do người dùng chọn tay ở toolbar POS (`temp-warehouse-mappers.ts:173-190`); đường checkout **không bao giờ ghi** nó | Không dùng được làm dấu hiệu; loại phương án "tách theo `sourceLocationId`" |
| A-R3 | Có thể backfill `invoice_id` cho dòng cũ qua `stock_transfers.invoice_id` | Cả hai cột `invoice_id` được thêm trong **cùng một** migration `1785100000000` — phiếu chuyển kho trước 25/06/2026 cũng NULL | Không có khóa ghép ngược ⇒ A-02 chọn "chấp nhận", không backfill |
| A-R4 | `storages.is_main_storage = TRUE` nghĩa là kho chính (kho thường) | Ngược lại: `TRUE` là storage nền của **showroom** (`storage.entity.ts:18`, `branch.service.ts:114-136`); kho thật là `FALSE` | Bẫy đặt tên; mọi vị từ liên quan showroom/kho trong query phải đọc kỹ chiều này |
