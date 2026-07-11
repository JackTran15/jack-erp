# Customer Import Field Mapping

**Phạm vi:** `apps/api/src/modules/customer/csv`
**Cập nhật:** 2026-07-10

## Mục tiêu hiện tại

- Dùng template tĩnh `DanhMucKhachHang.xls` (MISA `MS_007`) làm tệp mẫu tải về.
- Layout MISA 5 dòng: dòng 1 = marker `MS_007`, dòng 2 = field key tiếng Anh, dòng 3 = tiêu đề `DANH MỤC KHÁCH HÀNG`, dòng 4 = nhãn tiếng Việt, dòng 5+ = dữ liệu.
- Export sinh `.xlsx` cùng layout để file xuất khẩu re-import được (roundtrip).
- Import runtime đọc sheet `Danh sách khách hàng` (fallback sheet đầu tiên).
- Hỗ trợ cả `.csv` cùng layout: dòng key EN được dò theo `CustomerCode` (không cố định dòng 2), dữ liệu bắt đầu 3 dòng bên dưới; delimiter `;` hoặc `,` (quote-aware, UTF-8 BOM).

## Trạng thái triển khai

### Đã triển khai

- Validate/import theo job (tái dùng `inventory_import_jobs` với `type=CUSTOMERS`), commit theo `duplicateMode` (`UPDATE`/`SKIP`, dedupe theo Mã khách hàng).
- Idempotency theo SHA-256 checksum; upload lại cùng file trả về job đang xử lý.
- Hủy job khi quay lại bước chọn file.
- Export lỗi dạng `.xlsx` có cột `Tình trạng` (`GET /customers/imports/jobs/:id/error-rows.xlsx`).
- Warning không chặn (row vẫn VALID): giới tính/hạng thẻ không nhận diện, ngày sinh sai định dạng, email sai định dạng, mã nhân viên không tồn tại, CMND/MST quá dài, mã thẻ đã thuộc khách hàng khác.
- Tự tạo nhóm khách hàng khi `CustomerCategoryCode` chưa tồn tại (`customer_groups.code`, sinh mã `NKH` qua DocumentNumberingService cho nhóm tạo từ UI).
- Tạo/cập nhật thẻ thành viên trong cùng transaction commit (khách mới luôn có thẻ, giống `CustomerService.create`).
- Export tất cả (`GET /customers/exports/excel`) và export theo danh sách chọn (`POST /customers/exports/excel` body `{ customerIds }`).

### Còn lại (ngoài MVP)

- Các cột DEFER bên dưới: cần thêm field trên `CustomerEntity` (hoặc domain kế toán cho hạn mức nợ) trước khi map.

## Mapping 21 fields

**Chú thích:**
- `MAP`: đã map vào nghiệp vụ hiện tại.
- `DEFER`: chưa có field trên entity — giữ trong `rawData`, không chặn import, export để trống.

| # | Excel Key | Nhãn | Trạng thái | Đích hiện tại / Ghi chú |
| --- | --- | --- | --- | --- |
| 1 | `CustomerCode` | Mã khách hàng | MAP | `customers.code` (trống → auto `KH...`; key dedupe UPDATE/SKIP; >50 ký tự = lỗi) |
| 2 | `CustomerName` | Tên khách hàng (*) | MAP | `customers.name` (bắt buộc) |
| 3 | `CustomerCategoryCode` | Nhóm khách hàng | MAP | lookup `customer_groups.code` → `customers.groupId` (miss → tự tạo nhóm; nhóm cũ chưa có code được adopt theo tên) |
| 4 | `Tel` | Điện thoại (*) | MAP | `customers.phone` (bắt buộc khi import; unique/org; trùng trong file hoặc thuộc KH khác = lỗi) |
| 5 | `MaximumDebtAmount` | Số nợ tối đa | DEFER | chưa có field trên entity (thuộc domain công nợ/kế toán) |
| 6 | `DueDate` | Hạn nợ (ngày) | DEFER | chưa có field trên entity (điều khoản nợ theo hóa đơn) |
| 7 | `Birthday` | Ngày sinh | MAP | `customers.birthDate` (dd/MM/yyyy; sai định dạng → warning, bỏ cột) |
| 8 | `Gender` | Giới tính | MAP | `customers.gender` (Nam→male, Nữ→female, Không xác định→unspecified; giá trị lạ → warning, bỏ cột) |
| 9 | `MemberCardNo` | Mã thẻ thành viên | MAP | `membership_cards.cardNumber` (đã thuộc KH khác → warning, không đổi thẻ) |
| 10 | `MemberLevelCode` | Hạng thẻ | MAP | `membership_cards.tier` (Thường/Bạc/Vàng/Kim cương; không nhận diện → warning, dùng hạng mặc định) |
| 11 | `IdentifyNumber` | Số CMND/Hộ chiếu | MAP | `customers.nationalId` (>12 ký tự → warning, bỏ cột) |
| 12 | `ExportProvince` | Tỉnh thành | DEFER | chưa có field trên entity (địa chỉ hiện là 1 cột `address`) |
| 13 | `ExportDistrict` | Quận/Huyện | DEFER | chưa có field trên entity |
| 14 | `ExportVillage` | Phường/Xã | DEFER | chưa có field trên entity |
| 15 | `Address` | Số nhà, đường phố | MAP | `customers.address` (cắt 500 ký tự) |
| 16 | `Email` | Email | MAP | `customers.email` (unique/org; sai định dạng → warning, bỏ cột; thuộc KH khác = lỗi) |
| 17 | `CompanyName` | Tên công ty | MAP | `customers.companyName` |
| 18 | `CompanyTaxCode` | Mã số thuế | MAP | `customers.taxCode` (>20 ký tự → warning, bỏ cột) |
| 19 | `Description` | Ghi chú | MAP | `customers.note` |
| 20 | `EmployeeCode` | Mã nhân viên phụ trách | MAP | lookup `employee_profiles.code` → `customers.assignedStaffId` (miss → warning, bỏ cột) |
| 21 | `EmployeeName` | Tên nhân viên phụ trách | MAP (export-only) | export điền họ tên user phụ trách; import bỏ qua |

## Ghi chú runtime

- Cột `Tình trạng` là cột hệ thống khi review/export lỗi, không thuộc 21 cột gốc.
- Ô trống ở chế độ UPDATE giữ nguyên giá trị hiện có trong DB (chỉ ghi đè cột có dữ liệu).
- Khách hàng trạng thái `MERGED` không được export.
