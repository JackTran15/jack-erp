# Handover kiểm tra các issue Hàng hoá/Kho theo MISA

> Cập nhật: 11/06/2026
> Phạm vi: Hàng hoá, Nhập kho, Xuất kho, Kiểm kê kho
> Baseline audit: `tickets/audits/AUDIT-10062026-reported-inventory-issues-vs-misa.md`

## 1. Mục tiêu

Tài liệu này hướng dẫn kiểm tra các thay đổi hiện tại theo đúng thứ tự nghiệp vụ và xác nhận cả UI, API và dữ liệu kho.

Không đánh dấu issue là hoàn tất chỉ vì UI hiển thị đúng. Với thay đổi tồn kho, phải kiểm tra:

1. Request/response API.
2. `stock_ledger_entries`.
3. `stock_balances`.
4. Báo cáo Xuất nhập kho.
5. Dữ liệu sau khi refresh/mở lại chứng từ.

## 2. Trạng thái hiện tại

| Nhóm       | Issue                                               | Trạng thái bàn giao                                                            |
| ----------- | --------------------------------------------------- | --------------------------------------------------------------------------------- |
| Hàng hoá  | Giá mua/bán TB mapping xuống variant             | Implemented, cần verify UI + payload                                             |
| Hàng hoá  | Disable giá cha khi có variant                    | Implemented, cần verify                                                          |
| Hàng hoá  | Không tự sinh/lưu/hiển thị mã vạch           | Implemented, cần verify create + list                                            |
| Hàng hoá  | Đổi text `Mặt hàng kho` thành `Hàng hoá` | Implemented                                                                       |
| Hàng hoá  | Thương hiệu/ĐVT legacy không hiện             | Implemented bằng migration backfill                                              |
| Hàng hoá  | Tồn đầu kỳ của variant bị bỏ qua             | Implemented cho hàng tạo mới, dữ liệu cũ không tự khôi phục             |
| Nhập/Xuất | Danh sách chứng từ theo active branch            | Implemented, cần verify khi đổi branch                                         |
| Nhập/Xuất | Cho cùng SKU tồn ở nhiều vị trí cùng kho     | Implementation đã nới rule vị trí ưu tiên, cần regression test đầy đủ |
| Nhập/Xuất | Tên hàng hoá hiển thị SKU                      | Implemented, cần verify                                                          |
| Nhập/Xuất | Đổi hàng hoá phải remap đơn giá             | Implemented, cần verify                                                          |
| Nhập/Xuất | Sửa từ dialog chi tiết                           | Cần verify quyền/trạng thái; không mặc định pass                          |
| Nhập/Xuất | Cửa hàng nguồn loại cửa hàng hiện tại       | Cần verify                                                                       |
| Nhập/Xuất | Hoãn phải disabled theo KQMM                      | **Chưa align KQMM**: code hiện vẫn có flow Hoãn/cancel/reversal        |
| Nhập/Xuất | Xóa không còn trong report                       | Cần verify report cụ thể và audit trail                                       |
| Nhập       | Hoàn tất cập nhật chi tiết vị trí            | Implemented qua ledger/location mapping, cần verify DB + UI                      |
| Xuất       | Dialog xác nhận xuất quá tồn                   | Implemented, cần verify cancel/continue                                          |
| Kiểm kê   | Search SKU bằng input                              | Implemented, cần verify                                                          |
| Kiểm kê   | Format số lượng/giá trị                        | Implemented, cần verify locale và payload số                                   |
| Kiểm kê   | Theo sổ đúng kho/vị trí                        | Implemented, cần verify bằng dữ liệu khác nhau giữa A01/B01                 |
| Kiểm kê   | Checkbox width fit                                  | Implemented, cần verify hit-area                                                 |
| Kiểm kê   | Sửa vị trí dòng kiểm kê                       | Implemented cho phiếu nháp, cần verify persist                                 |
| Kiểm kê   | Export `.xlsx` rồi import lại                   | Implemented, cần verify với file export thật                                   |

## 3. Chuẩn bị môi trường và dữ liệu

### Chạy ứng dụng

```bash
pnpm install
pnpm migration:run
pnpm dev:api
pnpm dev:backoffice
```

Migration quan trọng:

- `1783900000000-BackfillInventoryMasterData.ts`: backfill `inventory_brands`, `inventory_units` và `items.brand_id`.

### Dữ liệu test bắt buộc

- Hai branch: `HN`, `HCM`.
- Kho `HN-01` thuộc HN, có vị trí `A01`, `B01`.
- Kho `HCM-01` thuộc HCM.
- Một hàng hoá thường.
- Một hàng hoá có ít nhất hai variant.
- Mỗi vị trí `A01`, `B01` có số tồn khác nhau cho cùng một variant.
- User có quyền tạo/sửa/xóa; nếu có thể, thêm user chỉ có quyền xem.

Ghi lại trước khi test:

- Active branch.
- Tồn tổng và tồn tại từng vị trí.
- Giá mua/giá bán của từng SKU.
- ID chứng từ được tạo.

## 4. Thứ tự kiểm tra đề xuất

Phải chạy theo thứ tự:

1. Hàng hoá và variant.
2. Nhập kho để tạo tồn ở nhiều vị trí.
3. Xuất kho từ các vị trí vừa nhập.
4. Kiểm kê trên đúng kho/vị trí.
5. Xóa/Hoãn và kiểm tra báo cáo.

Nếu bỏ qua bước 2 thì các case xuất quá tồn và kiểm kê theo vị trí không đủ dữ liệu để kết luận.

## 5. Flow 1: Hàng hoá

### 5.1 Nhãn trang

1. Mở `/admin/inventory-items`.
2. Mở trang thêm mới và sửa hàng hoá.

Kỳ vọng:

- Tiêu đề danh sách: `Hàng hoá`.
- Tiêu đề tạo mới: `Thêm mới Hàng hoá`.
- Không còn text `Mặt hàng kho`.

### 5.2 Variant pricing

1. Nhập Giá mua TB `100.000`, Giá bán TB `150.000`.
2. Tạo màu `Đen`, `Trắng`; size `38`, `39`.
3. Quan sát bảng variant.
4. Sửa giá riêng của một variant.
5. Xóa hết variant.

Kỳ vọng:

- Variant mới nhận `100.000` và `150.000`.
- Khi có variant, Giá mua/bán TB cấp cha bị disabled.
- Chỉ giá variant được sửa.
- Giá đã sửa của một variant không bị overwrite khi thêm variant khác.
- Khi xóa hết variant, field giá cha được enable lại.

### 5.3 Tồn kho đầu kỳ

#### Hàng hoá thường

1. Tạo SKU `QA-NORMAL-01`.
2. Nhập Tồn đầu kỳ `10`, Đơn giá đầu kỳ `50.000`.
3. Lưu và mở sửa lại.

Kỳ vọng: hiển thị lại `10` và `50.000`.

#### Hàng hoá có variant

1. Tạo SKU cha `QA-VARIANT`.
2. Tạo hai variant.
3. Nhập tồn từng variant lần lượt `2`, `3`.
4. Nhập Đơn giá đầu kỳ chung `50.000`.
5. Lưu và mở lại.

Kỳ vọng:

- Tồn chung bị disabled khi có variant và có hướng dẫn nhập tại từng variant.
- Ledger `INITIAL_STOCK` được tạo cho variant có tồn.
- Tổng tồn đầu kỳ khi mở lại là `5`.

Lưu ý: dữ liệu variant cũ từng bị bug không thể tự khôi phục vì DB không lưu giá trị đã nhập.

## 6. Flow 2: Nhập kho

### 6.1 Branch scope

1. Chọn branch HN, mở danh sách Nhập kho.
2. Ghi lại request search và danh sách kết quả.
3. Đổi branch HCM.

Kỳ vọng:

- Request có `X-Branch-Id`/`branchId` đúng active branch.
- Danh sách chứng từ, kho và vị trí reload theo branch mới.
- Không còn dữ liệu branch cũ.

### 6.2 Cùng SKU ở nhiều vị trí

1. Tạo phiếu nhập tại `HN-01`.
2. Thêm cùng một variant tại `A01` số lượng `5`.
3. Thêm lại variant đó tại `B01` số lượng `7`.
4. Hoàn tất phiếu.

Kỳ vọng:

- Không có warning bắt dùng vị trí đã cấu hình.
- Cả hai dòng được lưu.
- Chi tiết vị trí hiển thị A01 tăng `5`, B01 tăng `7`.

### 6.3 Tên và đơn giá

1. Chọn hàng hoá A.
2. Xác nhận cột Tên hàng hoá hiển thị tên, không phải SKU.
3. Ghi lại đơn giá được mapping.
4. Đổi dòng sang hàng hoá B.

Kỳ vọng:

- Tên hàng hoá B hiển thị đúng.
- Đơn giá remap theo B; không giữ giá của A.
- Thành tiền tính lại.

### 6.4 Sửa, cửa hàng nguồn và Hoãn

- Từ dialog chi tiết, nút Sửa phải chuyển sang edit nếu trạng thái/quyền cho phép; nếu không phải disabled.
- Cửa hàng nguồn phải loại active branch.
- **Hoãn hiện vẫn hoạt động theo cancel/reversal. Đây chưa đúng KQMM yêu cầu disabled; không report pass.**

### 6.5 Xóa và báo cáo

1. Tạo/hoàn tất một phiếu nhập riêng.
2. Ghi lại ID và xác nhận có trong report Xuất nhập kho.
3. Xóa/hủy phiếu theo flow hiện tại.
4. Reload report.

Kỳ vọng nghiệp vụ cần xác nhận:

- Document report không còn phiếu `CANCELLED`.
- Ledger gốc và reversal vẫn được giữ để audit.
- Tồn kho quay về đúng số trước phiếu.

Không hard-delete ledger chỉ để làm report biến mất.

## 7. Flow 3: Xuất kho

Lặp lại các case branch scope, nhiều vị trí, tên hàng hoá, remap đơn giá, sửa dialog, cửa hàng nguồn và Hoãn tương tự Nhập kho.

### 7.1 Xuất từ nhiều vị trí

1. Xuất cùng variant từ A01 và B01 trên hai dòng.
2. Hoàn tất.

Kỳ vọng: không warning vị trí ưu tiên; tồn từng vị trí giảm đúng.

### 7.2 Xuất quá tồn

1. Chọn số lượng bằng tồn: không hiện dialog.
2. Chọn số lượng lớn hơn tồn: hiện dialog xác nhận.
3. Kiểm tra các cột Tên hàng hoá, Số tồn, ĐVT, Kho xuất.
4. Chọn Hủy: không tạo/hoàn tất phiếu, tồn không đổi.
5. Chọn Tiếp tục: phiếu được xử lý theo rule cho phép âm kho.

## 8. Flow 4: Kiểm kê kho

### 8.1 Search và format số

1. Nhập toàn bộ hoặc một phần SKU vào input Mã SKU.
2. Chọn kết quả.
3. Nhập số lượng/giá trị kiểm kê lớn, ví dụ `1234567`.

Kỳ vọng:

- Input SKU cho phép gõ và search.
- Không trả hàng ngoài kho/branch hợp lệ.
- Số được format dễ đọc nhưng payload API vẫn là number đúng.

### 8.2 Theo sổ theo vị trí

1. Chọn variant có tồn khác nhau tại A01/B01.
2. Chọn A01 và ghi lại Số lượng/Giá trị theo sổ.
3. Đổi sang B01.

Kỳ vọng:

- Theo sổ cập nhật theo đúng vị trí.
- Chênh lệch được tính lại.
- Không giữ số liệu A01 sau khi chọn B01.

### 8.3 Checkbox và sửa vị trí

- Click vùng trống ngang dialog không được toggle `Kiểm kê theo giá trị`.
- Phiếu nháp cho phép đổi vị trí và persist sau lưu/refresh.
- Phiếu không được phép sửa phải khóa vị trí.

### 8.4 Export/import

1. Export `.xlsx` từ phiếu kiểm kê.
2. Nhập kết quả tại cột `Kiểm kê (*)` và `Nguyên nhân`.
3. Import lại chính file đó.
4. Review lỗi rồi commit.

Kỳ vọng:

- Không báo thiếu cột `Mã SKU`.
- Parser đọc được ô rich text `Mã SKU (*)`, `Kiểm kê (*)`.
- SKU/vị trí hợp lệ được cập nhật.
- SKU không tồn tại hoặc vị trí ngoài kho có lỗi rõ ràng.

File mẫu để regression: `docs/DanhSachHangHoaKiemKe.xlsx`.

## 9. DB checks cho tồn kho

Thay các ID tương ứng:

```sql
-- Ledger của chứng từ
SELECT reference_type, reference_id, item_id, location_id, movement_type,
       quantity, unit_cost, posted_at
FROM stock_ledger_entries
WHERE reference_id = '<document-id>'
ORDER BY posted_at;

-- Tồn theo vị trí
SELECT item_id, location_id, quantity
FROM stock_balances
WHERE item_id = '<item-id>'
ORDER BY location_id;

-- Tồn đầu kỳ
SELECT item_id, quantity, unit_cost, notes
FROM stock_ledger_entries
WHERE reference_type = 'INITIAL_STOCK'
  AND item_id = '<item-id>';
```

## 10. Test tự động cần chạy

```bash
pnpm --filter @erp/api test -- --runInBand src/modules/inventory/location
pnpm --filter @erp/api test -- --runInBand src/modules/inventory/csv
pnpm --filter @erp/api test -- --runInBand src/modules/inventory/stock-take
pnpm --filter @erp/api test -- --runInBand src/modules/inventory/goods-receipt
pnpm --filter @erp/api test -- --runInBand src/modules/inventory/goods-issue
pnpm --filter @erp/api build
pnpm --filter @erp/backoffice-web build
```

## 11. Cách report kết quả

Mỗi case cần ghi:

| Trường            | Nội dung                                       |
| ------------------- | ----------------------------------------------- |
| Case                | Tên flow/case                                  |
| Branch/Kho/Vị trí | Dữ liệu đã dùng                            |
| SKU/Document ID     | ID để truy vết                               |
| Kết quả UI        | Pass/Fail + ảnh                                |
| API                 | Endpoint + status + payload quan trọng         |
| DB                  | Ledger/balance trước và sau                  |
| Report              | Có/không xuất hiện sau refresh              |
| Kết luận          | Fixed / Regression / Business decision required |

Các mục không được report `Fixed` nếu chưa có quyết định:

- Hoãn phải disabled hay tiếp tục cancel/reversal.
- Semantics chính xác của Xóa đối với phiếu đã thực hiện.
- Report nào phải ẩn chứng từ và report nào phải giữ audit trail.
