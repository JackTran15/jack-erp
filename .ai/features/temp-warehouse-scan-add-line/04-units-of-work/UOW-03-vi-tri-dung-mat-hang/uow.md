---
id: UOW-03
slug: vi-tri-dung-mat-hang
title: Ô Vị trí luôn là kệ của đúng mặt hàng đang quét
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-03]
verifies: [AC-10, AC-11, AC-12]
risk: high
status: todo
rollback: revert commit của UoW — không có migration; dữ liệu dòng đã tạo không bị đụng
---

# UOW-03 — Ô *Vị trí* luôn là kệ của đúng mặt hàng đang quét

Lát cắt này sửa phần nguy hiểm nhất của báo lỗi. Hai lỗi kia làm chậm người dùng; lỗi này
**ghi sai dữ liệu**: dòng kho tạm có thể được lưu với kệ của mặt hàng quét ngay trước nó,
và người đi lấy hàng sẽ tới đúng cái kệ sai đó.

Rủi ro `high` vì kết quả phụ thuộc nhịp thời gian giữa hai request, và ADR-06 đã chấp nhận
rằng phần này **không có test tự động** — nó phải được nghiệm bằng máy quét thật.

## Demo script

1. Tab **Xuất đi**, chọn *Người vận chuyển*. Chuẩn bị trước 2 mặt hàng: một cái **có** kệ
   ưu tiên trong kho nguồn (ghi lại mã kệ, vd `Y16.02`), một cái **không** có kệ nào.
2. Quét mặt hàng có kệ → nhìn ô *Vị trí*: nó **trống trong khoảnh khắc đầu** rồi mới hiện
   `Y16.02`. Dòng vào bảng với cột *Vị trí* = `Y16.02`.
3. Quét ngay mặt hàng **không** có kệ → ô *Vị trí* trống ngay lập tức, **không** còn hiện
   `Y16.02` của mặt hàng trước dù chỉ một khoảnh khắc. Dòng vẫn vào bảng, cột *Vị trí* trống.
4. Quét lại mặt hàng có kệ và **Enter thật nhanh** (ngay khi máy quét vừa xong) → dòng vào
   bảng vẫn mang `Y16.02`, không trống, không mang kệ của mặt hàng ở bước 3.
5. Lặp bước 2–4 mười lần xen kẽ → 10/10 dòng có cột *Vị trí* đúng mặt hàng của nó.
6. Ngắt mạng (hoặc chặn `preferred-shelf/batch` trong DevTools) rồi quét → ô *Vị trí* trống,
   dòng vẫn thêm được, không có toast lỗi nào.

## In scope

- `applyPreferredShelf`: xóa vị trí **trước** khi gọi API, giữ `{itemId, promise}` trong ref,
  thêm `.catch`.
- Bỏ nhánh `return` sớm mà không xóa vị trí khi chưa chọn được kho nguồn.
- `handleAddRow` `await` lượt tra kệ đang chạy của đúng mặt hàng đang chọn (ADR-05).

## Not in scope

- Cách **tính** kệ ưu tiên (`batchPreferredShelf` phía BE) — xem A-07. Nếu bước 2 của demo
  cho thấy API trả rỗng cho mặt hàng vốn có kệ thì đó là defect riêng, mở feature khác.
- Mở khóa ô *Vị trí* cho chọn tay — chốt A-03 là giữ read-only.

## Risks

| Risk | Mitigation |
|---|---|
| A-07 sai: API mới là thủ phạm, không phải nhịp dùng kết quả | Bước 2 và bước 6 của Demo script tách được hai khả năng. Nếu API sai thì UoW này vẫn đúng phần "không mang kệ mặt hàng trước", và mở defect riêng cho `preferred-shelf` |
| `await` promise kệ làm chậm mỗi lần Thêm | ADR-05 không đặt timeout nhân tạo; đo ở bước 5 của demo. Nếu cản nhịp quét thì mở lại ADR-05 |
| Không có test tự động cho lát cắt này (ADR-06) | Demo script cố tình có bước 4 (Enter thật nhanh) và bước 5 (lặp 10 lần xen kẽ) — đây là chỗ lỗi cũ lộ ra |

## Definition of done

- [x] AC-10, AC-11, AC-12 đều pass — kiểm cả trên bảng lẫn `temp_warehouse_lines`, xem `07-evidence.md`
- [ ] Demo script chạy hết 6 bước bằng máy quét thật; bước 5 đạt 10/10 — mới quét 3 lần bằng bàn phím ảo, chưa chặn mạng
- [x] Không lần nào ô *Vị trí* hiện kệ của mặt hàng quét trước đó
- [x] `npx vitest run` xanh trong `apps/pos-web`
- [x] `pnpm --filter @erp/pos-web build` xanh
- [ ] Demoed và được chấp nhận ở gate G4
