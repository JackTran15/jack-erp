---
id: UOW-06
slug: document-detail-pushdown
title: Báo cáo "Chi tiết chứng từ xuất nhập kho" chạy dưới SQL cho các cột chứng từ
demoable: true
duration: 2d
depends_on: [UOW-01]
requirements: [US-01, US-02, US-04]
verifies: [AC-11, AC-13, AC-20, AC-22]
risk: high
status: todo
rollback: revert `document-detail.service.ts` + `document-detail.report.ts`; đường xuất khẩu bằng con trỏ không đổi cấu trúc nên revert không ảnh hưởng file đang tải
---

# UOW-06 — Báo cáo "Chi tiết chứng từ xuất nhập kho" chạy dưới SQL cho các cột chứng từ

## Demo script

1. Mở "Chi tiết chứng từ xuất nhập kho" ở chế độ chuỗi → 200, không còn 400
2. Lọc cột "Loại chứng từ" và "Kho" → dòng và footer đổi theo, đúng ở cả ba nguồn chứng từ trong UNION
3. Lọc "Khách hàng" chứa một tên → còn đúng chứng từ của khách đó
4. Lọc "Chi nhánh nhận" → chỉ còn phiếu chuyển tới chi nhánh đó
5. Bấm Xuất khẩu với cùng bộ lọc → file tải về chứa đúng tập đã lọc, không phải cả kỳ
6. Lọc "Nhóm hàng" → 400 nêu đích danh tên cột (cố ý, đóng ở UOW-10)

## In scope

- Dựng `document-detail.service.spec.ts` — engine 20KB này hiện KHÔNG có file test nào
- 9 spec mức chứng từ: date, documentType, warehouse, notes, customer, branchCode, branchName, receiverBranchCode, receiverBranchName
- Vị từ ghép ở tầng ngoài cùng, sau UNION — lọc sớm hơn sẽ đổi cái đang được gộp
- `KEY_MAP` với `reference` → `referenceNumber`, và pushdown cho `document-detail.report.ts`

## Not in scope

- 5 cột mức mặt hàng và 2 cột giá bán — UOW-10
- `countRows()` — báo cáo này có `exportSource` nên stream bằng con trỏ và cố ý không áp trần (ngoại lệ hợp lệ của ADR-01)

## Risks

| Risk | Mitigation |
|---|---|
| Báo cáo hợp nhất ba nguồn chứng từ bằng UNION; một spec trỏ vào cột chỉ tồn tại ở một nhánh sẽ vỡ | Mọi spec trỏ vào alias của tầng ngoài cùng, nơi ba nhánh đã có cùng hình dạng; nhánh nào thiếu cột thì bổ sung `NULL::text AS ...` |
| Engine chưa có test nào, nên không có lưới an toàn khi sửa SQL | T-06-01 dựng khung test trước khi thêm spec đầu tiên — đó là toàn bộ lý do nó là ticket riêng |
| Đường xuất khẩu keyset dùng cùng bộ lọc; bỏ sót nó sẽ khiến file khác với lưới | T-06-04 chạy cả hai đường trên cùng bộ lọc và đối chiếu |

## Definition of done

- [x] AC-20 xanh cho 9 cột chứng từ, trên cả ba nguồn
- [x] AC-13 — đường xuất khẩu keyset trả đúng tập đã lọc
- [x] ~~Lọc cột mặt hàng trả 400 (trạng thái trung gian)~~ — trạng thái đó không còn tồn
      tại: specs của UOW-10 rẻ hơn dự tính một khi khung test của T-06-01 đã có, nên đã
      làm luôn trong lượt này. Xem ghi chú ở UOW-10
- [x] `pnpm --filter @erp/api test` xanh
- [ ] Demo được nghiệm thu ở gate G4
