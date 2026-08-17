---
feature: temp-warehouse-sale-status
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Tách hai luồng bán trên báo cáo "Hàng hóa xuất kho tạm"

Chạy bằng `admin@erp.local`, chi nhánh **HCM** (`LOCAL_BACKOFFICE_BRANCH_NAME`) — toàn bộ 7 dòng
`temp_warehouse_lines` của `erp_dev` đều thuộc chi nhánh này. Kỳ mặc định của trang là "Tháng này",
tức 08/2026.

Con số trong cột `Assert` là **sự thật lấy từ SQL**, chạy bằng đúng chuỗi truy vấn mà
`TempWarehouseReportService` sinh ra (bắt qua một spec tạm, thay `$1..$6` bằng literal), **không
phải** con số đọc trên UI rồi chép lại:

```sql
-- org f1000000-…-0001, branch HCM 69982b87-…, kỳ [2026-08-01, 2026-09-01)
SELECT status, COUNT(*) AS n, SUM(out_qty), SUM(sale_qty), SUM(remaining_qty)
FROM enriched GROUP BY status;
--  Bán hàng trưng bày | 69 | 0 | 74 | 0
--  Bán hàng kho tạm   |  4 | 4 |  4 | 0
--  Xuất không bán     |  3 | 3 |  0 | 3
--  Chuyển kho xuất đi |  1 | 1 |  0 | 0   ← seed cho UOW-04
--  Chuyển kho trả lại |  1 | 0 |  0 |-1   ← seed cho UOW-04
--  Trả hàng trưng bày |  1 | 0 |  0 |-1   ← seed cho UOW-04
--  (rỗng)             |  1 | 1 |  0 | 0   ← seed cho UOW-04
--  → tổng: 80 dòng, SL xuất 9, SL trả 3, SL bán 78, SL tồn 1
```

Điểm mấu chốt: **hai luồng bán có hai nhãn riêng**. `Bán hàng kho tạm` là hàng lấy từ kho, scan vào
kho tạm rồi bán (nguồn `temp_warehouse_lines`); `Bán hàng trưng bày` là hàng đã trưng sẵn ở showroom
bán ra (nguồn `invoice_items`, phần dư sau khi trừ những gì kho tạm đã nhận). Trước tính năng này
mọi dòng bán đều đọc `Bán hàng trưng bày`, kể cả loại đầu.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Lưới HCM 08/2026 trang 1: cả hai nhãn bán cùng có mặt, và ba nhãn kho tạm còn lại cũng có | `/reports/storage/temporary-issues` | — | AC-01, AC-02, AC-09 | `count tbody :text-is("Chuyển kho xuất đi") = 2; count tbody :text-is("Chuyển kho trả lại") = 1; count tbody :text-is("Trả hàng trưng bày") = 1` |
| S2 | Dòng tổng ở footer bằng đúng tổng SQL của **toàn tập** (80 dòng), không phải của 20 dòng đang xem: SL xuất 9, SL trả 3, SL bán 78, SL tồn −1 | `/reports/storage/temporary-issues` | `scroll tfoot` | AC-04 | `count tfoot td:text-is("9") = 1; count tfoot td:text-is("3") = 1; count tfoot td:text-is("78") = 1; count tfoot td:text-is("-1") = 1` |
| S3 | Dropdown lọc "Trạng thái": đúng 7 mục (6 giá trị backend phát ra + "— Tất cả —"), có **cả hai** nhãn bán | `/reports/storage/temporary-issues` | `scroll select[aria-label="Lọc Trạng thái"]` | AC-02, AC-05 | `count select[aria-label="Lọc Trạng thái"] option = 7; count select[aria-label="Lọc Trạng thái"] option:text-is("Bán hàng kho tạm") = 1; count select[aria-label="Lọc Trạng thái"] option:text-is("Bán hàng trưng bày") = 1` |
| S4 | Dòng bán trưng bày không bịa số liệu kho tạm: SL xuất/trả/tồn = 0, chỉ SL bán có số, và mang đúng số hóa đơn | `/reports/storage/temporary-issues` | — | AC-02, AC-03 | `text=INV-202608-00018` |

### Bốn trạng thái kho tạm còn lại (cần seed trước)

Bốn bước dưới đây cần bốn mặt hàng `VERIFY-TW-A..D` đã được seed vào chi nhánh HCM, mỗi mặt hàng
ứng một thao tác trên màn **Chuyển kho tạm** của POS:

| SKU | Thao tác POS tương ứng | Trạng thái kỳ vọng |
| --- | --- | --- |
| `VERIFY-TW-A` | Xuất đi + Trả lại, cùng mặt hàng, cùng người vận chuyển | *(rỗng — cặp cân bằng)* |
| `VERIFY-TW-B` | Xuất đi → tick → **Xử lý chuyển kho** | `Chuyển kho xuất đi` |
| `VERIFY-TW-C` | Trả lại → tick → **Xử lý chuyển kho** | `Chuyển kho trả lại` |
| `VERIFY-TW-D` | Trả lại, không có lần xuất khớp | `Trả hàng trưng bày` |

**Trạng thái nào đến từ luồng thật, trạng thái nào được seed thẳng.** Bảng trên mô tả *ý nghĩa*
nghiệp vụ, không phải là bảng đã-chạy-qua-UI. Cụ thể:

| SKU | Cách dựng |
| --- | --- |
| `VERIFY-TW-A`, `VERIFY-TW-D` | Gọi thật `POST /lines` — đúng endpoint nút "Thêm" gọi |
| `VERIFY-TW-B`, `VERIFY-TW-C` | Gọi thật `POST /.../transfer-lines` (nút "Xử lý chuyển kho"); lần gọi đó rơi vào DLQ nên trạng thái đích được ghi thẳng vào DB đúng như `markLinesTransferred` ghi |

**Đính chính (2026-08-17).** Ghi chú trước ở đây kết luận `Chuyển kho xuất đi` / `Chuyển kho trả lại`
"không tạo được qua sản phẩm". **Sai.** Sau đó đường chuyển kho chạy thành công trên chính `erp_dev`
này: ba phiếu POSTED lúc 12:17 và 12:21, và hai dòng `ABA2777-D-38/39` nhận `transfer_id` qua đường
thật rồi đọc `Chuyển kho xuất đi` trên báo cáo. Lỗi DLQ mà tôi gặp gắn với phiên/vị trí cụ thể lúc
đó, không phải với cả luồng. Task đã mở vẫn còn giá trị (thông báo lỗi không khớp dữ liệu), nhưng
đừng đọc nó thành "nút này hỏng".

Không điều khiển UI POS vì runner chạy **mọi bước trên mọi environment** — environment khai ở cấp
tài liệu (`verify.py:579`) và áp cho mọi bước, `--env` chỉ thu hẹp danh sách lúc chạy; không có cột
env cho từng bước và không có tài liệu thứ hai. Sự thật SQL sau khi seed, chạy bằng
đúng chuỗi truy vấn service sinh ra:

```
 sku         | status             | sl_xuat | sl_tra | sl_ban | sl_ton
-------------+--------------------+---------+--------+--------+--------
 VERIFY-TW-A |                    |       1 |      1 |      0 |      0
 VERIFY-TW-B | Chuyển kho xuất đi |       1 |      0 |      0 |      0
 VERIFY-TW-C | Chuyển kho trả lại |       0 |      1 |      0 |     -1
 VERIFY-TW-D | Trả hàng trưng bày |       0 |      1 |      0 |     -1
```

Lọc theo tiền tố SKU nên số liệu **không trôi** dù `erp_dev` có thêm dữ liệu khác về sau — đây là
lý do dùng mặt hàng riêng thay vì assert theo tổng số dòng.

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S5 | Lọc SKU `VERIFY-TW-`: đúng 4 dòng, ba nhãn kho tạm còn lại cùng có mặt (dòng thứ tư là cặp cân bằng, không mang nhãn nào) | `/reports/storage/temporary-issues` | `fill input[placeholder="Giá trị..."] = VERIFY-TW-` | AC-09 | `text=Hiển thị 1 - 4 trên 4 kết quả; count tbody :text-is("Chuyển kho xuất đi") = 1; count tbody :text-is("Chuyển kho trả lại") = 1; count tbody :text-is("Trả hàng trưng bày") = 1` |
| S6 | Dòng đã "Xử lý chuyển kho" hết treo ở kho tạm: SL tồn = 0 chứ không phải 1 — phiếu đã post nên hàng đã hạch toán xong | `/reports/storage/temporary-issues` | `fill input[placeholder="Giá trị..."] = VERIFY-TW-B` | AC-10 | `count tbody tr td:nth-child(11):text-is("0") = 1; count tbody :text-is("Chuyển kho xuất đi") = 1` |
| S7 | Trả lẻ: SL xuất = 0 và SL tồn = −1, bù cho lần xuất nằm ngoài kỳ | `/reports/storage/temporary-issues` | `fill input[placeholder="Giá trị..."] = VERIFY-TW-D` | AC-09 | `count tbody tr td:nth-child(8):text-is("0") = 1; count tbody tr td:nth-child(11):text-is("-1") = 1` |
| S8 | Cặp cân bằng: xuất rồi trả cùng người vận chuyển gộp thành **một** dòng, cột Trạng thái để rỗng | `/reports/storage/temporary-issues` | `fill input[placeholder="Giá trị..."] = VERIFY-TW-A` | AC-09 | `text=Hiển thị 1 - 1 trên 1 kết quả; count tbody tr td:nth-child(8):text-is("1") = 1; count tbody tr td:nth-child(9):text-is("1") = 1; count tbody :text-is("Xuất không bán") = 0` |

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
- **AC-11 (đóng kho tạm không đổi báo cáo)** — không dựng được bằng bước trình duyệt ở đây: đóng
  kho tạm là thao tác bên POS, mà runner chạy **mọi bước trên mọi environment** (không có cột env
  cho từng bước), nên không trộn được bước POS với bước backoffice trong cùng file này. Khoá ở tầng
  dữ liệu bằng e2e `dòng AUTO_BALANCED do đóng kho tạm sinh ra không vào báo cáo`.
- **AC-12 (ghép cặp khoá theo người vận chuyển)** — cần hai người vận chuyển khác nhau, dựng bằng
  UI thì dài mà không thấy được gì thêm so với e2e `xuất và trả khác người vận chuyển thì không
  ghép cặp`.

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

> ⚠ **Bảng đối chiếu dưới đây là của bản MỘT NGUỒN đã ship ở `#184`, chưa chạy lại sau ADR-06.**
> Số kỳ vọng mới: 4 ô `Bán hàng kho tạm`, 69 ô `Bán hàng trưng bày`, 3 ô `Xuất không bán`, dòng
> tổng `7 / 0 / 78 / 3`. Phải chạy lại trước khi coi AC-08 là đã có bằng chứng.

| Kiểm | Trong file Excel (bản `#184`) | Lưới / SQL (bản `#184`) |
| --- | ---: | ---: |
| Ô `Bán hàng kho tạm` | **4** | 4 |
| Ô `Bán hàng trưng bày` | **0** | 0 |
| Ô `Xuất không bán` | **3** | 3 |
| Số hóa đơn | `INV-202608-00002`, `INV-202608-00018` | y hệt |
| Dòng tổng (SL xuất / trả / bán / tồn) | **7 / 0 / 4 / 3** | 7 / 0 / 4 / 3 |
| Tiêu đề | `HÀNG HÓA XUẤT KHO TẠM` | — |

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

**S1 và S2 đã phải chỉnh lại số ba lần** (2026-08-16, và hai lần ngày 17-08) vì `erp_dev` là môi
trường đang có người dùng — mỗi lần ai đó bấm POS là số đổi. Lệnh lấy lại sự thật, chạy trước mỗi
lượt verify:

```bash
# bắt SQL service sinh ra qua một spec tạm, thay $1..$6 bằng literal, rồi:
SELECT status, COUNT(*) FROM enriched GROUP BY status;                       -- cho S1
SELECT COUNT(*), SUM(out_qty), SUM(return_qty), SUM(sale_qty), SUM(remaining_qty) FROM enriched;  -- cho S2
```

Nếu nhịp này thành gánh nặng thì bỏ hẳn S1/S2 khỏi bộ bước: tính chất của chúng đã được khoá ở
tầng dữ liệu (`totals không đổi theo kích thước trang` cho S2), và sáu bước còn lại đều không trôi.

**S2 còn gắn với bộ dữ liệu `erp_dev`.** (S1 đã gỡ literal tổng ở vòng review — bảy assert `count`
mang đúng ý nghĩa của nó và không trôi.) Chúng khẳng định tính chất
"footer mô tả toàn tập chứ không phải trang đang xem", mà tính chất đó chỉ kiểm được khi có nhiều
trang — nên buộc phải dùng con số thật. Thêm dữ liệu vào `erp_dev` là phải chạy lại truy vấn SQL
và cập nhật bước này. Bốn bước S5–S8 thì **không trôi**: chúng lọc theo tiền tố SKU
`VERIFY-TW-` nên chỉ nhìn thấy dữ liệu seed của chính mình.

Cách gỡ nốt phần trôi của S2, nếu ai đó thấy đáng: seed ~25 dòng dưới một tiền tố SKU riêng rồi
assert footer của **tập đó**. Tính chất "footer mô tả toàn tập chứ không phải trang" cần một tập
lớn hơn một trang (20 dòng), mà 4 dòng của S5–S8 thì không đủ. Chưa làm vì tính chất này đã được
khoá ở tầng dữ liệu bởi e2e `totals không đổi theo kích thước trang`.

Ba bước S1/S2/S4 dùng chung một đường dẫn và không có tương tác nào làm đổi trạng thái trang, nên
chúng chụp cùng một màn hình ở ba góc khẳng định khác nhau. Cố ý: mỗi bước khoá một AC riêng, và
một bước đỏ chỉ ra đúng tính chất nào hỏng thay vì "trang này sai ở đâu đó".
