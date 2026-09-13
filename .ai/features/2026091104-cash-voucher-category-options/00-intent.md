---
feature: cash-voucher-category-options
slug: 2026091104-cash-voucher-category-options
owner: Akenzy
created: 2026-09-11
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Bổ sung Mục chi theo danh sách người dùng, rà Mục thu

Nguồn: Akenzy gửi 7 ảnh ngày 11/09/2026. Ảnh 1–6 là các nhóm mục chi ("please add each option Mục chi"), ảnh 7
là bảng "Tên mục thu" ("add thêm vào mục thu").

## Problem

Dropdown mục chi trên dòng chi tiết của Phiếu chi tiền mặt và Phiếu chi tiền gửi không có đủ các mục trong danh
sách người dùng đưa ra (tiền vận chuyển, xăng dầu nhớt, nạp VETC, ăn uống, ứng lương, vệ sinh…). Khoản chi không có
mục riêng thì chỉ gắn được vào mục gần đúng hoặc "Chi khác".

Danh mục là bảng `cash_voucher_categories` theo từng org, seed **một lần** lúc tạo org từ
`DEFAULT_CASH_VOUCHER_CATEGORIES`. Chỉ thêm vào constant thì không tới được org đang dùng: `BANK_FEE` từng được thêm
như vậy, và org My Company trong `erp_dev_3008` đến nay vẫn thiếu mục đó.

Đối chiếu ảnh với constant và DB `erp_dev_3008` (11/09/2026):

- **Mục chi:** ảnh có 32 mục — 16 mục đã có cùng tên, 2 mục đã có nhưng khác tên ("Tiền nước" → "Tiền nước sinh
  hoạt", "Công cụ dụng cụ" → "Mua đồ dùng, công cụ, dụng cụ"), 14 mục chưa có.
- **Mục thu:** cả 8 mục ảnh 7 đã có, cùng tên, cùng thứ tự (`THU_BAN_HANG` … `THU_TIEN_GUI_NH`), cộng `THU_NO_KH`.
  Không cần mã mới; org nào thiếu thì migration lấp (A-07).
- Dropdown sắp theo ngày tạo chứ không theo `display_order`, nên mục bổ sung sẽ rơi xuống cuối, tách khỏi nhóm trong ảnh.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| --- | --- | --- |
| Kế toán / thu ngân lập phiếu chi | Không có mục cho tiền vận chuyển, xăng dầu, VETC, ăn uống, ứng lương…; gắn mục gần đúng hoặc "Chi khác" | Chọn đúng mục; mục xếp theo nhóm như danh sách trong ảnh |
| Người xem báo cáo Kết quả kinh doanh | Mục 3.2 chỉ có các dòng mục chi hiện có | Mỗi mục chi mới có dòng riêng dưới 3.2 |
| Người tạo tổ chức mới | Nhận danh sách cũ | Nhận cùng danh sách với org đang dùng |

## Success signal

Trên `erp_dev_3008` sau `migration:run`, không sửa DB bằng tay:

1. Cả hai org (MT, My Company) có 34 mục chi và 9 mục thu; `BANK_FEE` có ở cả hai.
2. Dropdown mục chi của Phiếu chi tiền mặt hiện 34 mục theo đúng thứ tự ảnh 1→6, 2 mục hệ thống ở cuối.
3. Org tạo mới qua seeder có đúng cùng 43 mục (e2e so với constant).

## Out of scope

- Nhóm mục có tiêu đề (vd "Chi lương thưởng" bị cắt ở đáy ảnh 1) — danh mục vẫn phẳng (A-02).
- Ẩn hoặc xoá 3 mục không có trong ảnh (Thu nợ khách hàng, Chi trả nợ nhà cung cấp, Phí ngân hàng) — các luồng tự sinh phiếu resolve theo mã.
- `inventory.seed.ts` — literal riêng, đã lệch từ trước (thiếu `BANK_FEE`) (A-09).
- POS — không có dropdown mục thu/chi; phiếu POS gắn mã cố định.
- Màn quản trị danh mục `/admin/cash-voucher-categories` — không đổi.

## Constraints

| Kind | Detail |
| --- | --- |
| Dữ liệu prod | Migration chạy trên prod lúc deploy: chỉ INSERT và UPDATE có điều kiện, không xoá, không đè chỉnh sửa của org |
| Schema | Không đổi schema; `code` tối đa 32 ký tự; UNIQUE `(organization_id, code)` tính cả dòng đã xoá mềm |
| Môi trường local | `erp_dev_3008` đang chờ `AddStorageDefaultIssuing1789920000000`; `migration:run` sẽ áp cả hai — hỏi trước khi chạy |
| Deadline | Không nêu |

## Existing surface touched

- `cash-voucher-category.seeder.ts` (`DEFAULT_CASH_VOUCHER_CATEGORIES`), dùng bởi `OrganizationService.create` (cả đường đăng ký) và `seed:org`.
- Migration dữ liệu mới, theo khuôn `1787500000001-BackfillDefaultCoaAccounts.ts`; e2e theo khuôn `storage-default-issuing.e2e-spec.ts`.
- `useCashVoucherCategories` → 4 dialog: Phiếu thu/chi tiền mặt, Phiếu thu/chi tiền gửi.
- Báo cáo Kết quả kinh doanh (`business-results.report.ts`, `queryOtherCategories`): mục 2.2/3.2 sinh một dòng cho mỗi mục đang hoạt động theo `display_order` ⇒ thêm 14 dòng dưới 3.2 (giá trị 0 tới khi có phiếu), thứ tự dòng 3.2 đổi theo ảnh.
