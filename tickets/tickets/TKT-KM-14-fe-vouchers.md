# TKT-KM-14 FE VouchersPage bỏ mock

## Epic

[EPIC-22072026 Khuyến mại — schema chuẩn hóa, domain engine & evaluate API](../epics/EPIC-22072026-promotion-programs-engine.md)

## Summary

Nối màn "Thẻ voucher" (FR-050, FR-051) vào API thật. Khung UI đã có; ticket này thay `MOCK_VOUCHER_ROWS` bằng `useVouchersQuery` và bổ sung dialog thêm/sửa.

## Deliverables

Sửa dưới `apps/backoffice-web/src/pages/promotions/vouchers/`:

- `VouchersPage.tsx` — bỏ mock, dùng hook; lọc/phân trang server-side.
- `VouchersTable/VouchersTable.tsx` — bind response thật, thêm **dòng tổng cộng** cho 3 cột số.
- `VoucherFormDialog/VoucherFormDialog.tsx` (mới) — dialog Thêm mới / Sửa theo FR-051.
- `vouchers.types.ts` — dùng type từ `@erp/api-client` / `@erp/shared-interfaces` thay union cục bộ.
- Xóa `_mock/mock-vouchers.ts`.
- `components/layout/navConfig.ts` — bỏ comment NavChild `/promotions/vouchers` (đang comment) để màn voucher hiện trong menu; route trong `App.tsx` đã có sẵn.

## Acceptance Criteria

- [ ] **FR-050** Lưới đủ 10 cột: Nhà phát hành · Voucher · Ngày bắt đầu · Ngày kết thúc · Mô tả · Mệnh giá · Tổng số lượng · Tổng giá trị voucher · Tổng giá trị áp dụng · Trạng thái.
- [ ] Dòng **tổng cộng** cho 3 cột số lấy từ `summary` của API (**toàn tập kết quả lọc**, không phải tổng của trang hiện tại).
- [ ] Thanh công cụ: `Thêm mới` · `Nhân bản` · `Sửa` · `Xóa` · `Nạp`. Ba nút giữa **disabled khi chưa chọn dòng**.
- [ ] **FR-051** Dialog có đủ trường: Ngày bắt đầu, Ngày kết thúc, Nhà phát hành (bắt buộc), Voucher/mã (bắt buộc), Mệnh giá (bắt buộc), Mô tả. Ghi chú *"Bỏ trống từ ngày, đến ngày nếu không giới hạn thời gian"* hiển thị dưới cặp ngày.
- [ ] Trùng mã voucher → hiện lỗi 409 ở đúng trường `Voucher`, không phải toast lỗi 500.
- [ ] Bộ lọc trạng thái mặc định `Đang theo dõi` + **chip xóa được** — cùng chuẩn FR-004 đã áp cho màn CTKM.
- [ ] Mệnh giá và 3 cột tổng format `Intl` `vi-VN`, có phân cách nghìn.
- [ ] Không còn import từ `_mock/` trong `pages/promotions/vouchers/`.

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Click-through: tạo voucher → thấy trong danh sách → sửa → nhân bản → xóa; dòng tổng cộng đổi đúng.
- [ ] Chuỗi tiếng Việt; primitive từ `@erp/ui`; icon `lucide-react`; named export; `interface Props` tách riêng.
- [ ] Không còn `_mock/mock-vouchers.ts` trong repo.

## Tech Approach

Màn này đơn giản hơn CTKM nhiều — một bảng phẳng, một dialog 6 trường. Dùng lại `DocumentListShell` + `PageToolbar` + `PaginationControls` y như `ProgramsPage` để hai màn đồng nhất.

Dialog dùng primitive form của `@erp/ui`; không tạo abstraction form mới cho 6 trường.

Lưu ý: 3 cột tổng hợp là **dữ liệu suy ra**, không nhập tay — form Thêm mới không có ô tương ứng (đúng như quan sát trong khảo sát MISA mục 5.2). Đừng thêm ô nhập cho chúng.

## Testing Strategy

Build xanh + click-through thủ công. Không có test runner cho backoffice.

## Dependencies

- Depends on: TKT-KM-12
- Blocks: TKT-KM-16
