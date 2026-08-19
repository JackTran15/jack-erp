---
id: UOW-02
slug: chon-hang-bang-ban-phim
title: Mã không khớp tuyệt đối vẫn chọn được hàng bằng bàn phím
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-06, AC-07, AC-08, AC-09]
risk: medium
status: todo
rollback: revert commit của UoW — prop `autoHighlightFirst` mặc định `false` nên gỡ nó ra là mọi thứ về hành vi cũ
---

# UOW-02 — Mã không khớp tuyệt đối vẫn chọn được hàng bằng bàn phím

Đây là lát cắt trả lời trực tiếp câu than trong báo lỗi: *"phải nhấn chọn sp ở option dưới
select"*. Nó chỉ chạm được sau UOW-01 vì "Enter chọn dòng đang nổi **rồi thêm dòng**" cần
đường thêm-dòng của UOW-01.

## Demo script

1. Ở tab **Xuất đi**, chọn *Người vận chuyển*.
2. Quét (hoặc gõ) một mã **chưa gán mã vạch** — chuỗi rơi về tìm gần đúng và ra nhiều
   mặt hàng → dropdown mở với **dòng đầu đã sáng sẵn**.
3. Bấm Enter → mặt hàng ở dòng sáng được chọn và dòng vào bảng ngay. Không chạm chuột.
4. Lặp lại bước 2, bấm **mũi tên xuống hai lần** rồi Enter → mặt hàng thứ ba vào bảng.
5. Gõ một chuỗi rác không ra kết quả nào → dropdown hiện "Không có kết quả.", Enter không
   thêm dòng, chuỗi vẫn còn trong ô để sửa.
6. **Kiểm hồi quy:** mở màn **Bán hàng** (Checkout), gõ vào ô tìm hàng → **không** dòng nào
   sáng sẵn, Enter hành xử y như trước. Mở một dropdown `PosSelect` bất kỳ (vd *Kho xuất*)
   → cũng không dòng nào sáng sẵn.

## In scope

- Prop `autoHighlightFirst` trên `PosSearchPopover`, mặc định `false` (ADR-02).
- Bật prop cho hai ô của Kho tạm (*Hàng hóa* và *Người vận chuyển*).
- Nhánh `suggest` / `empty` trong đường Enter.

## Not in scope

- Đổi hành vi Checkout, Đổi trả hàng, hay bất kỳ `PosSelect` nào — ngược lại, bước 6 của
  Demo script tồn tại để chứng minh chúng **không** đổi.
- Sửa dữ liệu mã vạch thiếu (việc dữ liệu, xem Out of scope trong intent).

## Risks

| Risk | Mitigation |
|---|---|
| Sáng sẵn dòng đầu → thủ kho Enter theo phản xạ và thêm **nhầm mặt hàng** khi danh sách nhiều dòng | Đây là đánh đổi đã được chốt (A-02). Giảm rủi ro bằng cách giữ nguyên `renderMeta` hiện có (hiện mã SKU dưới tên) để dòng sáng đọc được ngay |
| Đổi `PosSearchPopover` vô tình lây sang `PosSelect` → mọi dropdown POS đổi hành vi Enter | Mặc định `false` + bước 6 của Demo script + T-02-03 đọc `git diff --name-only` |

## Definition of done

- [x] AC-06, AC-07, AC-08, AC-09 đều pass — click-through 2026-08-19, xem `07-evidence.md`
- [x] Demo script chạy hết 6 bước, gồm cả bước hồi quy Checkout / `PosSelect`
- [x] `git diff --name-only` không có file nào dưới `components/page-components/Checkout/`
- [x] `npx vitest run` xanh trong `apps/pos-web`
- [x] `pnpm --filter @erp/pos-web build` xanh
- [ ] Demoed và được chấp nhận ở gate G4
