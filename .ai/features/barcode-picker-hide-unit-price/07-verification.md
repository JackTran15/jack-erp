---
feature: barcode-picker-hide-unit-price
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Bỏ cột "Đơn giá" khi chọn hàng hoá để in tem

Dialog "Chọn hàng hóa" (`ProductSelectDialog`) là component dùng chung. Trước thay đổi, cờ
`showQuantityPrice` bật **cả hai** cột nhập: Số lượng và Đơn giá. Thay đổi tách cờ đó bằng
`showUnitPrice` (mặc định `true`), và chỉ luồng in tem truyền `showUnitPrice={false}`.

Vì vậy bằng chứng phải nói hai điều, không phải một: cột Đơn giá **biến mất ở màn in tem**, và
**còn nguyên ở nơi khác**. Một lượt chạy chỉ chứng minh vế đầu thì không phân biệt được "ẩn đúng
chỗ" với "xoá cột của mọi người" — nên S5 là phần bắt buộc của lượt này, không phải phần thêm.

Bốn bước S1–S4 đều dựng lại từ đầu: dialog là state cục bộ của trang, không sống qua điều hướng.
Nút kính lúp `button[aria-label="Tìm kiếm"]` là của `LookupField`
(`components/forms/LookupField.tsx:570`); trên màn in tem trống chỉ có đúng một cái, vì ô Kho và
Vị trí dùng `hideSearchButton` và chỉ render khi dòng đã có hàng hoá.

Ở S5 thì nút kính lúp lại **không** được để trần: form Xuất kho có nhiều `LookupField`, và cái
đầu tiên trong DOM là ô "Lý do xuất kho" — lần chạy đầu bấm đúng vào đó và mở nhầm modal "Chọn lý
do xuất kho". Phải neo theo placeholder của ô Mã SKU:
`div:has(input[placeholder="Tìm mã hoặc tên"]) > button[aria-label="Tìm kiếm"]` — `> button` giới
hạn đúng vào wrapper của `LookupField`, vì chỉ nó mới có nút đó là con trực tiếp.

Assertion đếm cột phải **giới hạn trong bảng của dialog** — `table:has(th:text-is("Giá mua TB"))`,
vì "Giá mua TB" là cột chỉ dialog này có. Lần chạy đầu dùng `th:has-text("Số lượng")` trần đã đếm
ra 2: `has-text` là so khớp chuỗi con, nên nó vớ luôn cột "Số lượng tem" của bảng in tem nằm sau
modal. Tương tự ở màn Xuất kho, lưới chứng từ có sẵn một cột "Đơn giá" của riêng nó. Đếm không
giới hạn phạm vi ở đây không phải chặt hơn — nó đo nhầm bảng.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Dialog "Chọn hàng hóa" mở từ màn in tem: header còn "Số lượng", không còn "Đơn giá" | `/admin/inventory-item-barcodes` | `click button[aria-label="Tìm kiếm"]; wait button:text-is("Chọn")` | AC-01 | `count table:has(th:text-is("Giá mua TB")) th:text-is("Số lượng") = 1; count table:has(th:text-is("Giá mua TB")) th:text-is("Đơn giá") = 0` |
| S2 | Chọn tất cả rồi mở rộng một nhóm: dòng hàng hoá chỉ có ô nhập số lượng, không ô nhập đơn giá | `/admin/inventory-item-barcodes` | `click button[aria-label="Tìm kiếm"]; wait button:text-is("Chọn"); click input[aria-label="Chọn tất cả trên trang"]; click button[aria-label="Mở rộng"]` | AC-01 | `count input[aria-label^="Đơn giá"] = 0; count table:has(th:text-is("Giá mua TB")) th:text-is("Số lượng") = 1` |
| S3 | "Nhập nhanh" chỉ còn ô Số lượng | `/admin/inventory-item-barcodes` | `click button[aria-label="Tìm kiếm"]; click input[aria-label="Chọn tất cả trên trang"]; click button:has-text("Nhập nhanh")` | AC-01 | `text=Nhập nhanh cho tất cả hàng hoá; no-text=Đơn giá` |
| S4 | Xác nhận xong: bảng in tem đổ dòng, cột "Giá bán" có số tiền — giá vẫn lên tem | `/admin/inventory-item-barcodes` | `click button[aria-label="Tìm kiếm"]; wait button:text-is("Chọn"); click input[aria-label="Chọn tất cả ABA2777"]; click button:text-is("Chọn"); wait text=ABA2777-D-38` | AC-02 | `no-text=Giá mua TB; text=Tổng số lượng tem; text=750.000` |
| S5 | Regression: picker của Xuất kho **vẫn còn** cột Đơn giá | `/inventory/goods-issues` | `click button:has-text("Thêm mới"); wait input[placeholder="Tìm mã hoặc tên"]; click div:has(input[placeholder="Tìm mã hoặc tên"]) > button[aria-label="Tìm kiếm"]` | AC-03 | `count table:has(th:text-is("Giá mua TB")) th:text-is("Đơn giá") = 1` |

## Đọc bằng chứng

- **S1 vs S5** là cặp đối chứng, và là toàn bộ lý do lượt chạy này có nghĩa: cùng một component,
  cùng một cờ `showQuantityPrice`, khác nhau ở `showUnitPrice`. S1 đếm 0 cột Đơn giá, S5 đếm 1.
  Nếu ai đó xoá thẳng cột thay vì thêm prop, S1 vẫn xanh còn S5 đỏ.
- **S2** đếm ở mức ô nhập chứ không chỉ header: `input[aria-label^="Đơn giá"]` là `MoneyInput`
  trong `QtyPriceCells`, chỉ render khi **dòng hàng hoá** được chọn. Bước này phải **mở rộng một
  nhóm** thì mới có dòng để đếm: 20 dòng đầu của danh mục đều là nhóm mẫu mã, và ở mức nhóm thì ô
  Số lượng/Đơn giá được thay bằng link "Nhập nhanh". Lần chạy đầu không mở rộng nên đếm-0 là xanh
  rỗng — đúng con số, không chứng minh gì. Vế còn lại (ô Số lượng **vẫn còn**) là thứ assertion
  không phát biểu được vì số dòng phụ thuộc dữ liệu seed, nên đọc ở chính ảnh S2.
- **S4** khoá phần dễ hỏng nhất của thay đổi này: giá **vẫn** lên tem. Cột "Giá bán" trên bảng in
  tem đọc `row.sellingPrice`, cùng trường mà `render-barcode-labels-pdf.ts:111` in ra dòng thứ ba
  của mỗi tem. Có số ở cột đó nghĩa là tem in ra có giá.

  Ba assertion của S4 phải đọc cùng nhau, và thứ tự có chủ đích. `no-text=Giá mua TB` là chốt
  chặn: "Giá mua TB" là cột chỉ dialog mới có, nên nó vắng mặt đồng nghĩa dialog đã đóng thật.
  Lần chạy đầu chọn cả 20 nhóm (229 hàng hoá), dialog còn đang "Đang xử lý…" lúc chụp, mà bước
  vẫn xanh — vì `text=Tổng số lượng tem` bắt được footer nằm **sau** modal và `text=Giá bán` bắt
  nhầm "Giá bán TB" **trong** modal (`getByText` là so khớp chuỗi con). Đó là xanh rỗng đúng kiểu
  tệ nhất: không hề chứng minh bảng đã nhận dòng nào. Nay bước này chỉ chọn một nhóm (ABA2777,
  14 hàng hoá) cho nhanh, và `text=750.000` là giá bán của nhóm đó hiện ở cột Giá bán của bảng in
  tem — số cụ thể, không phải nhãn cột. Bước này vì thế **ghim vào dữ liệu seed**: đổi seed thì
  đổi cả mã nhóm lẫn con số, đừng đổi assertion cho xanh.

  `wait text=ABA2777-D-38` ở cuối chuỗi thao tác cũng không phải cho đẹp: `no-text` chỉ chờ 3 giây
  để chữ *xuất hiện*, nên nếu chấm assertion lúc dialog còn đang resolve thì nó bắt được "Giá mua
  TB" và bước đỏ oan — ảnh chụp sau đó lại cho thấy dialog đã đóng, tức là đỏ và ảnh nói ngược
  nhau. Mã biến thể đầu tiên chỉ tồn tại trên bảng in tem (dialog ở bước này không mở rộng nhóm),
  nên chờ nó là chờ đúng thời điểm dữ liệu đã về.

## Not verified here

Nhập kho (`GoodsReceiptFormDialog`) và Chuyển kho (`StockTransferPage`) cũng truyền
`showQuantityPrice` và cũng phải giữ cột Đơn giá. Cả hai đi cùng một đường mã nguồn với Xuất kho
(`showUnitPrice` không truyền → mặc định `true`), nên S5 phủ chung; thêm hai bước nữa là chụp lại
cùng một nhánh code ba lần.

## Notes

Đây là feature dir chỉ có phần verification — thay đổi được yêu cầu trực tiếp, không đi qua G1–G3
của AI-DLC, giống tiền lệ `barcode-sku-sort`. `AC-01` / `AC-02` / `AC-03` là nhãn tự đặt, không có
trong `02-requirements.md`; `verify.py` sẽ cảnh báo — cảnh báo đúng, không phải lỗi.

- AC-01: bỏ cột Đơn giá ở bước chọn hàng hoá của luồng in tem, chỉ còn nhập số lượng.
- AC-02: giá bán vẫn hiển thị trên bảng in tem và vẫn được in lên tem.
- AC-03: các luồng chứng từ khác giữ nguyên cột Đơn giá.
