---
id: UOW-01
slug: quet-ma-enter-them-dong
title: Quét mã khớp tuyệt đối rồi Enter là dòng vào bảng
demoable: true
duration: 2d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-13]
risk: medium
status: todo
rollback: revert commit của UoW — không có migration, không có cờ tính năng, không có state lưu bền nào đổi
---

# UOW-01 — Quét mã khớp tuyệt đối rồi Enter là dòng vào bảng

Lát cắt này dựng **đường chọn-hàng-rồi-thêm-dòng duy nhất** (ADR-01, ADR-03, ADR-04) và
gỡ khung "Không có kết quả." treo (AC-13). Hai UoW sau đều mọc trên đường này.

## Demo script

1. Đăng nhập POS, chọn chi nhánh có kho tạm đang mở, vào **Chuyển kho nhanh**
   (`/fast-stock-transfer`), tab **Xuất đi**.
2. Chọn *Người vận chuyển* một lần.
3. Quét mã vạch của một mặt hàng **đã gán mã vạch** → dòng vào bảng ngay, không chạm chuột.
4. Quét tiếp 2 mã nữa **không đụng vào ô Người vận chuyển** → cả 2 dòng vào bảng, ô
   *Người vận chuyển* vẫn giữ nguyên người đã chọn, con trỏ luôn nằm ở ô *Hàng hóa*.
5. Nhìn ngay dưới ô *Hàng hóa* sau mỗi lần quét → **không** có khung "Không có kết quả."
   nào treo lại.
6. Xóa *Người vận chuyển*, quét lại một mã → không có dòng nào thêm, hiện
   "Vui lòng chọn người vận chuyển.", con trỏ nhảy về ô *Người vận chuyển*.
7. Bấm Enter trên ô *Hàng hóa* đang trống → không có gì xảy ra, không báo lỗi.
8. Đổi sang tab **Trả lại**, lặp lại bước 2–4 → hành vi y hệt.

## In scope

- Bảng quyết định phím Enter tách thành hàm thuần `decideScanOutcome`.
- Bỏ auto-select khỏi adapter tìm kiếm; xóa `claimRef` / `resetLookupGuard`.
- `handleAddRow` thành async, đọc draft bằng `store.getState()`, giữ *Người vận chuyển*,
  chặn Enter dồn khi đang POST.
- `PosSearchPopover` nhận `popoverRef` để đóng popover bằng lệnh (mặc định không đổi gì).
- Focus: thêm xong → về ô *Hàng hóa*; thiếu carrier → về ô *Người vận chuyển*.

## Not in scope

- Highlight dòng đầu trong dropdown khi mã không khớp tuyệt đối (UOW-02).
- Ô *Vị trí* (UOW-03) — trong lát cắt này ô đó vẫn giữ hành vi cũ, xem Risks.

## Risks

| Risk | Mitigation |
|---|---|
| Demo ở bước 3 vẫn có thể lưu **kệ của mặt hàng quét trước** vì UOW-03 chưa làm | Cả 3 UoW ship chung một nhánh; không merge lẻ UOW-01. Khi demo UoW này chỉ nghiệm phần dòng-vào-bảng, chưa nghiệm cột *Vị trí* |
| `handleAddRow` thành async có thể đẻ ra double-submit khi quét nhanh (A-06) | AC-05 + T-01-04 chặn bằng `addLineMutation.isPending`; nghiệm ở bước 4 của demo bằng máy quét thật |
| Đọc `getState()` bám vào việc draft nằm ở Zustand (ADR-01) | Ghi rõ trong ADR-01; nếu draft đổi sang `useState` thì ADR gãy và phải mở lại |

## Definition of done

- [x] AC-01, AC-02, AC-03, AC-04, AC-05, AC-13 đều pass — click-through 2026-08-19, cả 6, xem `07-evidence.md`
- [ ] Demo script chạy hết 8 bước bằng **máy quét thật**, 0 lần chạm chuột ở bước 3–4 — bước 2–7 đã xong bằng bàn phím ảo; còn bước 8 (tab *Trả lại*) và việc dùng máy quét thật (A-06)
- [x] `npx vitest run` xanh trong `apps/pos-web` (7 test cũ + test mới của `decideScanOutcome`)
- [x] `pnpm --filter @erp/pos-web build` xanh
- [x] `git diff --name-only` không có file nào của Checkout / Đổi trả hàng / `apps/api`
- [ ] Demoed và được chấp nhận ở gate G4
