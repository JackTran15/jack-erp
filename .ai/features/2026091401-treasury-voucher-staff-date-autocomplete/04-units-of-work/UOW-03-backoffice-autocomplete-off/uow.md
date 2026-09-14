---
id: UOW-03
slug: backoffice-autocomplete-off
title: Ô nhập trên backoffice không còn dropdown lịch sử của trình duyệt
demoable: true
duration: 1d
depends_on: []
requirements: [US-03]
verifies: [AC-15, AC-16, AC-17, AC-18]
risk: low
status: todo
rollback: revert commit — chỉ là thuộc tính HTML, không dữ liệu, không hợp đồng API
---

# UOW-03 — Tắt autocomplete trên backoffice

`Input`, `TagsInput`, `MultiSelectChips` của `@erp/ui` mặc định `autocomplete="off"` (T-03-01); các `<input>` dạng text
viết tay trong backoffice nhận thuộc tính tại chỗ (T-03-02). Quyết định của Akenzy ngày 14/09/2026: toàn backoffice,
POS không đổi, đăng nhập / đổi mật khẩu giữ token riêng (A-02).

## Demo script

Môi trường `local-backoffice`, Chrome **có** lịch sử nhập (dùng chính Chrome từng hiện dropdown trong ảnh 5–7; profile
sạch không chứng minh được gì vì không có gì để gợi ý).

1. Kho hàng › Chuyển kho › Thêm mới phiếu chuyển kho → focus ô Đối tượng, gõ "A". Chỉ bảng gợi ý của ứng dụng hiện,
   không có dropdown đen của Chrome. DevTools › Elements: `input[role="combobox"]` mang `autocomplete="off"`. Chụp ảnh.
2. Cùng dialog: ô "Tên đối tượng" và ô "Tìm mã/tên" ở dòng chi tiết → `autocomplete="off"`, không dropdown.
3. Phiếu xuất kho → ô "Chọn cửa hàng đích" → `autocomplete="off"`, không dropdown. Chụp ảnh.
4. Quỹ tiền › Thu, chi tiền mặt → ô lọc cột "Giá trị…" → `autocomplete="off"`.
5. Console trên 3 màn trên:
   `[...document.querySelectorAll('input')].filter(i => !['checkbox','radio','file','date','hidden'].includes(i.type) && i.autocomplete !== 'off').length`
   ⇒ `0`.
6. Đăng xuất → trang đăng nhập: ô email `autocomplete="username"`, ô mật khẩu `autocomplete="current-password"`; Chrome
   vẫn đề xuất tài khoản đã lưu.

## In scope

- `packages/ui/src/components/{input,tags-input,multi-select-chips}.tsx`.
- `<input>` dạng text / search / number / tel / email viết tay trong `apps/backoffice-web/src`.

## Not in scope

- `pos-web` (A-02). Ô `type="date"`, checkbox, radio, file.
- Guard tự động chặn `<input>` mới quên thuộc tính (ADR-05).

## Risks

| Risk | Mitigation |
| --- | --- |
| Chrome bỏ qua `off` trên ô nó đoán là địa chỉ (A-13) | Demo trên Chrome có lịch sử thật; ô nào vẫn hiện dropdown thì ghi vào summary và báo Akenzy, không tự chế token |
| Đè mất token của ô đăng nhập | `autoComplete="off"` đặt trước `{...props}`; T-03-01 test giá trị truyền vào thắng; demo bước 6 |

## Definition of done

- [x] AC-15 … AC-18 pass — kiểm thuộc tính trên trình duyệt 14/09/2026 (T-03-01, T-03-02) + test T-03-01
- [x] Test `autocomplete-off.test.tsx` xanh — 5/5 (T-03-01)
- [x] Script quét ở T-03-02 báo 0 ô text-like viết tay thiếu `autoComplete` — chỉ còn dòng comment trong `LookupField.tsx`, đúng ngoại lệ đã ghi
- [x] Demo 6 bước chạy trên `local-backoffice`, ảnh chụp lưu vào evidence — 14/09/2026, Chrome của Akenzy: dialog chuyển kho 23/23 ô text mang `off` (Đối tượng, Tên đối tượng, Tìm mã/tên), gõ "A" chỉ hiện bảng gợi ý của ứng dụng; phiếu xuất kho mục đích "Điều chuyển đến cửa hàng khác" ô "Chọn cửa hàng đích" mang `off`; lưới Thu, chi tiền mặt 6/6 và lưới Chuyển kho 5/5; trang đăng nhập giữ `organization` / `username` / `current-password`. **Giới hạn**: ảnh chụp của extension không bắt được dropdown gốc của Chrome, nên bằng chứng là thuộc tính, không phải việc dropdown biến mất. Ảnh: `evidence/uow03-stock-transfer-doi-tuong-autocomplete-off.jpg`, `evidence/uow03-goods-issue-cua-hang-dich-autocomplete-off.jpg`
- [x] Demoed and accepted at gate G4 — Akenzy kiểm trên trình duyệt cùng orchestrator và "mark done" 14/09/2026
