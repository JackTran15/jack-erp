---
id: UOW-02
slug: fill-down
title: Copy xuống giá trị giảm trên lưới Giảm giá hàng hóa
demoable: true
duration: 0.5d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-05, AC-06, AC-07, AC-08]
risk: low
status: todo
rollback: revert T-02-01 — cột icon biến mất, không có dữ liệu
---

# UOW-02 — Copy xuống giá trị giảm trên lưới Giảm giá hàng hóa

## Demo script
1. Mở form *Giảm giá hàng hóa*, phạm vi *Hàng hóa*, phương thức *%*
2. Chọn 4 hàng, đặt giá trị `30, 10, (trống), 5`
3. Bấm icon copy xuống ở dòng 1 → cả 4 dòng thành `30`; dòng trống cuối không đổi, không có icon
4. Đổi `10` ở dòng 2, bấm copy xuống ở dòng 2 → dòng 1 giữ `30`, dòng 3–4 thành `10`
5. Chuyển *Đồng giá* → cột icon biến mất; chuyển phạm vi *Nhóm hàng hóa* + *Số tiền* → icon hoạt động

## In scope
- Cột thao tác copy xuống + handler `copyValueDown`

## Not in scope
- Nhân bản dòng (A-36 của feature cũ đã bỏ)
- Copy lên / copy vào ô trống

## Risks
| Risk | Mitigation |
| --- | --- |
| `LineItemGrid` chỉ có một cột thao tác (xoá) | Theo mẫu `BarcodeLabelGrid` — cột readonly `key: "copy"` riêng, không sửa `@erp/ui` |

## Definition of done
- [x] **(trước khi merge)** AC-05..AC-08 có ảnh chụp trong `07-verification.md`
- [x] `tsc --noEmit` của backoffice-web sạch
- [x] Không file nào ngoài `touches:` bị đụng
