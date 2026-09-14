---
id: UOW-01
slug: treasury-voucher-print-staff
title: Bản in và Excel của 4 loại phiếu quỹ có dòng nhân viên thu/chi, nhãn ký theo loại phiếu, không còn dòng quỹ / tài khoản
demoable: true
duration: 2d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09]
risk: medium
status: todo
rollback: revert các commit của UoW — không migration, không dữ liệu nào đổi
---

# UOW-01 — In / Xuất phiếu quỹ có nhân viên thu/chi

Kết quả cuối: khối thông tin có dòng "Nhân viên thu/chi" ngay trước "Lý do", không còn dòng quỹ / tài khoản; cột ký đầu
tiên ghi "Nhân viên thu" / "Nhân viên chi"; không in sẵn tên nào dưới chữ ký.

Plan đổi hai lần trong lúc làm, cả hai sau khi Akenzy xem bản in / bản xuất thật ngày 14/09/2026:
1. Nhãn cột ký đầu tiên "Người lập phiếu" → "Nhân viên thu/chi" (A-16, ADR-07, T-01-06).
2. Bỏ tên in sẵn dưới chữ ký (A-17, ADR-08): T-01-07 gỡ ở mapper / service / resolver, T-01-08 gỡ khả năng in tên mà
   T-01-01 đã thêm vào payload và hai renderer.

Các ticket đã xong trước đó vẫn đứng: T-01-02 (resolver về `cash-vouchers/shared`, `staffLabel`), T-01-03 / T-01-04
(dòng nhân viên, bỏ dòng quỹ / tài khoản). E2E khoá kết quả cuối (T-01-05).

## Demo script

Môi trường `local-backoffice`, DB `erp_dev_3008`, chi nhánh "Chi nhánh MT211 Đà Nẵng". Không reload trang sau khi đăng
nhập (phiên không giữ qua reload trên máy này). Nút In mở hộp thoại in của Chrome — người demo xem bản xem trước in, hoặc
chặn `print()` trong iframe để đọc HTML.

1. Quỹ tiền › Tiền mặt › Thu, chi tiền mặt → mở **PC000044** (Nhân viên chi "003 Huỳnh Văn Trường", tạo bởi "Admin User")
   → In. Bản in: dòng "Nhân viên chi: 003 Huỳnh Văn Trường" ngay trước "Lý do"; không có "Quỹ tiền mặt"; cột ký đầu tiên
   "Nhân viên chi"; dưới bốn cột ký không có tên nào; không có "Admin User". Chụp ảnh.
2. Cùng phiếu → Xuất khẩu → mở .xlsx: dòng "Nhân viên chi", không "Quỹ tiền mặt" / "Người lập phiếu", hàng chữ ký bắt
   đầu bằng "Nhân viên chi", không có hàng tên dưới "(Ký, họ tên)". Chụp ảnh.
3. Mở **PT004767** (Nhân viên thu "002 Nguyễn Nhựt Hào") → In: dòng "Nhân viên thu", cột ký đầu tiên "Nhân viên thu",
   không tên dưới chữ ký.
4. Phiếu tiền gửi: tài khoản demo không có chi nhánh chứa phiếu tiền gửi có nhân viên (NTTK000015 ở "Hồ Chí Minh" không
   có trong danh sách chi nhánh của tài khoản) ⇒ bằng chứng cho tiền gửi là spec của T-01-07 và e2e T-01-05.
5. Kho hàng › một phiếu nhập kho bất kỳ → In: cột ký đầu tiên vẫn "Người lập phiếu", không tên nào dưới chữ ký.

## In scope

- 4 mapper quỹ, `TREASURY_PRINT_LABELS.staffLabel`, `getPrintPayload` của 4 service.
- Chuyển `VoucherStaffResolver` về `cash-vouchers/shared`.
- Hoàn tác `signatureNames` khỏi payload, renderer In, writer Excel.
- E2E In / Xuất cho 4 loại phiếu quỹ.

## Not in scope

- Danh sách Thu, chi tiền mặt (UOW-02).
- Mapper phiếu kho — không sửa (AC-09).
- Dialog phiếu quỹ trên backoffice — nút In / Xuất khẩu đã gọi đúng route, không đổi. Ô "Nhân viên chi" trên dialog có thể
  hiện trống dù phiếu có nhân viên (quan sát trên PC000044) — có từ trước feature, ngoài phạm vi.
- Sửa fixture `voucher-print-payload.e2e-spec.ts` (`transfer_order_lines.line_no` NOT NULL) — lỗi có sẵn, ngoài phạm vi.

## Risks

| Risk | Mitigation |
| --- | --- |
| Hoàn tác T-01-01 đè mất thay đổi khác trên renderer / writer | T-01-08 kiểm `git diff main` trước; chỉ đưa về `main` khi diff đúng là T-01-01 |
| Chuyển file resolver làm vỡ DI của module tiền gửi | T-01-02 đã chạy spec 2 service tiền gửi và `nest build` xanh |
| `@erp/shared-interfaces` chưa build lại sau khi gỡ trường | T-01-08 chạy `pnpm build:shared` trong done-when |

## Definition of done

- [x] AC-01 … AC-09 pass — AC-01..08: spec mapper / service / resolver (T-01-02..T-01-04, T-01-06, T-01-07) và e2e `treasury-voucher-export` 16/16 (T-01-05); AC-09: khuôn in (payload, renderer, writer) trùng `main`, không file `modules/inventory` nào đổi (kiểm `git diff main` 14/09/2026)
- [x] Spec mapper, service, resolver, writer, renderer và e2e `treasury-voucher-export` xanh — T-01-07: 8 suites / 168 tests + cả module accounting 52 suites / 599 tests; T-01-08: writer 23/23, renderer 26/26, mapper 56/56; T-01-05: e2e 16/16
- [x] Demo 5 bước chạy trên `local-backoffice`, ảnh chụp bản in và file xlsx lưu vào evidence — **chạy một phần, trên code trung gian**: 14/09/2026 in PC000044 / PT004767 trên trình duyệt sau T-01-06 (dòng "Nhân viên chi/thu" trước "Lý do", không "Quỹ tiền mặt", nhãn ký "Nhân viên chi/thu" — nhưng khi đó còn tên dưới chữ ký, phần sau đó bị A-17 gỡ). **Bản in trên code cuối (sau T-01-07/T-01-08) chưa chạy trên trình duyệt** — phiên backoffice bị đăng xuất; hành vi cuối được khẳng định bằng e2e `treasury-voucher-export` 16/16 (T-01-05), gồm cả nội dung file xlsx. Không có ảnh bản in cuối; phiếu tiền gửi không demo được trên tài khoản này. Akenzy nghiệm thu bằng bằng chứng test ("mark done", 14/09/2026)
- [x] Không file phiếu kho nào trong diff; `git diff main` của renderer / writer / payload rỗng — `git diff main --name-only -- apps/api/src/modules/inventory` rỗng; `git diff main --stat` của `voucher-payload.ts`, `render-voucher-html.ts`, `voucher-xlsx.writer.ts` rỗng (14/09/2026)
- [x] Demoed and accepted at gate G4 — Akenzy "mark done" 14/09/2026, chấp nhận giới hạn ở mục demo phía trên
