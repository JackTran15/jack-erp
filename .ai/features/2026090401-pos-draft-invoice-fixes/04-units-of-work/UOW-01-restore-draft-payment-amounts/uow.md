---
id: UOW-01
slug: restore-draft-payment-amounts
title: Phiếu lưu tạm mở lại giữ đúng số tiền đã nhập
demoable: true
duration: 2d
depends_on: [UOW-02]
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05]
risk: medium
status: todo
rollback: revert 4 commit của UoW; cột `draft_payments` để lại nullable, không ai đọc thì không ảnh hưởng gì
---

# UOW-01 — Phiếu lưu tạm mở lại giữ đúng số tiền đã nhập

## Demo script
1. Đăng nhập POS local (:3001), chọn chi nhánh có hàng tồn.
2. Thêm 1 mặt hàng 595.000 vào giỏ. Ô "Tiền mặt" tự điền 595.000; sửa tay thành 600.000.
3. Bấm "Lưu tạm (F10)". Tab đóng lại, phiếu vào "HĐ lưu tạm".
4. Mở "HĐ lưu tạm", chọn đúng phiếu vừa lưu, bấm "Đồng ý".
   → Tab mới hiện "Còn phải thu 595.000" **và** "Tiền mặt 600.000", "Trả lại khách 5.000".
5. Thêm 1 mặt hàng 100.000 vào tab đó.
   → "Còn phải thu 695.000", "Tiền mặt" tự nhảy 695.000.
6. Chia tiền thành 2 dòng (Tiền mặt 300.000 + Chuyển khoản 395.000), lưu tạm, mở lại.
   → Hai dòng quay lại đủ cả phương thức, số tiền và tài khoản nhận.
7. Mở một phiếu nháp cũ (tạo trước khi có cột `draft_payments`, hoặc `UPDATE invoices SET
   draft_payments = NULL` trên một phiếu nháp).
   → Tab mới hiện một dòng "Tiền mặt" bằng đúng "Còn phải thu".

## In scope
- Cột `draft_payments` + migration viết tay.
- `payments` trên `CreateInvoiceDto` / `UpdateInvoiceDto`, lưu ở `InvoiceService.create/update`.
- pos-web: gửi snapshot khi lưu tạm, đọc snapshot khi khôi phục, và thôi ghi đè số vừa khôi phục.

## Not in scope
- Khôi phục khuyến mại / điểm / cờ "Tính vào công nợ" của phiếu nháp — chỉ dòng thanh toán.
- Xoá `draft_payments` khi nháp thành hoá đơn (ADR-05).
- Cảnh báo tồn trên tab khôi phục (UOW-02).

## Risks
| Risk | Mitigation |
| --- | --- |
| ADR-01 đổi hành vi auto-fill cho **mọi** tab, không riêng tab khôi phục (A-01) | T-01-05 phải chứng minh cả 3 ca: tab mới, tab khôi phục, tab sau reload. Demo bước 5 là ca dễ hỏng nhất |
| `migration:generate` sinh drift khổng lồ trên repo này | T-01-01 viết tay migration, không chạy generate |
| Snapshot rác/nửa vời từ dữ liệu tay | Mapper FE rơi về nhánh "nháp cũ" thay vì ném lỗi (AC-03) |
| T-01-04 ghi cùng `checkout-session.store.ts` và file test của nó với UOW-02 | Không phải phụ thuộc nghiệp vụ mà là ràng buộc tuần tự hoá: UOW-02 nhỏ và ít rủi ro hơn nên chạy trước, T-01-04 khai `depends_on: [T-02-02]` để hai bên không tranh file |

## Definition of done
- [x] AC-01..AC-03 pass (test store + mapper), AC-04 và AC-05 đo trực tiếp trên POS local
- [x] `pnpm --filter @erp/api test` — 3521 pass; `apps/pos-web` — 163 pass
      (2 fail `auth.service.spec.ts` + 3 fail `api-axios.test.ts` đều có sẵn, đã đối chiếu trên cây sạch)
- [x] Migration `1789700000000` chạy được và revert được trên `erp_dev`
- [x] `npm run openapi:generate` đã chạy; `openapi.snapshot.json` + `schema.ts` chỉ có thêm
- [x] Demo bước 7 (phiếu nháp cũ) chạy trên trình duyệt: `DRAFT-1787570592232` mở lại ra
      "Tiền mặt 750.000" / "Trả lại khách 0" — ảnh `evidence/local-pos/desktop/S4.png`
- [ ] Demo bước 2–6 (gõ tiền → lưu tạm → mở lại, chia 2 dòng) **chưa chạy trên trình duyệt**:
      đó là chuỗi ghi dữ liệu, đã đo tay ở T-01-03/04/05 và khoá bằng test đơn vị
- [ ] Chưa commit

## Verification evidence
- [x] `verify.py <feature-dir> --write` green on every required environment (local-pos, 4/4 bước)
- [x] Evidence exists for every AC in `verifies`, at every declared viewport
- [x] `08-evidence.md` regenerated và commit sha khớp HEAD (`b75fd7cf`)
- [ ] PR draft copied và contact sheet đính vào mô tả PR — chưa mở PR
