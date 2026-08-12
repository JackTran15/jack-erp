---
id: UOW-04
slug: cashier-overrides-winner
title: Thu ngân đổi được CTKM thắng khi hai chương trình tranh một dòng
demoable: true
duration: 1.5d
depends_on: [UOW-02]
requirements: [US-04]
verifies: [AC-11, AC-12, AC-13]
risk: high
status: todo
rollback: revert thay đổi trong `promotion-resolver.ts`; `selectedProgramIds` quay về nghĩa cũ (chỉ bật CTKM auto_apply=false) và UOW-02 vẫn chạy nguyên vẹn
---

# UOW-04 — Thu ngân đổi được CTKM thắng khi hai chương trình tranh một dòng

Đây là hành vi quan sát được trên MISA ngày 06/08/2026: tạo `TEST BR001 TRUNG SKU 50%` trỏ
trùng SKU với `GIÀY NAM ONSALE 30%`, tick cả hai rồi Đồng ý, MISA hỏi *"CTKM A và B cùng áp
dụng cho 1 hàng hóa. Bạn có muốn đổi thành áp dụng chương trình A không?"* và **hoán đổi**
chứ không cộng dồn.

jack-erp giải cùng bài toán bằng `priority` — máy tự quyết, thu ngân không có tiếng nói.
UoW này giữ `priority` làm mặc định nhưng cho thu ngân đè lên khi cần.

**Rủi ro cao nhất trong feature.** `PromotionResolver` đang xanh 31/31 ticket của
`promotion-programs-engine`; ticket đầu của UoW này sửa đúng vào lõi đó.

## Demo script

1. Backoffice: hai CTKM cùng trỏ SKU `AKSK27096-BO-39` — A giảm 30% priority 10,
   B giảm 50% priority 20 (khuôn đã dựng thật trên MISA)
2. POS: thêm SKU đó vào giỏ → CTKM **A thắng** theo priority, giá còn 1.046.500
3. Mở dialog Chương trình khuyến mãi: A đã tick; B hiện với lý do
   **"Đã bị chương trình A giành mất"**
4. Tick B → bấm Đồng ý → hộp xác nhận nêu tên **cả hai** chương trình
5. Xác nhận → panel đổi sang giá của B: 747.500
6. Mở lại dialog: nay B đã tick, A chuyển sang "Đã bị chương trình B giành mất" — đúng đối xứng
7. Bấm Thu tiền; hoá đơn ghi CTKM **B**, không phải A

## In scope

- `PromotionResolver` tôn trọng `selectedProgramIds` khi phân xử tranh chấp tài nguyên
- Hộp xác nhận trước khi hoán đổi ở POS
- Giữ nguyên toàn bộ hành vi cũ khi `selectedProgramIds` rỗng

## Not in scope

- Cộng dồn hai CTKM trên cùng một dòng — MISA cũng không cho, và mô hình tài nguyên của
  engine dựa trên "một dòng một chương trình"
- Bỏ một CTKM `auto_apply=true` mà server đã tự áp (A-13, còn pending)

## Risks

| Risk                                                                                            | Mitigation                                                                                                               |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Sửa `promotion-resolver.ts` làm hồi quy engine đang xanh 31/31                                   | T-04-01 **không được sửa hay xoá** bất kỳ case nào trong `promotion-resolver.spec.ts`; test cũ đỏ = ticket chưa xong          |
| Nghĩa kép của `selectedProgramIds` (bật CTKM tùy chọn **và** đè priority) gây nhầm sau này        | ADR-03 ghi rõ lý do chọn một trường; T-04-01 phải để lại docblock trên trường đó nêu cả hai nghĩa                            |
| Hai CTKM cùng nằm trong `selectedProgramIds` và cùng tranh một dòng                              | T-04-01 định nghĩa tie-break tường minh (priority rồi tới id) thay vì để thứ tự mảng quyết định — thứ tự mảng là không xác định |

## Definition of done

- [x] AC-11..AC-13 pass theo Demo script — chạy sống qua Chrome (backoffice tạo 2 CTKM
      INVOICE_DISCOUNT thật, POS thêm dòng, tick/hoán đổi/mở lại dialog/huỷ), khớp từng bước
      demo script (chỉ khác tên chương trình và số tiền cụ thể)
- [x] Toàn bộ `promotion-resolver.spec.ts` cũ xanh, không sửa case nào — 19 case cũ + 5 case
      mới (T-04-02), file spec cũ 0 diff ngoài phần thêm mới
- [x] `selectedProgramIds` rỗng ⇒ kết quả giống hệt trước thay đổi — case riêng trong T-04-02 +
      case 1 của T-04-04 (`checkout` không gửi field này, hoá đơn vẫn ghi theo priority)
- [x] `pnpm --filter @erp/api test` và `test:e2e` xanh — `test`: 254 suite/2231+ pass; `test:e2e
      -- checkout-saga-promotion`: 9/9 pass (đã sửa 1 bug chặn suite chạy hoàn toàn ngoài phạm vi
      ticket, xem ghi chú T-04-04)
- [ ] Demoed và accepted ở gate G4 — demo đã chạy sống (ghi lại ở T-04-03/T-04-04), còn chờ người
      accept; không tự ý tick mục này
