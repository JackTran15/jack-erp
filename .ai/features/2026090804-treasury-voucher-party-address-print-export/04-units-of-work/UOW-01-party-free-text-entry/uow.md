---
id: UOW-01
slug: party-free-text-entry
title: Gõ thẳng tên đối tượng vào 4 loại phiếu quỹ
demoable: true
duration: 1.5d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06]
risk: medium
status: todo
rollback: Trả `VoucherPartnerFields` về nhánh `freeText` cũ và trả `PARTNER_LOOKUP_DIALOG_OPTIONS` về đủ 4 mục; backend không cần lùi (nới `partnerName` là tương thích ngược)
---

# UOW-01 — Gõ thẳng tên đối tượng vào 4 loại phiếu quỹ

## Demo script

1. Mở Quỹ tiền → Thu chi tiền mặt → Thêm phiếu chi
2. **Không chạm vào ô Mã đối tượng**, gõ thẳng "Nguyễn Văn Ba" vào ô Tên đối tượng
3. Nhập một dòng chi tiết và số tiền, lưu → phiếu lưu thành công
4. Mở lại phiếu vừa lưu: ô Tên hiện "Nguyễn Văn Ba" và vẫn sửa được, ô Mã trống
5. Xem lưới Thu chi: cột "Đối tượng" của dòng đó hiện "Nguyễn Văn Ba"
6. Tạo phiếu thu tiền mặt khác, chọn một khách hàng thật từ kính lúp, rồi **sửa lại ô Tên**
   thêm hậu tố " — CN Bình Tân", lưu. Mở lại: tên hiện bản đã sửa, và mã khách vẫn còn
7. Mở modal "Chọn đối tượng", mở dropdown "Loại đối tượng" → chỉ còn Nhà cung cấp / Khách
   hàng / Nhân viên, không còn mục dẫn tới danh sách rỗng
8. Lặp bước 2–4 trên phiếu thu tiền gửi và phiếu chi tiền gửi

## In scope

- Ô Tên đối tượng gõ được ở cả 4 dialog, không cần chọn loại trước (ADR-01)
- Suy `partnerType` ở biên gửi đi cho cả nhánh tiền mặt và nhánh tiền gửi
- Backend đọc `partnerName` cả khi có `partnerId` (ADR-02)
- Gỡ lối cụt "Khác" khỏi modal "Chọn đối tượng" (ADR-04)

## Not in scope

- Địa chỉ (UOW-02) — cố tình tách, vì hai đường đứt ở hai chỗ khác nhau
- Danh mục cho tên gõ tay; tên chỉ là snapshot trên phiếu
- Đổi thứ tự `COALESCE` ở cột Đối tượng của lưới (A-05 giữ nguyên; AC-05 chỉ khẳng định
  hành vi hiện có vẫn đúng sau thay đổi)

## Risks

| Risk | Mitigation |
|---|---|
| Nhánh tiền gửi dựng body inline và chưa từng gửi `partnerName` (A-R5) — dễ làm xong tiền mặt rồi tưởng xong cả bốn | T-01-03 tách riêng cho nhánh tiền gửi; T-01-06 e2e chạy đủ 4 loại phiếu, không chỉ 2 |
| `backoffice-web` không có jsdom nên không test được component (xem bộ nhớ dự án) | Đẩy phần quyết định vào hàm thuần (`resolvePartyFields`) có spec; phần render chứng minh bằng bằng chứng trình duyệt ở G4 |
| Xoá nhánh `freeText` ở chế độ chỉ đọc làm hiện một ô Mã trống vô nghĩa với phiếu không có `partnerId` | T-01-01 nêu đích danh cả hai chế độ trong done-when |
| `save()` của TypeORM bỏ qua `undefined` — xoá tên bằng `undefined` sẽ giữ tên cũ | T-01-05 tái dùng luật `null` tường minh đã có từ 2026090701; test hai chiều |

## Definition of done

- [ ] Cả AC-01..06 pass
- [x] `pnpm --filter @erp/api test -- --testPathPattern "cash-vouchers|deposit-vouchers"` xanh
- [x] `cd apps/backoffice-web && npx vitest run` không đỏ thêm so với baseline
- [x] `pnpm --filter @erp/api test:e2e -- treasury-voucher-party-freetext` xanh
- [x] Không migration mới, không permission mới
- [x] `pnpm openapi:generate` chạy MỘT lần cho cả UoW (chú thích JSDoc của 8 DTO vào
      `description` của schema); `packages/api-client/src/generated/schema.ts` và
      `openapi.snapshot.json` đã commit
- [ ] Demo script chạy được trước người thật ở gate G4
- [ ] Bằng chứng trình duyệt: `aidlc-verify` môi trường `local-backoffice` phủ bước 2–7 của
      demo script (mục này thuộc G4 của UoW, không thuộc done-when của ticket nào)
