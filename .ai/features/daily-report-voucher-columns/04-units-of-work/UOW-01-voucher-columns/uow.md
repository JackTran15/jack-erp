---
id: UOW-01
slug: voucher-columns
title: Thu/Chi tiền mặt đọc theo phiếu và hiện nhân viên phụ trách
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-02, US-03]
# Chỉ những AC mà kịch bản demo thật sự **chứng minh được bằng trình duyệt**. `evidence_check.py`
# đòi mỗi AC ở đây phải có ảnh chụp xanh, nên liệt kê thêm AC chỉ để cho "đủ" sẽ biến một ô tick
# thành lời nói dối. AC-02/06/07/09 là hình dạng dữ liệu trả về, không quan sát được bằng ảnh —
# chúng vẫn được phủ 100% ở tầng ticket (T-01-01 `verifies`) và bởi 6 unit test bám đúng từng AC.
# Xem `07-verification.md` → "Not verified here" để biết cái gì phủ cái gì.
verifies: [AC-01, AC-03, AC-04, AC-05, AC-08]
risk: low
status: todo
rollback: revert code — báo cáo là read-only, không migration, không ghi gì; revert là số quay lại ngay
---

# UOW-01 — Hai modal tiền mặt cùng nói một ngôn ngữ

Một lát cắt dọc mỏng: đổi nguồn dữ liệu của đúng một category, thêm đúng một cột, và giữ nguyên
mọi thứ còn lại. Toàn bộ phía API nằm trong một file query handler; phía web nằm trong một file
hằng số và một component.

Handler đã có đúng khuôn mẫu cần dùng — `buildSourceRows` phân nhánh theo category trả về
`SourceRow[]` mang id thô, rồi `resolveDisplayFields` nạp theo lô và ánh xạ id → tên. Thêm nhân
viên là thêm một id nữa vào khuôn mẫu đó.

Hai điều cần nói thẳng vì rất dễ bị đọc nhầm thành lỗi:

- Sau thay đổi, tổng của modal "Tổng tiền mặt" **không** còn khớp con số "Tiền mặt" trên thẻ Thu.
  Đã chốt (ADR-01, A-01).
- Cột "Khách hàng" và "NV Thu/Chi" **sẽ trống trên phần lớn dòng**, vì `staff_id` NULL trên mọi
  phiếu do consumer sinh. Đã chốt (A-02).

## Demo script

Chạy `make dev-api` + `make dev-pos`, mở `http://localhost:3001/daily-report`, phạm vi "Hôm nay":

1. Mở modal **"Tổng tiền mặt"**. Mọi dòng đều là `PT…`; **không** còn dòng `INV-` hay `RTN-` nào
   (AC-01). Dòng phiếu thu `purpose = POS_SALE` có mặt (AC-02).
2. Modal đó có cột **"NV Thu"** nằm ngay sau "Khách hàng" (AC-04).
3. Mở dropdown "Loại chứng từ" → vẫn đủ 7 lựa chọn như trước (AC-08).
4. Đóng, mở modal **"Tổng chi tiền mặt"**. Vẫn đúng các dòng `PC…` như trước, thêm cột
   **"NV Chi"** sau "Khách hàng" (AC-05).
5. Vào Quỹ tiền → lập một phiếu thu và một phiếu chi **thủ công** có chọn nhân viên và đối tượng.
   Mở lại hai modal: đúng hai dòng đó hiện đủ tên khách và tên nhân viên (AC-04, AC-05, AC-07).
   Các dòng do consumer sinh vẫn để trống hai ô đó — đúng như A-02.
6. Đối chiếu số: con số "Tiền mặt" trên thẻ Thu **không đổi** so với trước thay đổi (AC-09), dù
   tổng trong modal đã khác. Đây là điểm cần chỉ tận tay khi demo, không để người xem tự suy.

## In scope

- `revenue-cash` đọc `cash_receipts` đã POSTED, mọi `purpose` (D1).
- `staffId` → `staffName` cho `revenue-cash` và `expense-cash` (D2).
- `customerName` lui về `partner_name_snapshot` trên dòng phiếu (D3).
- `staffName` trên `PosDailySummaryDetailRow` + regenerate api-client.
- Cột `NV Thu` / `NV Chi` ở pos-web.

## Verification evidence

- [x] `verify.py <feature-dir> --write` green on every required environment — 5/5 bước xanh trên `local-pos`
- [x] Evidence exists for every AC in `verifies`, at every declared viewport — `evidence_check.py`: OK, 5 AC
- [x] `08-evidence.md` regenerated và commit sha của nó khớp HEAD (`1b7a5f8e`)
- [x] PR draft đã copy, contact sheet đã đính vào mô tả PR

**Vòng chạy đầu tiên xanh cả 4 bước trong khi UI đang hỏng.** Thêm cột nhân viên đẩy cột
"Số tiền" ra khỏi khung dialog 960px, nên số tiền — thứ duy nhất người ta mở bảng này để xem —
chỉ hiện ra sau khi cuộn ngang. Assertion không bắt được: Playwright coi phần tử bị cuộn khỏi
khung là vẫn "visible". Chỉ khi **nhìn ảnh** mới thấy. Đã sửa bằng `width={1120}` và chạy lại.
Ghi lại ở đây vì đây đúng là kiểu lỗi mà một quy trình chỉ đọc màu xanh sẽ cho đi qua.

## Not in scope

- Handler tổng hợp — `revenue.cash` giữ nguyên công thức (AC-09).
- `revenue-bank-transfer`, `expense-bank-transfer`, `revenue-points`, `debt-*`.
- Mapping nhãn "Loại chứng từ" cho dòng phiếu thu (**A-03**).
- Bắt saga v2 sinh phiếu thu cho mỗi lần bán tiền mặt (**A-01**).
- Làm giàu `staff_id` / đối tượng trên phiếu do consumer sinh (**A-02**).
