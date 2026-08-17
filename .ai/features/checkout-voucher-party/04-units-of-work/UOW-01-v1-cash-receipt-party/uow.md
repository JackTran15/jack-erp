---
id: UOW-01
slug: v1-cash-receipt-party
title: Phiếu thu tiền mặt của đơn bán v1 ghi rõ khách và nhân viên
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-05]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-14, AC-15]
risk: low
status: todo
rollback: bỏ hai lệnh gán `...party` trong hai consumer — phiếu quay lại trống bốn ô như hôm nay. Không schema, không hợp đồng, không dữ liệu phải dọn
---

# UOW-01 — Phiếu thu tiền mặt của đơn bán v1 ghi rõ khách và nhân viên

Lát cắt chữa đúng cái ảnh chụp màn hình: mở `PT000152` ra không biết thu của ai. Đây cũng là
lát cắt dựng **hàm dùng chung** mà ba UoW còn lại đứng lên — nhưng nó không phải một UoW
"hạ tầng": tự nó chốt được một đơn tiền mặt và mở phiếu ra xem, không cần UoW nào khác.

Chỗ dễ sai nhất không nằm ở SQL mà ở **ô Nhân viên thu** (ADR-02). Ghi thẳng
`salesperson_id` vào `staff_id` thì mọi test đơn vị vẫn xanh — cột có giá trị, kiểu đúng,
không ai throw — mà ô trên màn hình vẫn trống, vì dialog tra bằng `GET /admin/users/:id`.
Vì vậy Demo script dưới đây bắt buộc phải mở dialog thật, không được dừng ở `SELECT`.

## Demo script

1. Backoffice → Danh mục khách hàng: chọn một khách **có** địa chỉ (ghi lại tên + địa chỉ),
   và một khách **không** có địa chỉ.
2. POS → bán một món cho khách có địa chỉ, chọn nhân viên bán hàng, thanh toán **tiền mặt**,
   chốt đơn. Ghi lại số hoá đơn.
3. Backoffice → Sổ quỹ tiền mặt → mở phiếu thu vừa sinh:
   - Đối tượng nộp: **mã + tên khách** (hai ô đều có chữ, không phải một ô)
   - Người nộp: tên khách
   - Địa chỉ: đúng địa chỉ khách ở bước 1
   - Nhân viên thu: **mã + tên** nhân viên bán hàng — đây là ô hay trống nhất, nhìn kỹ
4. Lặp bước 2 với khách **không** có địa chỉ → ô Địa chỉ hiển thị **địa chỉ chi nhánh**.
5. Lặp bước 2 với **khách vãng lai** (không chọn khách) → ba ô đối tượng trống, ô Nhân viên
   thu vẫn có, phiếu vẫn POSTED, số tiền đúng.
6. Bán một đơn tiền mặt, khách đưa dư và **không lấy tiền thừa** → mở phiếu thu "thu nhập
   khác" vừa sinh → cũng đủ bốn ô.
7. Backoffice → tạo tay một phiếu thu như trước feature → hành vi không đổi (AC-15).

## In scope

- `buildPosInvoiceParty` trong `cash-vouchers/shared/voucher-party.ts` (ADR-01, ADR-04).
- `PosCashSaleConsumer` và `PosKeptChangeConsumer` truyền snapshot vào
  `createAndPostInternal`.
- Spec cho hàm mới, spec cho hai consumer, và rà lại spec hiện có của cash-vouchers.

## Not in scope

- Phiếu chi hoàn tiền (UOW-02), phiếu của checkout v2 (UOW-03), phiếu tiền gửi (UOW-04).
- Sửa `PartnerResolverService` — nó phải giữ nguyên hành vi throw cho đường tạo phiếu tay.
- Chữa lỗi hai dòng tiền mặt chỉ ra một phiếu của v1 (A-06). Ghi nhận, không sửa.
- Backfill (A-04).

## Risks

| Risk | Mitigation |
|---|---|
| Ghi `salesperson_id` thay vì `employee_profiles.user_id` — test xanh, ô vẫn trống (A-R3) | T-01-01 có case khẳng định `staffId` **bằng `user_id`, khác `salesperson_id`**; Demo script bước 3 bắt mở dialog thật |
| Join `branches` bằng `invoices.branch_id` mà quên `::uuid` → lỗi kiểu lúc chạy | Ghi rõ trong T-01-02; T-01-01 chạy hàm thật trên DB test, không stub, nên lỗi kiểu lộ ngay |
| Khách bị xoá làm consumer throw → phiếu vào DLQ, tiền mất dấu trong Sổ quỹ (A-R4) | Hàm mới **không** gọi `PartnerResolverService`; T-01-01 có case khách không tồn tại và khẳng định không throw |
| Chuỗi rỗng `''` trong `customers.address` được ghi đè lên địa chỉ chi nhánh | Dùng lại `blankToUndefined` sẵn có; T-01-01 có case địa chỉ toàn khoảng trắng |

## Definition of done

- [x] AC-01, AC-02, AC-03, AC-04, AC-05 xanh ở mức unit (10 case cho hàm dựng snapshot,
      5 case cho hai consumer)
- [x] AC-14: case khách bị xoá, chi nhánh không địa chỉ, nhân viên không có user — không case
      nào throw
- [x] AC-15: toàn bộ spec hiện có của `cash-vouchers` vẫn xanh, không kỳ vọng nào bị sửa
- [x] `pnpm --filter @erp/api test` xanh (2580 passed)
- [x] Demo chạy trên app thật: `PT000045` (đường v1), ảnh S1–S5, cả bốn ô có chữ — ô Nhân
      viên thu hiện `NV000001 · Nhân viên HCM`, đúng `employee_profiles.user_id` (ADR-02)
- [x] Demoed và accepted at gate G4 — Akenzy, 2026-08-15

Đường v1 đi qua Kafka consumer nên e2e của UOW-03 không phủ được nó — vì thế demo dựng
riêng một đơn v1 (`POST /invoices/:id/checkout`), và `PT000045` trong ảnh chính là sản phẩm
của consumer đó.

## Verification evidence
- [x] `verify.py --write` xanh **5/5** trên `local-backoffice` (environment required duy nhất
      của feature), desktop 1440×900
- [x] Có ảnh cho AC-01 (S1–S3), AC-03 (S4), AC-04 (S5). Bằng chứng của UoW này là **PT000045**
      — phiếu do đúng đường v1 (`PosCashSaleConsumer` qua Kafka) sinh ra, không phải v2
- [x] AC-02 / AC-05 / AC-14 / AC-15 **không có ảnh**: khách vãng lai, tiền thừa, khách bị xoá
      và hồi quy spec đều cần dựng đơn khác hoặc không có bề mặt UI. Phủ bởi unit test hai
      consumer + e2e đọc thẳng cột DB
- [x] `08-evidence.md` đã sinh lại; commit sha trong `run.json` = `88296e93` = HEAD
- [x] PR draft + `contact-sheet-local-backoffice.png` đã sinh dưới `evidence/`. **Chưa mở PR**
      — công việc còn uncommitted trên `feat/promotions`, nên chưa có gì để đính kèm vào

> **Đóng G4 có ngoại lệ, do Akenzy quyết ngày 2026-08-15.** `evidence_check.py` đòi một ảnh
> chụp cho **mọi** AC trong `verifies:`; 13/15 AC của feature này không có bề mặt UI để chụp
> (bất biến sổ sách, replay, hồi quy test). Ngoại lệ được ghi ở đây thay vì giấu bằng cách
> thu hẹp `verifies:` — kế hoạch giữ nguyên, chỗ hụt nói thẳng.
