---
id: UOW-01
slug: exchange-as-returnable-source
title: Hoá đơn đổi trở thành chứng từ gốc trả được
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-03]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-08, AC-09, AC-10, AC-11]
risk: medium
status: todo
rollback: hoàn nguyên vị từ `inv.type = SALE` ở handler tìm kiếm và điều kiện `type !== SALE` ở `getEligibleLines` — không có migration, không có dữ liệu phải dọn
---

# UOW-01 — Hoá đơn đổi trở thành chứng từ gốc trả được

## Demo script

Chạy trên API dev (`:4000`, từ **checkout gốc** — xem A-14). Dựng bối cảnh trước:
một hoá đơn `EXCHANGE` đã post, có ít nhất một dòng `IN` và một dòng `OUT` — tạo bằng
`Đổi trả nhanh` trên POS, hoặc lấy sẵn từ `erp_dev`:

```sql
SELECT i.code, i.type, i.status,
       count(*) FILTER (WHERE ii.direction = 'OUT') AS out_lines,
       count(*) FILTER (WHERE ii.direction = 'IN')  AS in_lines
FROM invoices i JOIN invoice_items ii ON ii.invoice_id = i.id
WHERE i.type = 'EXCHANGE' AND i.is_draft = false
GROUP BY i.id HAVING count(*) FILTER (WHERE ii.direction = 'OUT') > 0
ORDER BY i.created_at DESC LIMIT 5;
```

1. `POST /v2/invoices/returnable/search` với khoảng ngày bao trùm hoá đơn đó
   → hoá đơn `EXCHANGE` có trong `data[]`, `type = "EXCHANGE"` (AC-01, AC-04)
2. Cùng lệnh, thêm `"type": "SALE"` → hoá đơn đó biến mất; thêm `"type": "EXCHANGE"`
   → chỉ còn hoá đơn đổi. `totals.totalAmount` khớp tổng có dấu của tập trả về (AC-05)
3. Tìm một hoá đơn `RETURN` đã post trong cùng khoảng ngày → **không** xuất hiện (AC-02)
4. `GET /invoices/{id hoá đơn đổi}/eligible-returns`
   → chỉ trả các dòng `OUT`; đối chiếu `originalInvoiceItemId` với truy vấn SQL trên để
   xác nhận không dòng `IN` nào lọt ra (AC-08)
5. Đối chiếu `refundableUnitPrice × maxReturnable` với `lineTotal` của chính dòng OUT đó
   trong DB → bằng nhau (AC-09)
6. `POST /invoices/exchanges` với `originalInvoiceItemId` = id một dòng **IN** của hoá
   đơn đổi → 400, không chứng từ nào được tạo (AC-11)
7. `POST /invoices/exchanges` với dòng `OUT` và `quantity` vượt `maxReturnable` → 400 (AC-10)
8. Trả hết mọi dòng `OUT` của hoá đơn đó, chạy lại bước 1 → hoá đơn đã rơi khỏi kết quả (AC-03)

## In scope

- Đường đọc đầu-cuối phía backend: vị từ tìm kiếm, danh sách dòng trả được, chốt chặn ghi
- Trường lọc `type` tuỳ chọn trên `ReturnableInvoiceSearchV2Dto` (UOW-02 dùng)
- Test hồi quy chứng minh `CheckoutReturnService` đã xử lý đúng hoá đơn gốc kiểu `EXCHANGE`

## Not in scope

- Mọi thay đổi trên pos-web (UOW-02)
- Sửa `refundable-value.util.ts` — xem A-15, đổi util là vô nghĩa về số học
- Sửa `checkout-return.service.ts` — xem A-16, đã tổng quát sẵn
- Ràng buộc dòng gốc phải thuộc `originalInvoiceId` client khai (lỗ hổng có sẵn, ADR-03)
- Giới hạn độ sâu chuỗi đổi (A-08)

## Risks

| Risk | Mitigation |
|---|---|
| Bản xem trước (`refundableUnitPrice`) lệch số checkout thực thu ⇒ nợ ảo | ADR-02 buộc hai bên dùng cùng tập dòng; T-01-04 khoá đẳng thức bằng test |
| Nới vị từ làm đổi hành vi hoá đơn `SALE` | T-01-01 và T-01-02 đều phải giữ nguyên mọi test `SALE` đang có, không sửa expectation nào |
| Lưới và chân lưới lệch nhau khi tập kết quả rộng ra | Vị từ mới phải vào **cả hai** nhánh của `buildQuery` — hàm vốn dựng hai lần cho đúng mục đích này |

## Definition of done

- [x] AC-01, AC-02, AC-04, AC-05, AC-08 … AC-11 pass trên `erp_dev` thật (xem Demo bên dưới).
      **AC-03 chỉ có bằng chứng test**, không có bằng chứng chạy thật — `erp_dev` không có
      hoá đơn đổi nào đã trả hết, và dựng một cái nghĩa là post phiếu trả thật (bút toán +
      chuyển kho + chi tiền, không hoàn tác được). Khoá bằng unit test "drops an exchange
      whose OUT lines are all returned (AC-03)" + vị từ `EXISTS` trong `buildQuery`.
- [x] `pnpm --filter @erp/api test` xanh — 2917 passed / 283 suites (1 skipped, có sẵn).
      Một expectation bị sửa, đã ghi ở T-01-01: `stringContaining('inv.type = :type')` đặt
      tên chính vị từ ticket rewrite. Không expectation nào về **hành vi** `SALE` bị đụng.
- [x] Demo chạy 7/8 bước trên `erp_dev` qua API thật (chi nhánh Hồ Chí Minh, org f1000000-…):
      B1 search không lọc → 39 dòng, 7 EXCHANGE, không dòng RETURN nào (AC-01/AC-02);
      3 hoá đơn đổi `debt` có mặt (AC-04). B2 `type=SALE` → 32/91.229.000, `type=EXCHANGE`
      → 7/−20.000, cộng lại đúng bằng 39/91.209.000 ở cả số dòng lẫn số tiền, và bằng tổng
      có dấu từng dòng (AC-05). B4 `eligible-returns` trên `RTN-202607-00001` trả đúng 1
      dòng OUT, dòng IN `ABA2777-D-38` không lọt (AC-08). B5 `85.000 × 2 = 170.000` =
      `lineTotal` (AC-09). B6 gửi dòng IN → 400 "is an inbound (returned) line…" (AC-11).
      B7 qty 5 > max 2 → 400 "max=2, requested=5" (AC-10).
      **B8 không chạy** — nó chính là AC-03, cần post phiếu trả thật, chưa được phép mutate.
- [x] Không migration (`git status` trên `src/database/migrations` sạch), không chứng từ đã
      post nào bị sửa. Một hoá đơn **nháp** `DRAFT-1a9c506a` do lệnh đối chứng B7 tạo ra,
      chưa post nên không đụng kho/sổ.
- [x] Mọi dòng mới ở backend bằng tiếng Anh. Hai chuỗi tiếng Việt có sẵn trong
      `assertLineEligible` và một trong `checkout-return.service.ts` là nợ cũ, T-01-03 chốt
      không đụng.
- [x] Demoed và được chấp nhận ở gate G4 — Akenzy "please close the feature" 2026-08-23.
