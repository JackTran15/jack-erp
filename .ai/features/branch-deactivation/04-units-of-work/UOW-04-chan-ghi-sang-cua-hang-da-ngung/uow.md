---
id: UOW-04
slug: chan-ghi-sang-cua-hang-da-ngung
title: Không tạo được chứng từ liên chi nhánh trỏ tới cửa hàng đã ngừng
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-04]
verifies: [AC-16, AC-17, AC-18, AC-19]
risk: medium
status: todo
rollback: revert 2 commit; chỉ thêm kiểm tra đầu vào, không đụng dữ liệu đã ghi
---

# UOW-04 — Chặn đường ghi

Ẩn khỏi ô chọn (UOW-02) mới chỉ chặn được người dùng cẩn thận. Gọi thẳng API thì vẫn tạo được
lệnh điều chuyển tới một cửa hàng đã đóng, và hàng sẽ kẹt ở đó.

Khảo sát cho thấy chỗ này còn hổng hơn dự kiến: cả ba đường ghi liên chi nhánh **chỉ kiểm
`đích !== nguồn`**. Không kiểm tồn tại, không kiểm cùng tổ chức. Một UUID của tổ chức khác cũng
lọt (AC-19) — lỗ hổng có sẵn, sửa luôn trong cùng một hàm kiểm tra.

## Demo script

1. Ngừng hoạt động Hà Nội
2. `curl POST /transfer-orders` với `destinationBranchId` = Hà Nội → 400, thông báo tiếng Việt
3. `curl PATCH /transfer-orders/:id` đổi đích sang Hà Nội → 400
4. Gọi `createAndConfirmExport` với `targetBranchId` = Hà Nội → 400
5. Tạo phiếu chuyển quỹ tiền mặt và phiếu chuyển tiền gửi với `toBranchId` = Hà Nội → 400
6. Lặp bước 2 với một UUID ngẫu nhiên không thuộc tổ chức → 400 (hôm nay đang tạo thành công)
7. Mở lại hoạt động Hà Nội → bước 2 thành công như cũ

## In scope

- `TransferOrderService.create` (`:172`), `update` (`:810`), `createAndConfirmExport` (`:225`)
- `DepositTransferService.create` (`:76`), `CashTransferService.create` (`:86`)
- Một hàm kiểm tra dùng chung: tồn tại + cùng tổ chức + `ACTIVE`

## Not in scope

- Chứng từ đã tạo từ trước trỏ tới cửa hàng nay đã ngừng — vẫn xem, vẫn in, vẫn nhận được
  bình thường (AC-23). Chỉ chặn tạo mới

## Risks

| Risk | Mitigation |
|---|---|
| Siết kiểm tra có thể chặn nhầm luồng đang chạy (vd hàng đang trên đường về) | Chỉ chặn *tạo mới*; đường nhận hàng của lệnh cũ không đụng tới. e2e phải phủ ca "nhận hàng từ lệnh cũ sau khi chi nhánh nguồn bị ngừng" |
| AC-19 sửa một lỗ hổng ngoài yêu cầu ban đầu | Nêu rõ trong PR; cùng một hàm kiểm tra nên không phát sinh việc riêng |

## Definition of done
- [ ] AC-16..AC-19 pass
- [ ] Nhận hàng từ lệnh điều chuyển cũ vẫn chạy khi chi nhánh đối tác đã ngừng
- [ ] Demo được chấp nhận ở G4
