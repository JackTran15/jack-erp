---
id: UOW-10
slug: document-detail-item-columns
title: Báo cáo "Chi tiết chứng từ" lọc được cột mặt hàng và giá bán
demoable: true
duration: 1d
depends_on: [UOW-06]
requirements: [US-02]
verifies: [AC-05, AC-20]
risk: medium
status: todo
rollback: revert phần specs; các cột này quay lại trả 400 như cuối UOW-06
---

# UOW-10 — Báo cáo "Chi tiết chứng từ" lọc được cột mặt hàng và giá bán

## Ghi chú thực thi (2026-08-22)

UoW này được tách khỏi UOW-06 vì T-06-01 phải gánh việc dựng file test **đầu tiên** cho
`document-detail.service.ts`, đẩy nó vượt trần 4h. Khi khung đó đã có, năm spec mặt hàng
và hai spec giá bán chỉ là những dòng khai báo — nên chúng đã được làm luôn trong UOW-06
thay vì mở một lượt riêng.

Lý do tách vẫn đúng (chi phí nằm ở khung test, không ở specs); chỉ là chi phí ấy đã trả
xong sớm hơn. Ba ticket dưới đây vì thế đóng bằng công việc đã thực hiện ở UOW-06, và
trạng thái trung gian "lọc cột mặt hàng trả 400" không bao giờ tồn tại.

## Demo script

1. Mở "Chi tiết chứng từ xuất nhập kho", lọc cột "Nhóm hàng" → dòng và footer đổi theo
2. Lọc "Màu" hoặc "Size" → khớp đúng giá trị mà cột đang hiển thị
3. Lọc "Giá bán nhập" trong một khoảng → còn đúng chứng từ có giá bán trong khoảng đó
4. Bấm Xuất khẩu với cùng bộ lọc → file khớp lưới

## In scope

- 5 spec mức mặt hàng: group, parentSku, parentName, color, size — cùng khuôn đã dùng ở T-02-01
- Join `products` / `inventory_item_categories` ở tầng ngoài, vào cả câu dữ liệu lẫn câu count
- 2 spec giá bán: inSalePrice, outSalePrice

## Not in scope

- Điền giá bán cho nguồn chứng từ không mang nó — dòng đó vốn null và vẫn null

## Risks

| Risk | Mitigation |
|---|---|
| Nguồn chứng từ không mang giá bán trả NULL; vị từ số sẽ loại dòng đó, khác với JS coi null là 0 (A-03) | Ghi rõ trong test đó là hành vi mong muốn, để lần sau không ai tưởng là bug |

## Definition of done

- [x] AC-05 xanh trên cả ba nguồn chứng từ
- [x] Mọi khoá trong `COLUMNS` của báo cáo này đều tra ra spec
- [x] `pnpm --filter @erp/api test` xanh
- [ ] Demo được nghiệm thu ở gate G4
