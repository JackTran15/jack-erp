---
feature: temp-warehouse-sale-status
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Sửa nhãn trạng thái bán trên báo cáo "Hàng hóa xuất kho tạm"

Chạy bằng `admin@erp.local`, chi nhánh **HCM** (`LOCAL_BACKOFFICE_BRANCH_NAME`) — toàn bộ 7 dòng
`temp_warehouse_lines` của `erp_dev` đều thuộc chi nhánh này. Kỳ mặc định của trang là "Tháng này",
tức 08/2026.

Con số trong cột `Assert` là **sự thật lấy từ SQL**, chạy bằng đúng chuỗi truy vấn mà
`TempWarehouseReportService` sinh ra (bắt qua một spec tạm, thay `$1..$6` bằng literal), **không
phải** con số đọc trên UI rồi chép lại:

```sql
-- org f1000000-…-0001, branch HCM 69982b87-…, kỳ [2026-08-01, 2026-09-01)
SELECT status, COUNT(*) AS n, SUM(out_qty), SUM(return_qty), SUM(sale_qty), SUM(remaining_qty)
FROM enriched GROUP BY status;
--  Bán hàng kho tạm | 4 | 4 | 0 | 4 | 0
--  Xuất không bán   | 3 | 3 | 0 | 0 | 3
--  → tổng: 7 dòng, SL xuất 7, SL trả 0, SL bán 4, SL tồn 3
```

Điểm mấu chốt của tính năng: **4 dòng đó trước thay đổi đọc là `Bán hàng trưng bày`**. Nhãn ấy
giờ không được phép xuất hiện ở bất cứ đâu trên trang — cả trong lưới lẫn trong danh sách lọc.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Lưới HCM 08/2026: đúng **4** dòng đọc `Bán hàng kho tạm` (khớp SQL), **0** dòng còn mang nhãn cũ, tổng 7 dòng | `/reports/storage/temporary-issues` | — | AC-01, AC-02 | `count tbody :text-is("Bán hàng kho tạm") = 4; count tbody :text-is("Bán hàng trưng bày") = 0; text=Hiển thị 1 - 7 trên 7 kết quả` |
| S2 | Dòng tổng ở footer bằng đúng tổng SQL của toàn tập: SL xuất 7, SL bán 4, SL tồn 3 — không phải tổng trang | `/reports/storage/temporary-issues` | `scroll tfoot` | AC-04 | `count tfoot td:text-is("7") = 1; count tfoot td:text-is("4") = 1; count tfoot td:text-is("3") = 1` |
| S3 | Dropdown lọc "Trạng thái": đúng 6 mục (5 giá trị backend phát ra + "— Tất cả —"), có `Bán hàng kho tạm`, **không còn** `Bán hàng trưng bày` — giá trị đó sẽ lọc ra rỗng vĩnh viễn | `/reports/storage/temporary-issues` | `scroll select[aria-label="Lọc Trạng thái"]` | AC-02, AC-05 | `count select[aria-label="Lọc Trạng thái"] option = 6; count select[aria-label="Lọc Trạng thái"] option:text-is("Bán hàng kho tạm") = 1; count select[aria-label="Lọc Trạng thái"] option:text-is("Bán hàng trưng bày") = 0` |
| S4 | Trạng thái cũ giữ nguyên nghĩa: `Xuất không bán` vẫn đúng **3** dòng (khớp SQL), và mỗi dòng bán mang đúng số hóa đơn đã tiêu thụ nó | `/reports/storage/temporary-issues` | — | AC-03 | `count tbody :text-is("Xuất không bán") = 3; text=INV-202608-00018; text=INV-202608-00002` |

## Not verified here

- **AC-06 (chọn một trạng thái thì lưới lọc thật)** — ô lọc là `<select>` gốc, mà bộ bốn động từ
  của runner (`click` / `fill` / `wait` / `scroll`) không đặt được giá trị cho nó: Playwright
  `fill()` ném lỗi trên `<select>`, cần `selectOption`. Không bịa một bước đi vòng chỉ để có ảnh.
  Phần này được khoá ở tầng dữ liệu bởi
  `temp-warehouse-out.report.spec.ts` — `filters by the new "Bán hàng kho tạm" status and totals
  only those rows`, assert cả `rows` lẫn `totals` sau khi lọc.
- **AC-08 (Excel / bản in khớp lưới)** — bấm "Xuất khẩu" sinh một file tải về; runner không cấu
  hình `acceptDownloads` nên ảnh chụp không nói được gì về **nội dung** file, mà nội dung mới là
  thứ cần chứng minh. Thay bằng kiểm chứng trực tiếp ngoài trình duyệt — xem mục dưới.
  Ở tầng dữ liệu, `temp-warehouse-out.report.spec.ts` khoá tính chất khiến chúng không thể lệch:
  đường export (`limit = EXPORT_ROW_LIMIT`) và đường lưới (`limit` nhỏ) trả **cùng** `totals` và
  cùng `total` trên cùng bộ lọc.
- **AC-07 (danh sách trạng thái khai báo một lần)** là tính chất của mã nguồn, không có bề mặt UI.
  Kiểm bằng `grep`: không còn mảng trạng thái hard-code nào trong `apps/backoffice-web`.

## Kiểm chứng ngoài trình duyệt — nội dung file Excel

Ảnh chụp không nói được gì về **nội dung** file tải về, nên AC-08 được kiểm bằng cách gọi thẳng
endpoint rồi giải nén XLSX ra đọc. Cùng chi nhánh HCM, cùng kỳ 08/2026, cùng bộ cột với lưới:

```bash
POST /reports/inventory/export
  reportType = inventory-temp-warehouse-out
  X-Branch-Id: 69982b87-…            # HCM
→ 200, Content-Type: …spreadsheetml.sheet, 7.438 bytes
unzip → xl/worksheets/sheet1.xml
```

| Kiểm | Trong file Excel | Lưới / SQL |
| --- | ---: | ---: |
| Ô `Bán hàng kho tạm` | **4** | 4 |
| Ô `Bán hàng trưng bày` | **0** | 0 |
| Ô `Xuất không bán` | **3** | 3 |
| Số hóa đơn | `INV-202608-00002`, `INV-202608-00018` | y hệt |
| Dòng tổng (SL xuất / trả / bán / tồn) | **7 / 0 / 4 / 3** | 7 / 0 / 4 / 3 |
| Tiêu đề | `HÀNG HÓA XUẤT KHO TẠM` | — |

Ba con số của dòng tổng trong file trùng đúng ô `tfoot` mà bước S2 chụp, nên Excel và lưới không
chỉ "cùng nguồn theo thiết kế" mà đã được đối chiếu từng giá trị.

## Notes

**Vì sao assert dùng `count` chứ không phải `text=`.** Vòng chạy đầu, S1 và S4 đỏ với
`text=Bán hàng kho tạm` / `text=Xuất không bán` — nhưng lưới hoàn toàn đúng. Nguyên nhân nằm ở
runner: `getByText(...).first()` bắt trúng `<option>` cùng chữ nằm trong `<select>` lọc, mà option
của một select đang đóng thì không "visible", nên `waitFor` hết giờ. Assert sai, không phải app sai.

Dạng `count ... :text-is(...)` vừa tránh được cái bẫy đó vừa mạnh hơn: nó ghim **đúng số dòng**
(4 và 3) khớp SQL, thay vì chỉ hỏi "chữ này có xuất hiện đâu đó không". Cũng vì lý do đó mà claim
"nhãn cũ đã biến mất" dùng `count ... = 0` chứ không dùng `no-text=`: `no-text` chỉ thấy phần tử
visible, nên một `<option>` còn sót trong select đóng sẽ lọt qua nó.

**Và vì sao là `tbody :text-is(...)` chứ không phải `tbody td:text-is(...)`.** Vòng hai vẫn đỏ, lần
này `got 0`. `:text-is()` của Playwright khớp **phần tử nhỏ nhất** chứa chuỗi: ô Trạng thái bọc chữ
trong một `<span>` badge, nên `td` không còn là phần tử nhỏ nhất và không khớp. Ô ở `tfoot` là text
trần nên `tfoot td:text-is(...)` vẫn đúng — đó là lý do S2 xanh ngay từ đầu trong khi S1/S4 đỏ, và
là manh mối chỉ ra vấn đề nằm ở selector chứ không ở dữ liệu.

Trang này không có mục trên thanh điều hướng (`navConfig.ts:365` đang comment), nên phải vào bằng
URL trực tiếp — đúng cách runner làm.

Ba bước S1/S2/S4 dùng chung một đường dẫn và không có tương tác nào làm đổi trạng thái trang, nên
chúng chụp cùng một màn hình ở ba góc khẳng định khác nhau. Cố ý: mỗi bước khoá một AC riêng, và
một bước đỏ chỉ ra đúng tính chất nào hỏng thay vì "trang này sai ở đâu đó".
