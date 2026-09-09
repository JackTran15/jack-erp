---
id: UOW-02
slug: cart-stock-sync
title: Đồng bộ tồn giỏ hàng theo đúng những item đang có trong giỏ
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-04, AC-05, AC-06, AC-07]
risk: high
status: todo
rollback: revert 1 commit FE — `useSyncCartOnHand` quay lại đọc `useCatalogQuery`, endpoint mới nằm im
---

# UOW-02 — Đồng bộ tồn giỏ

## Demo script
1. POS `:3001`, chi nhánh Cà Mau. DevTools > Network, lọc `catalog`.
2. Mở trang với giỏ **trống** → **0** request `/catalog/stock` (AC-05).
3. Thêm 3 mặt hàng → đúng **1** `POST /catalog/stock`, body đúng 3 `itemId`,
   response 3 phần tử (AC-04).
4. Thêm một mặt hàng `sellableQuantity = 0` → chấm cảnh báo vượt tồn hiện, y như trước.
5. Lưu tạm hoá đơn, F5, mở lại hoá đơn lưu tạm → cả các dòng khôi phục đều có snapshot
   tồn, **không** dòng nào kẹt cảnh báo oan (AC-06).
6. So `sellableQuantity` một dòng với `GET /catalog/search?q=<code>&mode=exact` (AC-07).

## In scope
- `catalogService.stockForItems`, hook React Query, `useSyncCartOnHand` đổi nguồn.

## Not in scope
- `filteredProducts` / Enter (UOW-03).
- Gỡ `useCatalogQuery` khỏi `use-checkout-catalog` (UOW-04) — sau UoW này nó vẫn còn
  consumer, nên chưa gỡ được.

## Risks
| Risk | Mitigation |
|---|---|
| Vòng lặp effect `unknownOnHandLines` biến thành vòng lặp **request** — mỗi lần fetch xong lại đổi state lại fetch | Điều kiện dừng giữ nguyên: hàng không có bản ghi tồn thì `unknownOnHandLines` **đứng yên** chứ không giảm, nên effect không chạy lại. Done-when đếm số request thật trên network panel, không suy luận |
| Dòng khôi phục từ hoá đơn lưu tạm không được điền tồn | Đó chính là lý do vòng lặp tồn tại ([[project_pos_draft_invoice_fixes]]); demo bước 5 là bài kiểm, không phải suy luận |
| `itemIds` đổi reference mỗi render → fetch liên tục | Key React Query dựng từ mảng id **đã sort + join**, không từ reference |
| Giỏ 0 dòng vẫn gọi API | `enabled: itemIds.length > 0` (ADR-02); demo bước 2 |

## Definition of done
- [x] AC-04, AC-05, AC-06, AC-07 pass
- [x] Network panel: giỏ trống → 0 request; giỏ 3 dòng → đúng 1 request
- [x] Ảnh chụp cảnh báo vượt tồn trước/sau, giống nhau
- [x] Ảnh chụp giỏ khôi phục từ hoá đơn lưu tạm, không dòng nào cảnh báo oan
- [x] `npx vitest run` ở `apps/pos-web` không dài thêm dòng đỏ nào
- [x] Demoed và accepted ở G4
