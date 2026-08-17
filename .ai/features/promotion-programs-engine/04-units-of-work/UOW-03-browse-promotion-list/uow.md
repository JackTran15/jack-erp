---
id: UOW-03
slug: browse-promotion-list
title: Marketing tra cứu danh sách CTKM với lọc và phân trang chạy trên server
demoable: true
duration: 2d
depends_on: [UOW-01, UOW-02]
requirements: [US-03]
verifies: [AC-10, AC-19, AC-21, AC-23]
risk: medium
status: in_progress
rollback: `ProgramsPage` quay lại nguồn dữ liệu cũ bằng một commit revert; API đọc thuần nên không có dữ liệu cần dọn
---

# UOW-03 — Danh sách CTKM chạy thật

Lát cắt đọc end-to-end: query handler → OpenAPI → hook TanStack → màn danh sách. Đây cũng là
UoW nối `@erp/api-client` cho toàn bộ phần FE còn lại, nên nó chặn UOW-04, UOW-05 và phần FE
của UOW-06.

## Demo script

1. `make dev-api` + `make dev-backoffice`, mở `/promotions/programs`.
2. Danh sách hiện đủ cột: Tên chương trình · Ngày bắt đầu · Ngày kết thúc · Áp dụng cho ·
   Hình thức khuyến mại · Mô tả · Trạng thái.
3. Bộ lọc mặc định `Đang theo dõi` hiện thành **chip** trên thanh công cụ; bấm `×` một lần →
   CTKM đã ngừng theo dõi hiện ra (AC-10).
4. Lọc cột Tên với từng toán tử `CONTAINS` / `EQUALS` / `STARTS_WITH` / `ENDS_WITH` /
   `NOT_CONTAINS`, mở tab Network xác nhận **request mới** được gửi mỗi lần (server-side).
5. Đổi kỳ và cặp Từ ngày/Đến ngày → `startDate`/`endDate` gửi xuống dạng `DateRangeFilterDto`.
6. Sang trang 2, xác nhận `Hiển thị x - y trên z kết quả`; mặc định 50 dòng/trang.
7. Đổi `X-Branch-Id` sang chi nhánh khác → CTKM giới hạn chi nhánh biến mất, CTKM toàn chuỗi
   vẫn còn (AC-21).

## In scope

- `SearchPromotionsV2Query` + `GetPromotionQuery` và DTO tương ứng.
- Regen `openapi` + `@erp/api-client`.
- Hook TanStack (`usePromotionsQuery`, `usePromotionQuery`, 5 mutation) và mapper
  `ProgramFormState ↔ PromotionProgramDetail`.
- `ProgramsPage` bỏ mock, lọc/phân trang/sắp xếp chuyển hẳn sang server, chip bộ lọc.

## Not in scope

- Form nhập CTKM (UOW-04), dialog chọn hàng hóa (UOW-05), màn voucher (UOW-06).

## Risks

| Risk | Mitigation |
|---|---|
| Mapper mất dữ liệu âm thầm khi mở form Sửa | Unit test round-trip 5 hình thức chạy bằng `pnpm dlx vitest run` — lưới an toàn duy nhất của lớp map (T-03-03, A-24) |
| Regen OpenAPI kéo theo diff của module khác | Nếu diff chạm module khác thì dừng, tìm nguyên nhân, **không** commit đè (T-03-02) |
| Gửi thừa trường bị `forbidNonWhitelisted` từ chối 400 | Mapper chỉ gửi trường thuộc hình thức đang chọn; có test riêng cho điều này (T-03-03) |
| Chuyển lọc từ RAM sang server làm vỡ `ColumnFilter` đang dùng | Giữ nguyên component `ColumnFilter`, chỉ đổi chỗ tiêu thụ giá trị (T-03-04) |

## Definition of done

- [ ] AC-10, AC-19, AC-21, AC-23 pass
- [ ] `pnpm build` toàn workspace xanh với client mới
- [ ] Không còn import nào từ `_mock/` trong `pages/promotions/programs/`
- [ ] `packages/api-client/src/generated/schema.ts` không bị sửa tay
- [ ] Demo script chạy hết và được nghiệm thu ở gate G4
