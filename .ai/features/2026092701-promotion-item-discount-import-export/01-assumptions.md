---
feature: promotion-item-discount-import-export
blocking_open: 0
---

# Assumption register

Hỏi một vòng (4 câu) trong phiên 2026-09-27. A-01..A-04 là câu trả lời của
Akenzy. Các dòng còn lại là giả định tôi tự đặt từ code. Dòng nào ghi
`pending` thì bạn cứ bác bỏ, và phạm vi ảnh hưởng ghi ngay trong dòng đó.

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Nhập khẩu **gộp theo mã**: mã đã có trong lưới thì ghi đè giá trị, mã mới thì thêm dòng, các dòng khác giữ nguyên | high | yes | Nếu là "thay thế toàn bộ" thì logic gộp ở T-04-03 thành xoá rồi nạp, và AC-13/AC-14 đổi | confirmed | Akenzy chốt 2026-09-27: "Gộp theo mã SKU" |
| A-02 | Nhập/Xuất khẩu chỉ có ở phạm vi **Hàng hóa**, phương thức **% hoặc Số tiền**. Ẩn khi là *Nhóm hàng hóa* hoặc *Đồng giá* | high | yes | Mở cho *Nhóm hàng hóa* thì phải tra mã nhóm, dùng file mẫu riêng và thêm AC | confirmed | Akenzy chốt 2026-09-27: "Chỉ Hàng hóa" |
| A-03 | Lưới **không** thêm cột ĐVT / Giá bán / Giá khuyến mại. Chỉ file xuất có các cột đó | high | yes | Cần thêm một UoW hiển thị cột + tính giá KM trên client | confirmed | Akenzy chốt 2026-09-27: "Không, giữ bảng hiện tại" |
| A-04 | Sửa lỗi `targetType` trong feature này, và có test chứng minh trước | high | yes | Không sửa thì dòng nhập vào (item id) cũng không áp dụng ở POS | confirmed | Akenzy chốt 2026-09-27: "Xác minh rồi sửa trong feature này" |
| A-05 | Lỗi có thật: dòng chọn bằng ô tra cứu của lưới lưu item id nhưng gắn `PRODUCT`, nên engine không khớp | high | no | Nếu sai thì UOW-01 chỉ còn test khẳng định, không phải sửa code | pending | Bằng chứng từ code: `GoodsDiscountGrid.tsx:205` gán `targetId: item.id` từ `/inventory/items`; `promotion.mapper.ts:555` hardcode `PRODUCT`; `line-matching.ts:24-25` so với `productId`; `addFromPicker` bỏ `draft.targetType`. Chưa đếm được trên DB dev vì bị chặn đọc credentials trong phiên này. T-01-02 tái hiện bằng e2e |
| A-06 | **Không** sửa dữ liệu các CTKM đã lưu sai (`PRODUCT` + item id). Không có migration | high | yes | Các CTKM đó vẫn không áp dụng ở POS, và mở lại thì dòng mất mã/tên (`get-promotion.handler.ts:31,55` tra theo `products`). Người dùng tạo lại nếu cần | confirmed | Akenzy chốt 2026-09-27: "Không sửa" |
| A-07 | **Copy xuống** chép giá trị của dòng được bấm sang **mọi dòng bên dưới đã chọn hàng**, ghi đè giá trị cũ, bỏ qua dòng trống cuối. Có ở cả hai phạm vi, ẩn khi *Đồng giá* (vì không có giá trị theo dòng) | medium | no | Nếu chỉ muốn chép vào ô trống thì đổi một điều kiện trong handler | pending | Theo mẫu có sẵn `InventoryItemBarcodesPage.tsx:479-487` và ảnh 2 (icon ở mọi dòng) |
| A-08 | AC phía giao diện được chứng minh bằng ảnh chụp trình duyệt (`ai-dlc-verify` / Chrome), không có unit test web | high | no | Nếu muốn có vitest cho backoffice thì đó là feature riêng | confirmed | `apps/backoffice-web/package.json` có `"test": "echo test"`. Cùng cách làm đã được chấp nhận ở `2026091803-ctkm-item-discount-invoice-scope` A-17 |
| A-09 | Nhập khẩu chạy **đồng bộ, không lưu job**: server đọc file, tra mã rồi trả dòng hợp lệ + dòng lỗi trong một response. Tối đa **2.000 dòng dữ liệu** | medium | no | File lớn hơn thì cần job nền (tái dùng `inventory_import_jobs`) và phải có migration | pending | Ảnh 2 có khoảng vài chục dòng. Xem ADR-01 |
| A-10 | Bố cục file: dòng 1 là tiêu đề. Các cột theo thứ tự `Mã SKU*`, `Tên hàng hóa`, `Đơn vị tính`, `Giá bán`, `<cột giá trị>`, `Giá khuyến mại`. `<cột giá trị>` là `% giảm giá` hoặc `Số tiền giảm` tùy phương thức. Khi nhập, server tìm cột **theo tên tiêu đề**, chỉ đọc `Mã SKU` + cột giá trị, các cột khác bỏ qua | medium | no | Nếu cần đúng mẫu file của MISA thì phải có file mẫu thật từ bạn | pending | Tìm theo tên tiêu đề để người dùng thêm hay đổi thứ tự cột vẫn nhập được |
| A-11 | Cột giá trị của file **không khớp** phương thức đang chọn (file `% giảm giá` nhưng form đang *Số tiền*) thì **từ chối cả file** kèm thông báo, không tự đổi phương thức | medium | no | Nếu muốn tự chuyển phương thức theo file thì phải sửa state form, và các dòng cũ đổi nghĩa | pending | Đổi phương thức một cách âm thầm sẽ làm mọi dòng đang có đổi nghĩa |
| A-12 | Khớp mã: bỏ khoảng trắng hai đầu, **không phân biệt hoa thường**, tra `inventory_items.code` của tổ chức trước, không thấy thì tra mã mẫu mã (`products.code`) và gắn `PRODUCT` | medium | no | Nếu chỉ nhận SKU thì bỏ nhánh `products`. Khi đó file xuất có dòng mẫu mã sẽ không nhập lại được (AC-10 hỏng) | pending | Picker cho phép chọn mẫu mã (`PRODUCT`), nên muốn xuất rồi nhập lại mà không mất dòng thì phải nhận cả hai |
| A-13 | Kiểm tra giá trị: `%` thì `0 < v ≤ 100`; `Số tiền` thì `v > 0`, **không** chặn theo giá bán. Ô giá trị trống là lỗi dòng | medium | no | Nếu cần chặn *số tiền > giá bán* thì thêm một lỗi | pending | Domain chỉ chặn `PERCENT_OVER_100` (`promotion-program.ts:78`). Nhập khẩu không được chặt hơn lúc lưu |
| A-14 | Mã trùng **trong cùng file** thì cả hai dòng đều là lỗi, không có dòng nào thắng | medium | no | Nếu muốn "dòng sau thắng" thì đổi một nhánh validate | pending | Dòng trùng thường là file bị dán nhầm. Báo lỗi an toàn hơn đoán |
| A-15 | Xuất khẩu lấy **các dòng đang có trên lưới** (kể cả chưa lưu), gửi `{targetType, targetId, value}` lên server. Server đọc lại mã/tên/ĐVT/giá bán từ DB theo tổ chức và tính `Giá khuyến mại = max(0, giá bán − giảm)`. Lưới trống thì ra **file mẫu** chỉ có tiêu đề | medium | no | Nếu chỉ xuất bản đã lưu thì phải có `programId` và CTKM chưa lưu sẽ không xuất được | pending | Theo mẫu `export-barcode-labels.api.ts` (gửi dòng từ lưới lên) |
| A-16 | Quyền: Xuất khẩu cần `promotion.read`, Nhập khẩu cần `promotion.write` | high | no | Đổi một decorator | confirmed | `promotion-v2.controller.ts` dùng đúng hai quyền này cho đọc/ghi |
| A-17 | Chỉ nhận **.xlsx** | medium | no | Muốn nhận `.xls` thì dùng thư viện `xlsx` (đã có ở api) cho nhánh đó | pending | `exceljs` không đọc được `.xls` |
