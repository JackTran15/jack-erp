---
id: UOW-03
slug: document-detail
title: Bấm số lượng mở chi tiết tới từng dòng chứng từ
demoable: true
duration: 2d
depends_on: [UOW-02]
requirements: [US-03]
verifies: [AC-08, AC-09, AC-10]
risk: medium
status: todo
rollback: gỡ ba entry `inQty`/`outQty`/`receivedQty` khỏi `DRILL_DOWNS` — ô về text thường; L1 vẫn chạy.
---

# UOW-03 — Chi tiết phiếu theo cửa hàng và chứng từ (L2)

## Demo script

1. Từ dialog L1 của HCM, click ô "Số lượng" dải **Xuất kho điều chuyển** trên dòng HN
2. Dialog thứ ba mở: "CHI TIẾT PHIẾU NHẬP XUẤT ĐIỀU CHUYỂN THEO CỬA HÀNG VÀ CHỨNG TỪ", phụ đề
   "Cửa hàng xuất HCM · Cửa hàng nhập HN"
3. Cột "Số chứng từ" là phiếu xuất tại HCM; "Tham chiếu" hiện số phiếu nhập ghép và "Ngày chứng từ
   tham chiếu" hiện ngày post của nó; cột "Kho" có dữ liệu
4. Đóng, click ô dải **Nhập kho điều chuyển** trên dòng DN → phụ đề đảo thành
   "Cửa hàng xuất DN · Cửa hàng nhập HCM", "Số chứng từ" là phiếu nhập tại HCM
5. Đóng, click ô dải **Cửa hàng khác thực nhận về** trên dòng DN → chỉ liệt kê phiếu đã ghép; phiếu
   TO-3 (đang vận chuyển) và GI-tay vắng mặt; Σ "Số lượng" bằng đúng ô vừa click

## In scope

- `transferLeg` trên payload/DTO + dòng filter `TRANSFER_LEG` + `pnpm openapi:generate`
- `transfer-detail.service.ts` — engine chung cho L2 và L3 (ADR-04)
- `TransferDocumentDetailReport` + `countRows` + wiring
- Ba resolver `transferDocs(leg)`, mang toàn bộ logic đảo chiều

## Not in scope

- `leg='unmatched'` và dialog chênh lệch (UOW-04) — enum có sẵn giá trị đó nhưng report definition
  thuộc UoW sau
- Ghép ở mức dòng: liên kết chỉ tồn tại ở mức chứng từ (00-intent Constraints)

## Risks

| Risk | Mitigation |
|---|---|
| L2 không cộng về ô đã mở ra nó vì dùng `stl.unit_price` thay vì `items.purchase_price` | Ghi rõ trong T-03-02; spec ở T-03-03 so Σ số lượng với ô L1 |
| `countSql` thiếu join mà `columnFilters` tham chiếu ⇒ 42P01 lúc chạy | T-03-02 dựng outer join một lần và dùng chung cho cả hai statement (mẫu `document-detail.service.ts:164-169`) |
| `openapi:generate` nuốt thêm diff của [[stock-by-store-branch-scope]] | Chạy **một lần**, sau khi UOW-02 kia land; ghi trong T-03-01 |
| Phụ đề đảo chiều sai ⇒ báo cáo nói ngược | Logic đảo chiều nằm **duy nhất** trong `transferDocs(leg)`; demo bước 2 và 4 đối chiếu trực tiếp |

## Definition of done

- [ ] AC-08, AC-09, AC-10 pass
- [ ] `openapi.snapshot.json` và `packages/api-client/src/generated/schema.ts` đã commit
- [ ] `pnpm --filter @erp/api test` xanh
- [ ] `pnpm --filter @erp/api build` và `pnpm --filter @erp/backoffice-web build` xanh
- [ ] Demoed và accepted ở gate G4

## Verification evidence

- [ ] `verify.py .ai/features/transfer-summary-drilldown --write` xanh trên mọi môi trường `required`
- [ ] Có bằng chứng cho mọi AC trong `verifies`, ở mọi viewport đã khai
- [ ] `08-evidence.md` đã sinh lại và commit sha khớp HEAD
