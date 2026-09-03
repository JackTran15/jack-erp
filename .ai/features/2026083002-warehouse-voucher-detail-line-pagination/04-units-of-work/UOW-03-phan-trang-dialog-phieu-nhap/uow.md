---
id: UOW-03
slug: phan-trang-dialog-phieu-nhap
title: Dialog xem chi tiết phiếu nhập phân trang, và hai chế độ kia không hồi quy
demoable: true
duration: 1.5d
depends_on: [UOW-02]
requirements: [US-03]
verifies: [AC-08, AC-09, AC-10]
risk: medium
status: todo
rollback: hoàn tác các commit phía web của UoW này; UOW-02 vẫn đứng độc lập và phiếu xuất vẫn phân trang bình thường.
---

# UOW-03 — Dialog xem chi tiết phiếu nhập phân trang

Đi sau UOW-02 vì nó dùng lại đúng lưới phân trang mà UOW-02 dựng ra. Làm song song hai
dialog sẽ đẻ ra hai cách giải khác nhau cho cùng một bài toán.

UoW này cũng là chỗ đóng lại lời hứa quan trọng nhất của cả feature: **hai chế độ kia
không hồi quy**.

## Demo script

1. Mở danh sách phiếu nhập kho, chọn một phiếu có ít nhất 200 dòng.
2. Bấm số phiếu → dialog mở, lưới hiện một trang dòng, thanh phân trang hiện tổng số dòng.
3. Chuyển qua vài trang → dòng liền mạch, không trùng không sót.
4. Mở cùng phiếu đó ở chế độ **sửa**: thêm một dòng, sửa số lượng một dòng, xoá một dòng,
   lưu → mở lại, cả ba thay đổi đều đúng, không dòng nào mất.
5. Tạo mới một phiếu nhập nhiều dòng bằng nhập Excel → lưới hiện đủ dòng, lưu bình thường.
6. In phiếu và xuất Excel phiếu 200 dòng → tệp kết quả có **đủ** 200 dòng, không phải chỉ
   trang đang xem.

## In scope

- Lưới dòng chế độ xem của `GoodsReceiptFormDialog` đọc từ `/:id/lines`, dùng lại lưới của UOW-02.
- Nối đường mở dialog ở `PurchaseOrdersPage` sang `includeLines=false`.
- Test hồi quy cho chế độ tạo và chế độ sửa của **cả hai** dialog.
- Khẳng định in và xuất Excel vẫn đủ dòng.
- Số đo thời gian mở dialog trước và sau.

## Not in scope

- Tách nhỏ hai file dialog hay refactor chúng ngoài phần lưới dòng.
- Phân trang cho phiếu chuyển kho, phiếu kiểm kê, đơn mua hàng.

## Risks

| Risk | Mitigation |
| --- | --- |
| `GoodsReceiptFormDialog` có effect riêng bám vào `lines` mà `GoodsIssueFormDialog` không có | T-03-01 rà lại từng effect của chính file này, không suy từ file kia |
| In và xuất Excel âm thầm chỉ lấy trang đang xem | T-03-03 kiểm trên phiếu nhiều hơn một trang, đếm dòng trong tệp kết quả |
| Hồi quy chế độ sửa chỉ lộ ra khi lưu | T-03-02 kiểm cả vòng thêm, sửa, xoá rồi lưu rồi mở lại |

## Definition of done

- [x] AC-08, AC-09, AC-10 pass
- [x] Kiểm tay đủ trên dialog **phiếu xuất**. Dialog **phiếu nhập KHÔNG kiểm tay** — Akenzy chọn không tạo thêm chứng từ POSTED trong snapshot prod (T-03-02); phần đó khoá bằng 7 test ở T-04-03 cộng verify live chế độ xem/sửa ở T-06-03
- [x] 4 test ở T-03-03 khoá `getPrintPayload` gọi `getById` **không** kèm `includeLines=false`, và phiếu 120 dòng cho payload 120 dòng
- [x] Ghi ở T-03-03 — **và kết quả không như feature kỳ vọng**: payload còn 42 % nhưng thời gian là 136 %/172 % ở 120 dòng, hoà vốn ≈ 447 dòng trên localhost
- [x] Demoed và được chấp nhận ở gate G4 — Akenzy, 2026-09-03
