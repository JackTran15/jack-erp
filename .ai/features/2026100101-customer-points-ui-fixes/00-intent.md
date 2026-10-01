---
feature: customer-points-ui-fixes
slug: 2026100101-customer-points-ui-fixes
owner: Akenzy
created: 2026-10-01
status: draft            # draft | approved | in_construction | done | abandoned
---

# Intent — Đợt phản hồi khách hàng 01/10/2026: điểm thành viên, tương phản bảng, hiệu năng Quản lý vai trò, dòng trống CTKM

Bốn yêu cầu độc lập từ client (`erp.giaymt.com.vn`), gộp một feature vì cùng một đợt phản hồi
và đều nhỏ. Mỗi yêu cầu là **một UoW riêng**, không UoW nào phụ thuộc UoW khác — triển khai
và nghiệm thu song song được.

## Problem

Yêu cầu gốc:

> *T1: Client muốn update điểm của khách hàng trên UI edit thông tin khách hàng, show thông tin
> mã thẻ. Viết 1 đoạn script view thông tin lịch sử dụng điểm của khách hàng, sẽ có 1 role
> permission view it.*
> *T2: Table UI/UX: Even/Odd row tăng độ tương phản color (trắng/xám). Hover/Select tăng tương
> phản màu (xanh/tím).*
> *T3: Performance page Quản lý vai trò (Refactor call list/detail API).*
> *T4: Khuyến mãi khi các dòng empty khi lưu thì filter bỏ.*

**T1 — Điểm thành viên.** Backend đã có gần đủ: `membership_cards` giữ `card_number` (mã thẻ),
`tier`, `points`; `point_history` là sổ cái bất biến (earn/redeem/adjust); có
`POST /customers/membership-cards/:cardId/points` (nhận **delta**) và
`GET .../points` (lịch sử, phân trang). Thiếu: không có UI nào để sửa điểm hay xem lịch sử;
form sửa khách hàng (`CrudEditPage` chung) không hiện mã thẻ; cả hai endpoint dùng chung
`customer.read`/`customer.write` nên không tách được quyền. `adjustPoints`
(`membership-card.service.ts:84-122`) còn đọc thẻ **không khoá**, nên kiểm tra số dư rồi cộng
có thể đua nhau.

**T2 — Tương phản bảng.** Bảng danh sách (`BaseDataTable`, 78 file dùng) sọc `bg-background` /
`bg-muted/20` — ở theme `misa` nền là `#f5f5f5` và muted là `93%`, hai sọc gần như trùng màu.
Hover `bg-info-subtle/70` (98% sáng) gần như không thấy. Cột ghim lấy màu bằng inline style
(`frozenBodyBackground`, `BaseDataTable.tsx:161-164`) nên hover/chọn **không bao giờ** tô được
cột ghim. Dòng đang chọn không có sẵn trong bảng: 7 trang tự truyền `rowClassName` với màu
khác nhau (`bg-info/15`, hằng `FOCUSED_ROW_BG` riêng của Đơn hàng). Lưới nhập dòng
(`LineItemGrid`, `@erp/ui`) có sọc và hover riêng (`bg-muted/15`, `hover:bg-accent/60`).

**T3 — Quản lý vai trò chậm.** Mở `/role-management` bắn ~120 request `GET /admin/users/{id}`.
Nguyên nhân: `useAllUserDetails` (`hooks/iam/useUsers.ts:127-171`) tải danh sách người dùng rồi
gọi chi tiết **từng người** (8 song song) chỉ để lấy `roleIds`, vì `GET /admin/users` không trả
trường này. Mỗi lần gọi chi tiết tốn ~10-15 truy vấn DB + ký URL ảnh, nên một lần mở trang
≈ 1.500 truy vấn. Fan-out chạy lại sau mỗi lần Nạp và mỗi lần gán/bỏ người dùng.

**T4 — Dòng trống ở CTKM Giảm giá hàng hóa.** Ảnh chụp CTKM `45260957-…` cho thấy nhiều dòng
trống (placeholder "Tìm mã hoặc tên hàng hóa") **xen giữa** các dòng đã lưu, có giá trị ≤ 30.
Đó không phải dòng người dùng thêm: mapper bản đầu (`85f4c1bf`, `promotion.mapper.ts:552`) lưu
mọi dòng với `targetType: PRODUCT` trong khi ô tra cứu trả **id inventory item**. Từ `4377ddb0`
mới dùng `r.targetType`. Dòng cũ trỏ id item dưới nhãn PRODUCT nên `GetPromotionHandler`
(`get-promotion.handler.ts:55-57`) không tìm thấy → mã/tên rỗng → dòng hiện trống. Lưu lại thì
`itemDiscountToDto` (`:560-561`) vẫn giữ dòng vì `targetId` có giá trị.

## Affected personas

| Persona | Current behaviour | Desired behaviour |
| --- | --- | --- |
| Quản lý / admin (backoffice) | Không sửa được điểm; form sửa khách hàng không có mã thẻ | Xem mã thẻ, hạng, điểm ngay trên form sửa và trang chi tiết; đặt số dư điểm mới kèm lý do |
| Người được cấp quyền xem lịch sử điểm | Không có chỗ nào xem lịch sử | Tab *Lịch sử điểm* trên chi tiết khách hàng: ngày, loại, ± điểm, hóa đơn, ghi chú, người thực hiện |
| Mọi người dùng backoffice | Sọc chẵn/lẻ, hover, dòng chọn khó phân biệt | Sọc trắng/xám rõ; hover xanh; dòng chọn tím; kể cả cột ghim |
| Admin phân quyền | Mở *Quản lý vai trò* chờ vài giây, ~120 request | ≤ 3 request khi mở trang |
| Nhân viên tạo CTKM | Dòng trống không xoá được qua Lưu, tồn mãi | Lưu xong mở lại không còn dòng trống |

## Success signal

1. Đặt điểm khách hàng từ 120 → 200 sinh đúng **một** dòng `ADJUST +80` trong `point_history`, số dư thẻ = 200 (e2e).
2. Người **không** có `customer.points.history.read` nhận 403 ở endpoint lịch sử và không thấy tab; người có quyền thấy (e2e + ảnh).
3. Mở `/role-management` trên trình duyệt: số request XHR khi tải trang ≤ 3, không còn `GET /admin/users/{uuid}` (ảnh Network).
4. Ảnh chụp trước/sau ở 3 màn hình đại diện cho thấy sọc, hover, chọn khác biệt rõ, gồm cả cột ghim.
5. Lưu một CTKM *Giảm giá hàng hóa* có dòng không phân giải được → mở lại không còn dòng trống (unit test mapper + ảnh).
6. Mọi AC trong `02-requirements.md` có test hoặc ảnh chứng minh.

## Out of scope

- **Sửa mã thẻ** (`card_number`): chỉ hiển thị (A-03).
- Sửa dữ liệu `promotion_lines` cũ bằng migration (user chọn "chỉ lọc khi lưu", A-14). Hệ quả đã biết: các SKU đó **mất** KM sau lần lưu kế tiếp.
- pos-web và ~12 bảng/popup tự viết `<table>` trong backoffice (T2, A-09).
- Tối ưu `buildUserDetail` ở backend (tính `unmanageableUserIds` hai lần) — ghi nhận, không làm.
- Endpoint gán người dùng hàng loạt cho vai trò (vòng POST tuần tự lúc Lưu) — không thuộc lúc tải trang.
- Script SQL vận hành cho lịch sử điểm: thay bằng UI có phân quyền (A-05).

## Constraints

| Kind | Detail |
| --- | --- |
| Đa tổ chức | Mọi đọc/ghi điểm, người dùng, vai trò lọc theo `actor.organizationId` |
| Sổ cái bất biến | `point_history` chỉ INSERT; đặt số dư = ghi một dòng `ADJUST` với delta = mới − cũ |
| Quyền mới | Khai ở `permissions.seed.ts` + `PERMISSION_LABELS_VI` + seed vai trò + migration cấp cho tổ chức đang chạy |
| Schema | Không đổi bảng; chỉ migration dữ liệu quyền |
| Hợp đồng API | Sau khi đổi endpoint: `pnpm openapi:generate`, commit `openapi.snapshot.json` + `schema.ts` |
| Ngôn ngữ | Chuỗi UI tiếng Việt; số/ngày `vi-VN` |
| Kiểm chứng web | `backoffice-web` không chạy test trong `pnpm test`; logic thuần dùng vitest, UI chứng minh bằng ảnh |

## Existing surface touched

**Tái sử dụng:**
- `MembershipCardService` + `point_history` + pattern "delta = đích − hiện tại" của `customer-import.service.ts:1017-1027`.
- `GET /customers/:id/summary` (`customer-summary.service.ts`) đã trả mã thẻ / hạng / điểm.
- Mục *Thẻ thành viên* trên `CustomerDetailPage.tsx:150-199`.
- `UsersService.toListItems` (`users.service.ts:246-277`) đã batch — thêm `roleIds` vào đó.
- `BaseDataTable`, `LineItemGrid`, token theme ở `apps/backoffice-web/src/index.css`.
- Migration mẫu cấp quyền theo khoá mỏ neo: `1790010000000-CashierBankReceiptPermission.ts`.

**Lối vào:** không thêm route frontend. Thêm 2 endpoint dưới `/customers/:id/…` (T1).
