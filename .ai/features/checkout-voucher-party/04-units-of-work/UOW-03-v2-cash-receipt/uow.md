---
id: UOW-03
slug: v2-cash-receipt
title: Checkout v2 sinh phiếu thu tiền mặt, đủ đối tượng, không thêm bút toán
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-03, US-05]
verifies: [AC-09, AC-10, AC-11, AC-12, AC-14]
risk: high
status: todo
rollback: gỡ khối ghi phiếu khỏi `post-cash.step.ts` — saga quay lại chỉ ghi movement như hôm nay; tham số `documentNumber?` để lại cũng vô hại vì nó tuỳ chọn
---

# UOW-03 — Checkout v2 sinh phiếu thu tiền mặt

Lát cắt nặng nhất và là phần **không** nằm trong câu hỏi ban đầu. v2 hôm nay không sinh phiếu
thu nào (A-R1): bật `VITE_CHECKOUT_V2=true` là Sổ quỹ mất hẳn phiếu thu của đơn bán. Nên
"apply cho checkout 2" nghĩa là thêm chứng từ, rồi mới nói tới bốn ô.

Rủi ro cao vì lát cắt này viết **bên trong transaction checkout**. Ba cách sai đều rất dễ
mắc và mỗi cái hỏng một kiểu:

- gọi `docNumbering.generate` → số phiếu cấp trong một transaction khác, rollback không thu
  hồi được → thủng số chứng từ (AC-11);
- publish event cho consumer v1 xử lý → double-post chân tiền GL (AC-10, A-26);
- gọi `createAndPostInternal` thay vì `createVoucherForMovement` → ghi thêm movement và bút
  toán thứ hai cho cùng số tiền.

Vì vậy AC-10 và AC-11 là hai chốt chặn máy kiểm được, và ticket cuối của UoW này chỉ để dựng
chúng.

## Demo script

1. `apps/pos-web/.env` có `VITE_CHECKOUT_V2=true`. Kiểm bằng Network tab: request checkout
   đi tới endpoint saga, không phải v1. Bỏ qua bước này là kiểm nhầm nhánh — bẫy đã ghi
   trong bộ nhớ dự án.
2. Ghi lại số phiếu thu cuối cùng đang có trong Sổ quỹ.
3. POS → bán một món cho khách có địa chỉ, chọn nhân viên bán hàng, thanh toán tiền mặt.
4. Backoffice → Sổ quỹ tiền mặt → có **đúng một** phiếu thu mới, số liền sau bước 2, đủ bốn
   ô, số tiền bằng tiền mặt đã thu.
5. Mở "Chứng từ" trên phiếu → nhảy sang đúng hoá đơn vừa bán.
6. Sổ nhật ký chung → hoá đơn đó có **đúng một** bút toán `POS Invoice <số>` (AC-10). Đây là
   bước hay bị bỏ qua nhất và là bước duy nhất bắt được double-post.
7. Sổ quỹ: số dư quỹ tăng đúng bằng tiền mặt đã thu, **một lần**.
8. Bán lại một đơn tiền mặt nữa → số phiếu tiếp tục liền mạch, không nhảy cóc.

## In scope

- `documentNumber?` tuỳ chọn cho `CashReceiptsService.createVoucherForMovement`.
- Slot `journalEntryId` (và id movement) trong `CheckoutContext`, do `post-journal` /
  `post-cash` điền.
- `post-cash.step.ts` mint số phiếu bằng `mintDocumentNumber` rồi ghi
  `cash_receipts` voucher-only, kèm snapshot đối tượng.
- Cập nhật docblock của `post-cash.step.ts` — đoạn "No `cash_receipts` (Phiếu thu) voucher
  either" sẽ **sai** sau ticket này. Để nguyên là để lại một lời nói dối trong code.
- Spec: một phiếu, không thêm bút toán, rollback, replay.

## Not in scope

- Chữa double-post GL của v1 (A-26). v2 phải **không** mắc, v1 để nguyên.
- Phiếu tiền gửi của v2 (UOW-04).
- Phiếu tiền thừa của v2 — vẫn đi outbox tới `PosKeptChangeConsumer`, đã xong ở UOW-01.
- Đảo thứ tự bước saga.

## Risks

| Risk | Mitigation |
|---|---|
| Dùng `docNumbering.generate` theo phản xạ → số phiếu không rollback | ADR-03 ghi rõ; AC-11 có test rollback khẳng định bộ đếm không nhảy |
| Gọi `createAndPostInternal` thay vì `createVoucherForMovement` → movement và bút toán thứ hai | AC-10 đếm số dòng `journal_entries` trước/sau; T-03-04 dựng đúng phép đếm này |
| Hai dòng tiền mặt sinh hai phiếu (A-06, ADR-05) | v2 gộp tổng thành một phiếu; T-03-04 có case hai dòng CASH |
| Snapshot throw trong transaction → mất đơn tại quầy | Hàm từ UOW-01 không throw; T-03-04 có case khách đã xoá chốt đơn vẫn thành công |
| Replay saga tạo phiếu thứ hai | `ctx.replayed` chặn từ đầu bước, thêm `findByReference` của service là hai lớp; AC-12 kiểm |

## Definition of done

- [x] AC-09, AC-10, AC-11, AC-12 xanh ở mức unit **và** e2e trên `erp_test` thật (hàng
      `cash_receipts` POSTED, `journal_entries` delta = 1, số phiếu liền mạch, replay không
      nhân đôi)
- [x] AC-14 trên đường v2: khách đã xoá vẫn chốt được đơn
- [x] Docblock `post-cash.step.ts` đã viết lại, không còn câu "No `cash_receipts` voucher"
- [x] `pnpm --filter @erp/api test` xanh (2580 passed)
- [x] Demo chạy thật qua endpoint saga (`POST /v2/pos/checkout`) → `PT000044`, có trong ảnh
      S2. **Không có ảnh sổ nhật ký chung**: phép đếm "chỉ một bút toán" do e2e làm
      (`journal_entries` delta = 1), không phải do mắt người đọc màn hình
- [x] Demoed và accepted at gate G4 — Akenzy, 2026-08-15

Lát cắt này còn sinh ra ADR-06 — xem `03-logical-design.md`. Không có e2e thì lỗi đó đã lên
production.

## Verification evidence
- [x] `verify.py --write` xanh 5/5 trên `local-backoffice`
- [x] **PT000044** — phiếu do checkout v2 sinh — có mặt trong ảnh S2 cùng tên khách, nằm ngay
      trên ba phiếu cũ (`PT000043/42/40`) có cột đối tượng trống: ảnh đó tự nó là bằng chứng
      trước/sau của cả UoW
- [x] AC-09…AC-12 (một phiếu, không thêm bút toán, số liền mạch, replay không nhân đôi) không
      quan sát được bằng ảnh; phủ bởi e2e `checkout-voucher-party.e2e-spec.ts` chạy trên
      `erp_test` thật, gồm phép đếm `journal_entries` trước/sau
- [x] `08-evidence.md` đã sinh lại; commit sha trong `run.json` = `88296e93` = HEAD
- [x] PR draft + `contact-sheet-local-backoffice.png` đã sinh dưới `evidence/`. **Chưa mở PR**
      — công việc còn uncommitted trên `feat/promotions`, nên chưa có gì để đính kèm vào

> **Đóng G4 có ngoại lệ, do Akenzy quyết ngày 2026-08-15.** `evidence_check.py` đòi một ảnh
> chụp cho **mọi** AC trong `verifies:`; 13/15 AC của feature này không có bề mặt UI để chụp
> (bất biến sổ sách, replay, hồi quy test). Ngoại lệ được ghi ở đây thay vì giấu bằng cách
> thu hẹp `verifies:` — kế hoạch giữ nguyên, chỗ hụt nói thẳng.
