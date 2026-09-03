---
id: UOW-01
slug: thu-tu-ghi-so-bu-kho-tam
title: Hàng bù từ kho tạm ghi sổ trước hoá đơn, thẻ kho không còn hiện âm
demoable: true
duration: 2d
depends_on: []
requirements: [US-01, US-02, US-03]
verifies: [AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09]
risk: medium
status: todo
rollback: hoàn tác 3 commit của UoW này. Không có migration, không có dữ liệu mới, không có hợp đồng API mới, nên hoàn tác đưa hệ thống về đúng hành vi hôm nay và các dòng sổ đã ghi vẫn hợp lệ.
---

# UOW-01 — Hàng bù từ kho tạm ghi sổ trước hoá đơn

Một lát cắt dọc duy nhất: từ tham số của đường ghi sổ, qua phiếu chuyển kho, tới
consumer bù kho tạm, rồi ra tới thẻ kho mà người dùng nhìn thấy. Tách nhỏ hơn nữa thì
mỗi mảnh đều không tự trình diễn được — một tham số tuỳ chọn chưa ai truyền vào thì
không có gì để xem.

## Demo script

1. Đăng nhập backoffice, chọn chi nhánh có dữ liệu.
2. Chọn một mặt hàng, đưa **tồn showroom về 0** và để **1 đơn vị trong phiên kho tạm**
   `warehouse_to_showroom` đang ACTIVE.
3. Mở POS, bán đúng 1 đơn vị mặt hàng đó, hoàn tất thanh toán.
4. Chờ consumer bù kho tạm chạy xong (theo dõi log `Invoice ... fulfilled from temp warehouse`).
5. Về backoffice, mở **Thẻ kho** của mặt hàng đó.
6. Đối chiếu: hai dòng chuyển kho tạm đứng **trên** dòng bán, cột số dư luỹ kế
   **không có dòng nào âm**, và dòng hoá đơn không còn hiện −1.
7. Bán thêm một lần nữa ở chi nhánh **không có** phiên kho tạm, mở lại thẻ kho, xác nhận
   không có phiếu chuyển nào sinh ra và mọi thứ như cũ.

## In scope

- `postedAt?: Date` trên `RecordMovementParams`, được tôn trọng ở cả hai đường ghi.
- `postedAt?: Date` trên `opts` của `StockTransferService.post` và `createAndPost`.
- Neo mốc theo dòng `SALE_ISSUE` của hoá đơn, kẹp trong ngày làm việc, trong
  `fulfillInvoiceFromTempWarehouse`.
- Log mốc đã dùng; cảnh báo khi không neo được.
- Test đơn vị cho tầng ghi sổ, test e2e cho luồng bù kho tạm.

## Not in scope

- Phiếu chuyển kho tạm do người dùng bấm tay qua `transferLines` (A-09).
- Luồng đổi và trả hàng ở `checkout-return.service.ts`.
- Cột thứ tự cho `stock_ledger_entries`.

## Risks

| Risk | Mitigation |
| --- | --- |
| `recordBatchMovements` là đường ghi dùng chung của toàn miền kho; sửa sai là hồi quy diện rộng | Tham số tuỳ chọn, mặc định giữ nguyên hành vi; AC-03 khẳng định điều đó bằng test trước khi bất kỳ caller nào truyền vào |
| Mốc lùi rơi sang kỳ báo cáo trước, làm lệch tồn đầu kỳ (A-05) | Kẹp bằng `businessDayStart` dùng chung với báo cáo cắt kỳ; AC-05 kiểm đúng ca biên |
| Consumer replay sinh mốc khác nhau | Neo theo dòng sổ bất biến chứ không theo đồng hồ của consumer; AC-06 kiểm |
| Sale rơi đúng mili giây đầu ngày thì vẫn có thể hiện −1 | Dư lượng đã biết và đã ghi ở ADR-02; không cố giải trong UoW này |

## Definition of done

- [ ] AC-01 đến AC-09 đều pass
- [ ] `pnpm --filter @erp/api test` xanh, không hồi quy ở miền kho
- [ ] Test e2e luồng bù kho tạm xanh
- [ ] Không có `UPDATE` nào lên `stock_ledger_entries` trong diff
- [ ] Không có chuỗi tiếng Việt nào trong mã NestJS được thêm mới
- [ ] Ảnh chụp thẻ kho trước và sau, đính vào bằng chứng G4
- [ ] Demoed và được chấp nhận ở gate G4
