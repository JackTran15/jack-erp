---
feature: exchange-revenue-transfer-stock
blocking_open: 4
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | Trên POS › Tổng hợp, số QA nhìn là ô **Doanh thu** (`revenue.total` = tiền đã thu theo phương tiện), không phải ô **Hàng bán**. `goodsSold` đã tách theo `direction` và đã cộng đủ phần mua thêm — một hoá đơn đổi ngang chỉ thu phần chênh nên Doanh thu ra 0 là đúng định nghĩa hiện tại | medium | yes | Nếu sai: POS Tổng hợp không cần sửa số nào, cả UOW đó biến mất. Nếu đúng: phải chốt Doanh thu có gồm giá trị hàng bán hay không | pending | — |
| A-02 | Trên **Doanh thu theo mặt hàng**, cách sửa là **thêm cột** (hàng bán gộp / hàng trả) chứ không sửa cột `revenue.goods` đang có — vì `revenue-by-item-misa-parity` đã chốt bộ cột khớp MISA và đổi nó là phá đối chiếu đã nghiệm thu | medium | yes | Bộ cột là hợp đồng API + report template + cấu hình cột người dùng đã lưu; chọn nhầm hướng phải làm lại cả UOW | pending | — |
| A-03 | Trên **Kết quả kinh doanh**, doanh thu hàng hoá đi qua `signedGoods()` (EXCHANGE = `netAmount`) và sẽ tách thành hai thành phần gộp, giữ nguyên số tổng | medium | yes | `signedGoods` là hàm dùng chung của `report-core`; đổi nó ảnh hưởng mọi báo cáo header, không chỉ Kết quả kinh doanh | pending | — |
| A-04 | D2 nằm ở đường **nhập điều chuyển "warn-but-allow"** (`goods-receipt.service.ts:1236`): phiếu nhập purpose `TRANSFER_IN` được ghi sổ mà **không** bắt buộc có phiếu xuất đối ứng, nên kho nhận cộng còn kho xuất không trừ | low | yes | Quyết định D2 là 1 ticket (chặn/bù chân xuất) hay 3 ticket (mỗi luồng một lỗi). Đoán sai là lệch nguyên UOW | pending | — |
| A-05 | Luồng **Chuyển kho cùng chi nhánh** không lỗi ở khâu ghi sổ: trên erp_dev 14/14 cặp `TRANSFER_OUT/TRANSFER_IN` cân đúng (−33/+33) và `createAndPost` có `validateOnHand` | high | no | Nếu QA vẫn thấy sai ở luồng này thì lỗi ở màn đọc, không ở khâu ghi — đổi ticket từ service sang aggregation | pending | — |
| A-06 | "Vị trí hàng hoá / chi tiết kệ" trừ tại **kệ mặc định** của kho nguồn (`resolveStorageTransferLocation`), nên QA xem một kệ khác sẽ thấy "chưa trừ" dù kho đã trừ đủ | medium | no | Không đổi phạm vi code, nhưng đổi hẳn kịch bản demo ở G4 | pending | — |
| A-07 | Không backfill dữ liệu lịch sử — chỉ sửa hành vi từ nay | high | no | Nếu người dùng cần backfill thì thêm một UOW migration riêng | pending | — |
| A-08 | Bất biến "Σ quantity toàn tổ chức của một phiếu điều chuyển = 0" đủ mạnh để làm test tự động cho D2 | high | no | Nếu có luồng cố ý lệch (hao hụt vận chuyển) thì test này báo đỏ oan | pending | — |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
|----|----------------|----------------------|-------------|
| A-09 | Ba dòng `TRANSFER_IN` lẻ trên erp_dev (`reference_type = GOODS_RECEIPT`, +9, không có chân OUT) là bằng chứng của D2 | Chân xuất của LDC000001 **có** được ghi, chỉ khác movement type: `GOODS_ISSUE −9` tại chi nhánh nguồn qua phiếu XK000002. Toàn tổ chức cân bằng | Bỏ giả thuyết "liên chi nhánh không trừ kho"; D2 phải có ca tái hiện thật từ QA trước khi chốt nguyên nhân (→ A-04) |
| A-10 | Hoá đơn đổi trả không lưu dòng "mua thêm", nên báo cáo không có gì để cộng | Có lưu đủ: trên erp_dev `EXCHANGE/OUT` = 13 dòng / 8.521.000 và `EXCHANGE/IN` = 11 dòng / 6.981.000, `direction` đúng | D1 không phải lỗi ghi dữ liệu mà là lỗi **cách đọc**, và khác nhau ở từng màn → không gộp được thành một ticket chung |
