---
id: UOW-03
slug: hide-inactive-showrooms
title: Showroom của kho đã ngừng hoạt động không hiện ở POS Kho tạm
demoable: true
duration: 1d
depends_on: []
requirements: [US-03]
verifies: [AC-10, AC-11]
risk: low
status: todo
rollback: revert hai file; tham số mới là tuỳ chọn nên bỏ nó đi không ảnh hưởng ai
---

# UOW-03 — Showroom của kho đã ngừng hoạt động không hiện ở POS Kho tạm

Lát cắt độc lập hoàn toàn với hai lát kia — không cần cờ mới, không cần migration, nên chạy
song song được với UOW-01 ngay từ đầu.

Đây là **nửa còn thiếu** của yêu cầu "không load data những kho đã ngừng hoạt động". Nửa kia
đã xong từ trước: POS gửi `activeOnly=true` cho kho lưu trữ và backend tôn trọng (A-12).

## Demo script

1. Ở backoffice, chọn một chi nhánh có ít nhất hai showroom.
2. Mở Danh mục > Kho hàng, tìm kho lưu trữ đang backing showroom `S`, tick "Ngừng hoạt động",
   lưu.
3. Đăng nhập POS vào chính chi nhánh đó, mở `/fast-stock-transfer`.
4. Tab "Xuất đi": dropdown showroom (ô đích) **không** còn `S`.
5. Tab "Trả lại": dropdown showroom (ô nguồn) cũng **không** còn `S`.
6. Mở một màn backoffice khác đang gọi `GET /inventory/showrooms` không kèm tham số → `S` vẫn
   hiện, y như trước.

## In scope

- Tham số `activeOnly` tuỳ chọn cho `GET /inventory/showrooms`, join `storages.is_active`.
- POS truyền `activeOnly=true` khi nạp showroom.

## Not in scope

- Thêm cột `is_active` cho bảng `showrooms` (A-08) — trạng thái đã có nguồn duy nhất là kho
  backing.
- Bật `activeOnly` mặc định cho endpoint (ADR-03) — sẽ âm thầm đổi hành vi các nơi gọi khác.
- Phía kho lưu trữ — đã xong từ trước (A-12).

## Risks

| Risk | Mitigation |
| --- | --- |
| Bật mặc định sẽ giấu showroom ở màn khác mà không ai biết | ADR-03 chốt tham số tuỳ chọn, mặc định tắt; AC-11 là test cho đúng điều đó |
| `listShowrooms` hiện dùng `findAndCount` với object `where`; thêm join có thể làm lệch `total` khi phân trang | T-03-01 chuyển sang query builder và có test cho `total` |

## Definition of done

- [ ] AC-10 và AC-11 pass
- [ ] Không nơi gọi hiện tại nào đổi hành vi
- [ ] `total` trả về khớp số dòng sau khi lọc
- [ ] `pnpm --filter @erp/api test` xanh
- [ ] `pnpm openapi:generate` đã chạy nếu tham số mới lộ ra OpenAPI
- [ ] Demo script chạy được đầu-cuối và được nghiệm thu ở G4
