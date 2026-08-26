---
feature: barcode-sku-sort
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Sắp xếp theo mã SKU trên màn "In tem mã"

Ba bước đều dựng cùng một tập dữ liệu: mở `Kho → Hàng hóa`, chọn tất cả dòng của trang đầu,
rồi bấm **In tem mã** để sang màn in tem với danh sách đã đổ sẵn. Trạng thái sắp xếp nằm trong
state của trang nên không sống qua điều hướng — mỗi bước phải dựng lại từ đầu, và đó cũng là lý
do ba bước dùng chung một `Path`.

Điểm khác nhau duy nhất giữa ba bước là số lần bấm vào header cột **Mã SKU**: 0 lần (thứ tự
gốc), 1 lần (A-Z), 2 lần (Z-A). Thứ tự dòng là thứ mà DSL assertion không phát biểu được —
`text=` chỉ nói "có trên màn", không nói "đứng trước". Vì vậy assertion ở đây chỉ khoá phần
khung (đúng màn, đúng số nút sắp xếp), còn bằng chứng về thứ tự nằm ở chính tấm ảnh: ba ảnh
S1/S2/S3 đặt cạnh nhau cho thấy cùng một tập hàng hóa được đảo thứ tự theo cột Mã SKU.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S0 | Nguồn dữ liệu: chọn tất cả 20 dòng trang đầu của Hàng hóa | `/admin/inventory-items` | `wait text=kết quả; click [aria-label="Chọn tất cả"]` | AC-01 | `text=Hàng hoá` |
| S1 | Bảng in tem chưa sắp xếp: icon trung tính, thứ tự y hệt trang nguồn | `/admin/inventory-items` | `wait text=kết quả; click [aria-label="Chọn tất cả"]; click text=In tem mã; wait text=Tổng số lượng tem` | AC-01 | `text=Tổng số lượng tem; count [aria-label="Sắp xếp theo Mã SKU"] = 1` |
| S2 | Bấm header Mã SKU một lần — sắp xếp A-Z, mũi tên lên | `/admin/inventory-items` | `wait text=kết quả; click [aria-label="Chọn tất cả"]; click text=In tem mã; wait text=Tổng số lượng tem; click [aria-label="Sắp xếp theo Mã SKU"]` | AC-01 | `text=Tổng số lượng tem` |
| S3 | Bấm header Mã SKU lần hai — đảo Z-A, mũi tên xuống | `/admin/inventory-items` | `wait text=kết quả; click [aria-label="Chọn tất cả"]; click text=In tem mã; wait text=Tổng số lượng tem; click [aria-label="Sắp xếp theo Mã SKU"]; click [aria-label="Sắp xếp theo Mã SKU"]` | AC-01 | `text=Tổng số lượng tem` |

## Đọc bằng chứng

Thứ tự dòng là thứ DSL assertion không phát biểu được (`text=` chỉ nói "có trên màn", không nói
"đứng trước"), nên bằng chứng nằm ở chính ba tấm ảnh:

- **S1 → S2**: trang nguồn trả về `AK1109-25` trước `AK111` (so sánh chuỗi thuần). Sau khi bấm
  header, `AK111` lên trước `AK1109-25` và `AK118066` xuống sau `AK1175131` — đúng như
  `Intl.Collator(numeric: true)` phải cho, và là chỗ phân biệt bản có sắp xếp với bản chỉ đổi icon.
- **S2 → S3**: cùng tập 20 dòng, thứ tự đảo ngược hoàn toàn, mũi tên đổi từ ↑ sang ↓.

## Notes

Đây là feature dir chỉ có phần verification — thay đổi được yêu cầu trực tiếp, không đi qua
G1–G3 của AI-DLC, nên không có `02-requirements.md`. `AC-01` ở cột Verifies là nhãn tự đặt cho
yêu cầu "bấm header cột Mã SKU để sắp xếp A-Z"; `verify.py` sẽ cảnh báo id này không có trong
`02-requirements.md` — cảnh báo đúng, không phải lỗi.
