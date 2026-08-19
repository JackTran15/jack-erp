---
feature: temp-warehouse-scan-add-line
blocking_open: 0         # count of blocking + pending; must be 0 to pass G1
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | Enter trong ô *Hàng hóa* phải **thêm dòng luôn** (bỏ nhịp "Enter để nhảy sang nút Thêm, Enter nữa mới thêm") | high | yes | Toàn bộ UOW-01; đổi hợp đồng `onSubmitQuery` của ô hàng hóa | confirmed | Chốt bởi Akenzy 2026-08-19, câu hỏi G0 #1 |
| A-02 | Khi mã quét không khớp tuyệt đối và rơi về tìm gần đúng, dropdown phải **tự highlight dòng đầu**, Enter chọn dòng đó | high | yes | UOW-01 + prop mới trên `PosSearchPopover` | confirmed | Akenzy 2026-08-19, câu hỏi G0 #2 |
| A-03 | Ô *Vị trí* **vẫn read-only**; sửa bằng cách xóa sạch vị trí cũ ngay khi đổi mặt hàng; vị trí trống **không chặn** việc Thêm dòng | high | yes | UOW-02; nếu sai thì phải mở khóa PosSelect + thêm luồng validate | confirmed | Akenzy 2026-08-19, câu hỏi G0 #3 |
| A-04 | Phạm vi = **cả 2 tab** Kho tạm (Xuất đi + Trả lại). Checkout / Đổi trả hàng **không được đổi hành vi** | high | yes | Phạm vi mọi UoW; quyết định opt-in prop ở component dùng chung (ADR-02) | confirmed | Akenzy 2026-08-19, câu hỏi G0 #4 |
| A-05 | Sau khi Thêm xong 1 dòng, **giữ nguyên Người vận chuyển** và trả focus về ô *Hàng hóa* | high | yes | UOW-03; hiện `resetToolbarAfterAdd(null)` xóa cả carrier rồi focus về ô carrier | confirmed | Akenzy 2026-08-19, vòng hỏi tiếp #1 |
| A-06 | Máy quét hoạt động như bàn phím: gõ hết chuỗi ký tự rồi gửi `Enter`, không phát sự kiện riêng và không dán cả chuỗi trong 1 event `input` | high | no | Nếu máy quét dán nguyên chuỗi trong 1 event thì debounce 150ms vẫn đúng, chỉ khác số lần `handleChange` — sửa vẫn hợp lệ | pending | Kiểm chứng ở G4 bằng máy quét thật |
| A-07 | Triệu chứng "không nhận vị trí" đến từ **nhịp dùng** kết quả `batchPreferredShelf`, chứ không phải API trả sai | medium | no | Nếu API cũng sai thì còn sót phần "trống" | **confirmed** | Truy `erp_dev` 2026-08-19: `item_storage_locations` chỉ phủ **29/20328** mặt hàng ở `Kho lưu trữ HCM` (32 ở showroom HCM, 29 ở HN, 0 ở CCC). Kệ trống là **trạng thái thường**, không phải lỗi API — nên xác suất "mặt hàng sau không có kệ, giữ lại kệ mặt hàng trước" rất cao, đúng như ảnh QA. Dữ liệu ủng hộ mạnh giả định này |
| A-08 | "Lâu lâu" = mã quét không khớp tuyệt đối với `code`/`barcode` trong `GET /catalog/lookup` | medium | no | Nếu do mạng/timeout thì cần retry, không phải highlight dòng đầu | **một phần bị bác** | Xem "Điều tra CSDL" bên dưới |

## Sự thật đã tra được (không phải giả định)

Ghi lại để không ai phải tra lại — mỗi dòng đều đọc thẳng từ repo ở G0.

| Điều | Bằng chứng |
|---|---|
| BE cho phép thêm dòng **không có vị trí** | `add-line.dto.ts`: `sourceLocationId` và `notes` đều `@IsOptional()` |
| Vị trí chỉ được gửi lên khi là UUID | `temp-warehouse-mappers.ts` → `isShelfUuid` gác `body.sourceLocationId` |
| `PosSelect` **cũng dựng trên** `PosSearchPopover` | `PosSelect.tsx` import `PosSearchPopover` → đổi mặc định của popover là đổi mọi dropdown POS |
| Người dùng khác của `PosSearchPopover` | Checkout: `ProductSearchInput`, `ProductCatalogHeader`, `CustomerInputRow`, `IssueMembershipCardDialog`; Kho tạm: 2 ô; `UiCatalog` demo |
| Checkout đã có tiền lệ "quét → tự thêm" | `use-checkout-barcode-auto-add` + `addProductByQuery` (thêm khi **đúng 1** kết quả lọc) — khác A-02 ở chỗ Checkout không highlight dòng đầu; chênh lệch này là chủ ý, xem ADR-03 |
| Checkout không dính lỗi dropdown treo | `addProductByItem` gọi `clearToolbarQuery()` → `value` rỗng → `showDropdown` false. Kho tạm ngược lại: ghi **tên hàng** vào ô nên popover vẫn mở với 0 kết quả |
| Màn này chưa có test nào | `find apps/pos-web/src -name "*.test.*"` không ra file nào cho fast-stock-transfer/PosSearchPopover |

## Quan sát ngoài phạm vi

Ghi lại, **không** sửa trong feature này:

- `handleAddRow` chạy `addLineMutation.mutate` rồi mới `resetToolbarAfterAdd` trong
  `onSuccess` — mỗi dòng phải chờ round-trip API. Với nhịp quét nhanh, thao tác thứ hai
  có thể tới trước khi dòng thứ nhất xong. Chưa có báo lỗi về việc này; nếu G4 lộ ra thì
  mở feature riêng.
- Cột *Vị trí* trong bảng đọc từ `notes` (`locationLabelForLine`) chứ không phải từ
  `sourceLocation` — hai nguồn có thể lệch nhau nếu một trong hai được ghi mà cái kia không.

## Điều tra CSDL `erp_dev` — 2026-08-19

Truy thẳng Postgres (`localhost:5433/erp_dev`) thay vì chờ G4. Kết quả đổi hai dòng
trong bảng trên:

**A-07 → confirmed.** Kệ ưu tiên gần như không có dữ liệu:

| Kho | Số mặt hàng có kệ ưu tiên |
|---|---|
| Hồ Chí Minh - Showroom | 32 |
| Kho lưu trữ HCM | 29 |
| Kho lưu trữ HN | 29 |
| CCC - Showroom | 0 |

Trên tổng **20.328** mặt hàng. Nghĩa là `batchPreferredShelf` trả rỗng cho gần như mọi
mặt hàng — ô *Vị trí* trống là trạng thái **thường**. Đúng vì thế mà lỗi giữ-kệ-cũ mới hay
lộ: quét mặt hàng có kệ rồi quét mặt hàng không có kệ, ô vẫn treo kệ của cái trước.
Đây là **lý do UOW-03 quan trọng hơn hai UoW kia**, không phải ít hơn.

**A-08 → bị bác một phần.** Giả định gốc là "mặt hàng chưa gán mã vạch". Sai:

- `20328/20328` mặt hàng **đều có** bản ghi `item_barcodes`.
- `UQ_item_barcodes_org_code` bảo đảm mã vạch **duy nhất theo tổ chức** → `lookupByCode`
  không thể trả 2 dòng vì trùng mã vạch.
- 0 trường hợp một chuỗi vừa là `items.code` vừa là `item_barcodes.code` của mặt hàng khác.
- 0 mã vạch dính khoảng trắng thừa.

Nhưng phần cốt lõi của A-08 **vẫn đứng và không cần dữ liệu để chứng minh**: khung
"Không có kết quả." trong ảnh QA không đến từ CSDL rỗng, mà từ chính rào khử trùng
`claimRef` — lượt search thứ hai với cùng một mã trả `[]` **bằng code**, không phải vì
tra không ra. Đọc thẳng `productHybridAdapter` là thấy. ADR-03 gỡ đúng chỗ đó.

Còn lại chưa giải thích được bằng dữ liệu dev: vì sao trên **production** (chi nhánh Huế)
lookup trượt "lâu lâu". `erp_dev` không có chi nhánh Huế nên không kiểm được ở đây. Ba khả
năng còn mở: dữ liệu mã vạch của tổ chức production khác, `is_pos_visible = false`
(dev có **379** mặt hàng bị ẩn khỏi POS — cả `lookup` lẫn tìm gần đúng đều lọc cờ này nên
mặt hàng ẩn sẽ ra "Không có kết quả." thật), hoặc máy quét thêm ký tự. **Không chặn feature
này**: bản sửa làm cho mọi nhánh đều thoát được bằng bàn phím, kể cả khi lookup trượt.

### Fixture cho Demo script (chi nhánh Hồ Chí Minh, `erp_dev`)

| Vai trò | Mã / mã vạch | Kệ ở `Kho lưu trữ HCM` |
|---|---|---|
| Mặt hàng **có** kệ ưu tiên | `ABA2777-D-39` … `ABA2777-D-42` | `A01.01` |
| Mặt hàng **không** có kệ ưu tiên | `ABA2813-BO-38` … `ABA2813-BO-42` | — |

Quét xen kẽ hai nhóm này là tái hiện đúng lỗi trong ảnh QA: nhóm thứ hai từng hiện `A01.01`
của nhóm thứ nhất.
