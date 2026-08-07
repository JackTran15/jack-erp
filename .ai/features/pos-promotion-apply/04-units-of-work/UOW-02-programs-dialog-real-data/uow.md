---
id: UOW-02
slug: programs-dialog-real-data
title: Dialog CTKM hiện chương trình thật kèm lý do bị bỏ qua
demoable: true
duration: 1.5d
depends_on: [UOW-01]
requirements: [US-02, US-03]
verifies: [AC-05, AC-06, AC-07, AC-08, AC-09, AC-10]
risk: low
status: todo
rollback: trả `promotions={[]}` lại cho `PromotionSelectionModal` và bỏ forward `selectedProgramIds` — dialog về trạng thái rỗng như trước, không dữ liệu nào cần dọn
---

# UOW-02 — Dialog CTKM hiện chương trình thật kèm lý do bị bỏ qua

Xoá điểm đau số 1 của khảo sát MISA (mục 7.4): CTKM không chạy mà thu ngân không biết vì sao.
MISA để chương trình biến mất im lặng; engine của ta trả `skippedPrograms` kèm `reason` có
kiểu — UoW này đưa nó ra màn hình. Đây là chỗ ta **hơn** hệ tham chiếu, không phải bắt chước.

Kèm theo đó là hai việc nối dây nhanh nhất trong toàn feature (PV-2 và PV-4 của gap doc):
`PaymentSummaryPanel.tsx:185` hết truyền `promotions={[]}` hard-code, và
`invoice.service.ts` bắt đầu forward `selectedProgramIds`.

## Demo script

1. Backoffice: tạo 2 CTKM cùng trỏ một SKU — một `auto_apply=true` priority thấp, một
   `auto_apply=false`; tạo thêm 1 CTKM có điều kiện tổng tiền cao mà giỏ hàng sẽ không đạt
2. POS bằng tài khoản `STAFF`: thêm SKU đó vào giỏ
3. Mở dialog **Chương trình khuyến mãi** từ menu quà tặng ở panel phải
4. Thấy đủ 3 dòng: chương trình đang áp (đã tick), chương trình tùy chọn (chưa tick),
   và chương trình bị bỏ qua kèm chữ **"Chưa đủ điều kiện"** — không phải mã `CONDITION_NOT_MET`
5. Với chương trình bị chương trình khác giành mất, đọc được **"Đã bị chương trình X giành mất"**
6. Tick chương trình tùy chọn → Đồng ý → tổng còn phải thu ở panel đổi ngay
7. Bấm Thu tiền; mở DevTools → Network → request `POST /v2/pos/checkout` chứa
   `selectedProgramIds` với đúng id vừa tick
8. Mở lại hoá đơn vừa chốt: chương trình đã chọn nằm trong danh sách CTKM của hoá đơn

## In scope

- Map `EvaluateCartResponse` → view model của `PromotionSelectionModal`
- Nhãn tiếng Việt cho toàn bộ union `SkippedProgramReason`
- Tick chọn CTKM tùy chọn → chạy lại preview → forward lên checkout

## Not in scope

- Đổi CTKM **thắng** khi tranh chấp (UOW-04) — UoW này chỉ *hiển thị* lý do tranh chấp,
  chưa cho đổi
- Voucher (UOW-03), quà (UOW-05), giảm giá tay (UOW-06)

## Risks

| Risk                                                                                     | Mitigation                                                                                          |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `PromotionItem` là type cục bộ "loose by design", map ẩu sẽ lệch tên trường (PV-5)       | T-02-01 giữ nguyên type của dialog và làm một mapper tường minh có test ở backend-side fixture nếu cần |
| Thêm `reason` mới vào union ở backend mà quên nhãn ⇒ lộ enum tiếng Anh ra UI              | T-02-01 dùng `Record<SkippedProgramReason, string>` để TypeScript báo lỗi khi thiếu nhãn               |

## Definition of done

- [ ] AC-05..AC-10 pass theo Demo script
- [ ] Không còn `promotions={[]}` hard-code trong `PaymentSummaryPanel.tsx`
- [ ] Không mã enum tiếng Anh nào lọt ra UI (NFR Ngôn ngữ)
- [ ] `pnpm --filter @erp/api test` xanh; `tsc --noEmit` của `pos-web` sạch
- [ ] Demoed và accepted ở gate G4
