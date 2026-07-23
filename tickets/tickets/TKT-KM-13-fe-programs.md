# TKT-KM-13 FE ProgramsPage + ProgramFormPage bỏ mock

## Epic

[EPIC-22072026 Khuyến mại — schema chuẩn hóa, domain engine & evaluate API](../epics/EPIC-22072026-promotion-programs-engine.md)

## Summary

Nối màn danh sách và màn form CTKM vào API thật. Khung UI **đã dựng xong** — ticket này thay nguồn dữ liệu, không thiết kế lại giao diện. Kèm hai điểm chủ ý khác hệ tham chiếu MISA: chip bộ lọc (FR-004) và không tự bỏ tick auto-apply (FR-023).

## Deliverables

Sửa các file có sẵn dưới `apps/backoffice-web/src/pages/promotions/programs/`:

- `ProgramsPage.tsx` — bỏ `MOCK_PROGRAM_ROWS`, dùng `usePromotionsQuery`; lọc/phân trang/sắp xếp chuyển sang **server-side** (hiện đang lọc trong RAM qua `applyColumnFilter`).
- `ProgramFormPage/ProgramFormPage.tsx` — bỏ `MOCK_PROGRAM_ROWS`; **wire chọn variant theo `?type=`** — hiện luôn render `PromotionInvoiceDiscount` bất kể type, phải render đúng 1 trong 5 `PromotionVariant/*` theo `PromotionForm`; `handleSave` / `handleSaveAndNew` đã tồn tại và build payload qua `buildInvoiceDiscountPayload` (chỉ `console.log` + toast) — thay bằng mutation thật, tổng quát hóa cho cả 5 hình thức (mapper ở TKT-KM-12); chế độ sửa nạp bằng `usePromotionQuery(id)`.
- `programs.constants.ts` — bỏ comment 4 option trong `PROMOTION_FORM_OPTIONS` để dropdown "Thêm mới" đủ 5 hình thức (FR-006; hiện chỉ còn `INVOICE_DISCOUNT`).
- `ProgramsTable/ProgramsTable.tsx` — bind cột theo response thật.
- `programs.types.ts` — thay union type cục bộ bằng enum từ `@erp/shared-interfaces` (xử lý các lệch tên đã nêu ở TKT-KM-12).
- Xóa `_mock/mock-programs.ts`.
- `ProgramFormPage/PromotionVariant/_PromotionSections/AutoApplyCheckbox/AutoApplyCheckbox.tsx` — xác nhận **không** có side-effect tự bỏ tick.

## Acceptance Criteria

- [ ] **FR-001** Danh sách hiện đủ cột: Tên chương trình · Ngày bắt đầu · Ngày kết thúc · Áp dụng cho · Hình thức khuyến mại · Mô tả · Trạng thái.
- [ ] **FR-002** Bộ chọn kỳ + Từ ngày/Đến ngày hoạt động, mặc định `Năm nay`; gửi xuống `startDate`/`endDate` dạng `DateRangeFilterDto`.
- [ ] **FR-003** Lọc theo cột chạy **server-side**: cột text 5 toán tử map vào `StringOperator`; cột ngày `DateRangeFilterDto`; cột enum `EnumFilterDto` có mục "Tất cả" (gửi `undefined`, không gửi chuỗi rỗng).
- [ ] **FR-004 / AC-10** Mặc định lọc `Đang theo dõi`, **và** hiển thị chip/badge bộ lọc đang bật trên thanh công cụ; click 1 lần xóa lọc. Đây là điểm **chủ ý khác MISA** — hệ tham chiếu ẩn CTKM đã ngừng mà không có dấu hiệu nào.
- [ ] **FR-005** Phân trang server-side, mặc định 50 dòng/trang, hiển thị `Hiển thị x - y trên z kết quả`.
- [ ] **FR-006** Nút `Thêm mới` có dropdown 5 hình thức; hình thức chọn lúc tạo và **không đổi được khi sửa** (control disabled + tooltip giải thích).
- [ ] **FR-007** Sửa mở đúng CTKM với **mọi** trường round-trip đúng — đặc biệt `tierGroups` nhiều nhóm và 2 lưới của `Mua m tặng n`.
- [ ] **FR-008** Nhân bản mở form Thêm mới đã điền sẵn; **không ghi dữ liệu** cho tới khi bấm Lưu.
- [ ] **FR-009** Xóa hỏi xác nhận; xóa xong danh sách tự làm mới.
- [ ] **FR-010** Radio `Đang theo dõi` / `Ngừng theo dõi` **chỉ hiện ở chế độ Sửa**.
- [ ] **FR-023 / AC-11** Checkbox "Tự động áp dụng" **giữ nguyên** giá trị người dùng chọn khi đổi tab/điều kiện. Điểm **chủ ý khác MISA** — hệ tham chiếu tự bỏ tick khiến CTKM lưu xong không chạy tại quầy.
- [ ] **BR-003** Lưu CTKM không có ngày kết thúc → hiện cảnh báo xác nhận, **không** chặn.
- [ ] Lỗi 400 kèm `issues[]` gắn vào **đúng trường** trong form (viền đỏ + message), không chỉ toast chung.
- [ ] Không còn import nào từ `_mock/` trong `pages/promotions/programs/`.
- [ ] `priority` sửa được trên form (BR-001 phụ thuộc trường này; không có UI thì người dùng không điều khiển được thứ tự).

## Definition of Done

- [ ] `pnpm --filter @erp/backoffice-web build` xanh.
- [ ] Click-through thật với `make dev-api` + `make dev-backoffice`: tạo → lưu → mở lại đủ **cả 5 hình thức**, đối chiếu từng trường.
- [ ] Chuỗi hiển thị tiếng Việt; số/ngày format `Intl` locale `vi-VN`.
- [ ] Primitive import từ `@erp/ui`, icon từ `lucide-react`, class merge bằng `cn()`, token Tailwind ngữ nghĩa.
- [ ] Named export, `interface Props` tách riêng.
- [ ] Không còn `_mock/mock-programs.ts` trong repo.

## Tech Approach

Chuyển lọc từ RAM sang server là thay đổi lớn nhất. `ProgramsPage` hiện có `comparableFor(row, key)` + `applyColumnFilter` chạy trên mảng mock. Thay bằng: state filter → `queryKey` → API. Giữ nguyên component `ColumnFilter` của `components/table/` — chỉ đổi chỗ tiêu thụ giá trị.

Chip bộ lọc (FR-004) đặt trong `PageToolbar` cùng hàng nút — dùng badge của `@erp/ui`, mỗi filter đang bật một chip có nút `×`; thêm nút "Xóa tất cả" khi có ≥ 2 chip.

Kiểm chứng FR-023 bằng cách đọc code: nếu có `useEffect` nào set `autoApply` theo `conditionType` thì xóa. Đây là hành vi ngầm của MISA mà REQ yêu cầu **không** sao chép.

Không tạo trang mới, không tạo route mới — `App.tsx` đã có sẵn 3 route (`/promotions/programs`, `/new`, `/:id/edit`) và `navConfig.ts` đã có NavChild cho `/promotions/programs`. (NavChild `/promotions/vouchers` đang comment trong `navConfig.ts` — bỏ comment thuộc TKT-KM-14.)

## Testing Strategy

Không có test runner thật cho backoffice (`test` chỉ `echo`). Bảo chứng bằng:
1. Build xanh (type check là lưới an toàn chính).
2. Unit test mapper ở TKT-KM-12 phủ phần dễ mất dữ liệu nhất.
3. Click-through thủ công theo checklist ở Definition of Done — bắt buộc, có ảnh chụp màn hình đính kèm PR cho ít nhất 2 hình thức phức tạp nhất (`TIERED_DISCOUNT`, `BUY_M_GET_N`).

## Dependencies

- Depends on: TKT-KM-12
- Blocks: TKT-KM-16
