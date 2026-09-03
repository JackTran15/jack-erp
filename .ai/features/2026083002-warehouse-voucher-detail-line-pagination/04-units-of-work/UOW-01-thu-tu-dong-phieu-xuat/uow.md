---
id: UOW-01
slug: thu-tu-dong-phieu-xuat
title: Dòng phiếu xuất kho giữ đúng thứ tự đã nhập
demoable: true
duration: 1.5d
depends_on: []
requirements: [US-01]
verifies: [AC-01, AC-02, AC-03, AC-04]
risk: high
status: todo
rollback: migration có `down` xoá cột `line_no` và unique index; hoàn tác đưa `getLines` về `order: { id: 'ASC' }`. Vì backfill đóng băng đúng thứ tự đang hiển thị hôm nay (ADR-02), hoàn tác không làm đổi thứ tự của bất kỳ phiếu nào.
---

# UOW-01 — Dòng phiếu xuất kho giữ đúng thứ tự đã nhập

Phải đi trước phân trang. Cắt trang trên một thứ tự tuỳ ý là biến một lỗi âm thầm thành
một lỗi thấy rõ ở trang 1 (A-12), nên giao UOW-02 trước UOW-01 là giao một hồi quy.

Đây là UoW rủi ro cao nhất của feature: nó là chỗ duy nhất có migration và backfill trên
một bảng đang chạy.

## Demo script

1. Tạo một phiếu xuất kho mới với ba dòng theo thứ tự A, B, C.
2. Lưu, đóng, mở lại phiếu ở chế độ xem → ba dòng hiện đúng thứ tự A, B, C.
3. Sửa phiếu, chèn thêm dòng D vào giữa, lưu, mở lại → thứ tự đúng như vừa sắp.
4. Mở một phiếu xuất **cũ** đã có từ trước khi chạy migration → phiếu hiện đủ dòng, thứ
   tự y hệt như trước khi chạy migration, không xáo trộn.
5. Mở một phiếu nhập kho bất kỳ → thứ tự không đổi, vẫn theo thứ tự nhập như trước.

## In scope

- Cột `line_no` trên `goods_issue_lines`, migration viết tay có backfill và unique index.
- Gán `lineNo` ở mọi đường ghi dòng phiếu xuất: tạo tay, sửa, nhập từ Excel, sinh tự động
  từ lệnh điều chuyển.
- `GoodsIssueService.getLines` sắp theo `lineNo`.

## Not in scope

- Phiếu nhập kho — đã có `createdAt` và đã sắp đúng (A-05).
- Cho người dùng kéo thả để sắp lại thứ tự dòng.
- Phân trang — đó là UOW-02 và UOW-03.

## Risks

| Risk | Mitigation |
| --- | --- |
| Backfill trên bảng lớn khoá bảng quá lâu | Thêm cột cho phép NULL trước, backfill, rồi mới đặt NOT NULL; đo thời gian trên bản sao dữ liệu thật trước khi chạy |
| Bỏ sót một đường ghi dòng, phiếu sinh ra vi phạm NOT NULL | T-01-02 liệt kê và đi qua từng đường ghi; T-01-03 có test cho đường nhập Excel và đường sinh từ lệnh điều chuyển |
| Panel cuộn vô hạn ở `GoodsIssuePage.tsx:879` đổi thứ tự sau backfill (A-08) | ADR-02 chọn đóng băng đúng thứ tự đang hiển thị, nên panel không đổi; T-01-03 khẳng định điều đó |
| `migration:generate` sinh drift khổng lồ | Viết tay theo quy ước sẵn có của repo (A-06) |

## Definition of done

- [x] AC-01, AC-02, AC-03 pass. **AC-04 đã chuyển sang UOW-04** ngày 3/9 (A-14, ADR-05): nó nay nói về `line_no` của phiếu nhập, không còn thuộc lát cắt này
- [x] Migration chạy `up` và `down` trên `erp_dev` **và** `prod_3008` (6.910 dòng / 458 phiếu) — xem T-07-02
- [x] Không NULL, không trùng, liền mạch 1..n trên toàn bộ 458 phiếu của `prod_3008`
- [x] `jest` 3543 pass; 2 đỏ duy nhất ở `auth.service.spec.ts` có sẵn từ trước, ngoài phạm vi
- [x] Demoed và được chấp nhận ở gate G4 — Akenzy, 2026-09-03
