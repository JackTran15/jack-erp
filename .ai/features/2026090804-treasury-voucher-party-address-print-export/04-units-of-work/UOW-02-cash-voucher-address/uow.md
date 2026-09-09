---
id: UOW-02
slug: cash-voucher-address
title: Địa chỉ lưu được trên phiếu thu chi tiền mặt
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-07, AC-08, AC-09]
risk: low
status: todo
rollback: Gỡ `address` khỏi 4 DTO tiền mặt và khỏi `cash-vouchers.api-body.ts`; cột `partner_address_snapshot` để nguyên (nó đã tồn tại từ trước)
---

# UOW-02 — Địa chỉ lưu được trên phiếu thu chi tiền mặt

## Demo script

1. Mở Quỹ tiền → Thu chi tiền mặt → Thêm phiếu chi
2. Gõ tên đối tượng tự nhập và gõ "123 Lê Lợi, Q1" vào ô Địa chỉ, lưu
3. Mở lại phiếu: ô Địa chỉ hiện "123 Lê Lợi, Q1"
4. Tạo phiếu thu tiền mặt, chọn một khách hàng **có** địa chỉ từ kính lúp → ô Địa chỉ tự
   điền địa chỉ danh mục
5. Sửa ô Địa chỉ thêm ", lầu 3", lưu, mở lại → giữ bản đã sửa, không bị danh mục ghi đè
6. Ở phiếu đã ghi sổ đó, sửa **mỗi** ô Địa chỉ rồi lưu → thành công, không sinh phiếu bù trừ
7. Mở một phiếu thu tiền gửi để đối chiếu: hành vi giống hệt (vốn đã đúng từ trước)

## In scope

- `address` trên 4 DTO tiền mặt (create + update của thu và chi)
- Luật ghi `dto.address ?? partner?.address` ở 2 service tiền mặt (ADR-03)
- FE gửi `address` qua `cash-vouchers.api-body.ts`
- Bỏ hard-set `partnerAddressSnapshot: null` ở nhánh đối tượng tự nhập

## Not in scope

- Phiếu tiền gửi — đã đúng, không đụng
- Nhánh chuyển quỹ / chuyển chi nhánh của `PaymentVoucherDialog`: chúng đã gửi `address`
  vào các DTO khác (`fund-swaps`, `cash-transfer`) và không nằm trong khiếu nại
- Migration — cột `partner_address_snapshot varchar(500)` đã có từ `1781000000000`

## Risks

| Risk | Mitigation |
|---|---|
| `save()` bỏ qua `undefined`: xoá trắng địa chỉ sẽ giữ giá trị cũ | T-02-02 dùng `null` tường minh và có test hai chiều, cùng luật đã áp cho `partnerName` từ 2026090701 |
| Sửa địa chỉ trên phiếu đã ghi sổ vô tình đi qua đường sinh phiếu bù trừ | AC-09 khẳng định không phát sinh phiếu thứ hai; số tiền không đổi nên nhánh bù trừ không được chạm |
| Quên chạy `openapi:generate` sau khi đổi DTO ⇒ FE nhận 400 vì `forbidNonWhitelisted` | Ghi thành một ô trong done-when của UoW, không giấu trong ticket |

## Definition of done

- [ ] Cả AC-07..09 pass
- [x] `pnpm --filter @erp/api test -- --testPathPattern cash-vouchers` xanh
- [x] `pnpm openapi:generate` đã chạy (2026-09-08, từ bản build riêng ở :4100 — dev server
      :4000 đang phục vụ build cũ một phần, sinh từ nó sẽ ra snapshot thiếu route)
- [ ] `schema.ts` + `openapi.snapshot.json` **đã commit** — chưa; toàn bộ feature còn uncommitted
- [x] `pnpm --filter @erp/api test:e2e -- treasury-voucher-address` xanh
- [x] Phiếu tiền gửi không đổi hành vi (một ca hồi quy trong e2e)
- [ ] Demo script chạy được trước người thật ở gate G4
- [ ] Bằng chứng trình duyệt: `aidlc-verify` `local-backoffice` phủ bước 2–6 (thuộc G4 của
      UoW, không thuộc done-when của ticket nào)
