---
id: UOW-02
slug: document-type-labels
title: Cột Loại chứng từ phân biệt được các dòng phiếu thu
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-04]
# Chỉ AC quan sát được bằng trình duyệt — xem ghi chú cùng chỗ ở UOW-01.
# AC-12 (không phụ thuộc `reason`) và AC-13 (hoá đơn ngoài cửa sổ ngày) là hình dạng dữ liệu,
# phủ bằng unit test ở T-02-01.
verifies: [AC-10, AC-11, AC-14]
# S6/S7/S8 trong 07-verification.md phủ ba AC này.
risk: low
status: todo
rollback: revert code — báo cáo là read-only, không migration; revert là nhãn quay lại như cũ
---

# UOW-02 — Nhãn nói đúng dòng tiền đó là gì

UOW-01 làm modal Thu đọc theo phiếu, nhưng cố ý giữ nguyên nhánh gắn nhãn hai chiều
(`DEBT_COLLECTION ? 'Thu nợ' : 'Thu khác'`) vì lúc đó chưa có quyết định nghiệp vụ (A-03). Hệ
quả nhìn thấy được: **6/6 dòng trong ngày đều đọc là "Thu khác"** — cột tồn tại nhưng không nói
gì. Đây là phần trả nợ đó.

Nhãn suy từ `purpose` + `referenceType` + join `reference_id → invoices.type` (ADR-03), **không**
parse `reason` (ADR-04 nói cách nạp hoá đơn).

## Demo script

Mở `http://localhost:3001/daily-report`, phạm vi "Hôm nay":

1. Mở modal **"Tổng tiền mặt"**. Cột "Loại chứng từ" **không còn** toàn "Thu khác" (AC-10, AC-11).
2. `PT000007` đọc là **"Đổi trả, mua thêm"** — không phải "Đổi trả". Chứng từ nguồn của nó mã
   `RTN-202608-00010` nhưng hoá đơn là EXCHANGE; đây chính là ca chứng minh nhãn suy từ
   `invoices.type` chứ không từ mã hay từ `reason` (AC-10).
3. `PT000003`…`PT000006`, `PT000008` đọc là **"Huỷ trả hàng"** (AC-11).
4. Mở dropdown "Loại chứng từ" → có thêm lựa chọn **"Huỷ trả hàng"**, và 7 lựa chọn cũ vẫn còn
   (AC-14, không phá AC-08).
5. Chọn "Huỷ trả hàng" trong dropdown → bảng lọc còn đúng 5 dòng.

## In scope

- Hàm gắn nhãn cho dòng phiếu thu, thứ tự nhánh theo ADR-03.
- Nạp hoá đơn nguồn theo `reference_id` bằng truy vấn riêng (ADR-04).
- Thêm `"Huỷ trả hàng"` vào `DAILY_SUMMARY_DETAIL_DOCUMENT_TYPES` của `RevenueCash`.

## Not in scope

- Gỡ `"Hoàn tiền mặt"` khỏi dropdown (**A-08** — Akenzy chưa quyết, giữ nguyên).
- Nhãn cho `INTER_BRANCH_IN` — hiện 0 dòng, để rơi vào `"Thu khác"` cho tới khi có dữ liệu thật.
- Tách `RETURN_CANCEL` thành hai nhãn theo loại phiếu gốc (**A-09**).
- `expense-cash` — phiếu chi không có cột "Loại chứng từ".

## Verification evidence

- [x] `verify.py <feature-dir> --write` green on every required environment — 8/8 bước xanh
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated và commit sha của nó khớp HEAD
- [x] PR draft đã copy, contact sheet đã đính vào mô tả PR
