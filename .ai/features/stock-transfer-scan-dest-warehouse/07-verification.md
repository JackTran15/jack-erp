---
feature: stock-transfer-scan-dest-warehouse
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Phiếu chuyển kho: quét mã vạch kế thừa kho nhập

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Quét mã vạch trên phiếu mới đã "Chọn kho": dòng thêm ra có đủ Kho nhập và Vị trí nhập | `/inventory/stock-transfers` | `click button:has-text("Thêm mới"); wait text=Thêm mới phiếu chuyển kho; click button[aria-label="Phóng to"]; click button:has-text("Chọn kho"); fill #transfer-source-select = Kho Lưu trữ HCM; click [role="option"]:has-text("Kho Lưu trữ HCM"); fill #transfer-dest-select = HCM - Showroom; click [role="option"]:has-text("HCM - Showroom"); click button:has-text("Đồng ý"); click label:has-text("Quét mã vạch") input[type="checkbox"]; fill input[aria-label="Mã vạch / SKU"] = ABA2777-D-38; wait text=ABA2777-D-38; wait input[value="DEFAULT · Mặc định"]; scroll input[value="DEFAULT · Mặc định"]` | AC-01 | count input[value="Kho Lưu trữ HCM"] = 2; count input[value="HCM - Showroom"] = 2; count input[value="A10 · A10"] = 1; count input[value="DEFAULT · Mặc định"] = 1 |
| S2 | Nhập mã trong bảng (đường đối chứng): cùng phiếu, cùng lựa chọn kho, ra đúng cùng 4 giá trị | `/inventory/stock-transfers` | `click button:has-text("Thêm mới"); wait text=Thêm mới phiếu chuyển kho; click button[aria-label="Phóng to"]; click button:has-text("Chọn kho"); fill #transfer-source-select = Kho Lưu trữ HCM; click [role="option"]:has-text("Kho Lưu trữ HCM"); fill #transfer-dest-select = HCM - Showroom; click [role="option"]:has-text("HCM - Showroom"); click button:has-text("Đồng ý"); fill input[placeholder="Tìm mã/tên"] = ABA2777-D-38; click [role="option"]:has-text("ABA2777-D-38"); wait text=ABA2777-D-38; wait input[value="DEFAULT · Mặc định"]; scroll input[value="DEFAULT · Mặc định"]` | AC-02 | count input[value="Kho Lưu trữ HCM"] = 2; count input[value="HCM - Showroom"] = 2; count input[value="A10 · A10"] = 1; count input[value="DEFAULT · Mặc định"] = 1 |

## Not verified here

- **Cộng dồn số lượng khi quét trùng mã liên tiếp** (phần thứ hai của bản sửa: `handleScanResolved`
  đọc `linesRef.current` thay vì `lines`) — lỗi chỉ nổ khi hai lần quét rơi vào cùng một chu kỳ
  render, tức nhanh hơn một round-trip `lookup`. `runActions` chờ `networkidle` sau mỗi hành động
  nên không tái hiện được cửa sổ đó bằng bốn động từ của bộ runner; cần một máy quét thật hoặc một
  test component bơm hai lần `onResolved` trong cùng một tick.
- **Lưu phiếu và hậu kiểm trên server** — bản sửa nằm hoàn toàn ở form state phía client; hai bước
  trên đã chứng minh đúng thứ thay đổi. Thêm bước lưu sẽ ghi dữ liệu vào `erp_dev` mỗi lần chạy
  verify, đổi lại không chứng minh thêm gì.

## Notes

Dữ liệu cố định của môi trường local (`erp_dev`, chi nhánh HCM) — nếu seed đổi thì bốn assertion
phải đổi theo:

- `ABA2777-D-38` được theo dõi ở cả hai kho: `Kho Lưu trữ HCM` / kệ `A10`, và `HCM - Showroom` /
  kệ `DEFAULT` (`Mặc định`, là kệ mặc định của kho đó). Nhờ vậy `getPreferredShelf` trả kệ thật ở
  cả hai đầu, và Vị trí nhập không rơi vào nhánh fallback.
- `Kho Lưu trữ HCM` được chọn làm Kho xuất chứ không phải kho chính: `resolveItemSources` chạy với
  `deprioritizeMainStorage: true` nên nó cũng là kho mà mã này được rút ra — hai đường đồng ý với
  nhau, và assertion Kho xuất mới có nghĩa.

Assertion dùng `count input[value="…"]` chứ không phải `text=`: cả bốn ô Kho/Vị trí đều là
`LookupField`, tức `<input>` — `getByText` không đọc được giá trị của input. React DOM giữ
attribute `value` khớp với property trên các input controlled của app này (đã kiểm tra trực tiếp
trên `#login-org-id`), nên selector attribute là cách duy nhất đọc được đúng giá trị đang hiển thị.

Con số của bốn assertion không phải bốn số 1, và chính chỗ lệch đó mới là điều đang được khẳng định:

- `Kho Lưu trữ HCM` = 2 và `HCM - Showroom` = 2 — dòng có mã **và** dòng trắng kế tiếp đều mang hai
  kho. Dòng trắng đó là dòng người dùng gõ mã tay ở lượt sau, và `fillLineFromItem` chỉ ghi đè lên
  dòng sẵn có chứ không tự dựng kho nhập; nếu nó rỗng thì lỗi này quay lại ngay ở dòng kế tiếp. Cả
  hai đường phải để lại cùng một trạng thái, nên hai step dùng chung đúng một bộ assertion.
- `A10 · A10` = 1 và `DEFAULT · Mặc định` = 1 — vị trí chỉ tra được khi đã có mã, nên dòng trắng để
  trống là đúng.

Chuỗi Interaction dài hơn mức ba hành động mà templates khuyến nghị, và không tách được: mỗi step
tự `page.goto` lại từ đầu nên không step nào thừa hưởng state của step trước, trong khi cả "Chọn
kho" lẫn "Quét mã vạch" đều là điều kiện bắt buộc của đúng cái đang cần chứng minh.

Hai `wait` cuối chuỗi là chốt chặn chống ảnh chụp sớm, và thứ tự của chúng có chủ đích:
`wait text=ABA2777-D-38` hỏng khi lượt tra mã thất bại, `wait input[value="DEFAULT · Mặc định"]`
hỏng khi dòng đã hiện mà `fillTransferLocations` chưa điền được vị trí nhập — hai nguyên nhân khác
hẳn nhau, tách ra để đọc log là biết ngay hỏng ở đâu. `scroll` ở cuối kéo cột "Vị trí nhập" vào
khung nhìn: không có nó thì cả hai cột nhập nằm ngoài mép phải và ảnh không chứng minh được gì.
