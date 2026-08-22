---
feature: pos-stock-warning-showroom-only
stories: 4
acceptance_criteria: 13
---

# Requirements — Cảnh báo vượt tồn ở POS tính trên tồn showroom

## Hiện trường tái hiện

Mọi AC dưới đây dùng chung fixture có thật ở chi nhánh **MT46** (ảnh chụp màn hình
`inventory/item-location-details`, 2026-08-21):

| SKU | Vị trí | Kho | Tồn |
|---|---|---|---|
| `BX140` | `999` | Kho MT46 (kho lưu trữ) | 8 |
| `BX140` | `Mặc định` | Showroom MT46 | 4 |

`quantityOnHand` (tổng chi nhánh) = **12** · tồn showroom = **4**.

Fixture thứ hai, cho nhánh "chưa ra quầy" (A-03) — một mặt hàng POS-visible chỉ có
`stock_balances` ở kho lưu trữ, không có dòng nào ở storage showroom: tổng chi nhánh > 0,
tồn showroom = **0**.

---

## US-01 — Thu ngân thấy cảnh báo ngay khi vượt tồn quầy

Là thu ngân, tôi muốn dòng hàng đỏ lên ngay khi số lượng bán vượt quá số hàng **đang có ở
quầy**, để không hứa với khách một lượng hàng mà quầy không có sẵn.

- **AC-01** — Given `BX140` tại MT46 (showroom 4, kho 8), When thu ngân nhập SL = **5**,
  Then dòng hiện chấm cảnh báo đỏ và tooltip ghi `Tồn: 4`.
- **AC-02** — Given cùng bối cảnh, When SL = **4**, Then **không** có chấm cảnh báo.
- **AC-03** — Given cùng bối cảnh, When SL = **13** (vượt cả tổng chi nhánh), Then vẫn cảnh
  báo, và tooltip vẫn ghi `Tồn: 4` — không bao giờ hiện `12`.
- **AC-04** — Given mặt hàng chỉ có tồn ở kho lưu trữ (showroom = 0), When thêm vào giỏ với
  SL = 1, Then cảnh báo bật ngay và tooltip ghi `Tồn: 0` (A-03).

## US-02 — Dialog xác nhận bán khống nói cùng một con số

Là thu ngân, tôi muốn bảng "Cảnh báo xuất quá số lượng tồn" lúc thu tiền khớp với cảnh báo
đã thấy trên dòng, để không phải đoán con số nào mới đúng.

- **AC-05** — Given giỏ có `BX140` SL = 5, When bấm **Thu tiền (F9)**, Then dialog
  "Cảnh báo xuất quá số lượng tồn" liệt kê dòng đó với `Số lượng tồn = 4` và
  `Tồn khả dụng = 4`.
- **AC-06** — Given dialog đang mở, When bấm "Vẫn bán", Then hoá đơn vẫn thanh toán được —
  bán khống **không** bị chặn (Out of scope của `00-intent.md`).
- **AC-07** — Given giỏ có `BX140` SL = 4, When bấm **Thu tiền (F9)**, Then dialog **không**
  bật (trước feature này cũng không bật — hành vi không đổi ở mốc dưới ngưỡng showroom).

## US-03 — Dialog chọn biến thể dùng cùng cơ sở

Là thu ngân, tôi muốn số tồn thấy trong dialog chọn biến thể đúng bằng số tồn thấy sau khi
món đó vào giỏ, để một thao tác không cho hai con số.

- **AC-08** — Given lưới sản phẩm mở dialog chọn biến thể cho product chứa `BX140`, When
  dialog render, Then dòng biến thể ghi `Tồn: 4` (không phải 12).
- **AC-09** — Given dialog đang mở, When tick chọn biến thể và nhập SL = 5, Then dòng biến
  thể hiện chấm đỏ + tooltip `Tồn: 4`.
- **AC-10** — Given đã chọn biến thể SL = 5 và bấm thêm vào giỏ, When dòng xuất hiện trong
  hoá đơn, Then `maxQty` của dòng = **4** — cảnh báo trong dialog và cảnh báo trên dòng giỏ
  không lệch nhau.

## US-04 — Cơ sở tồn giữ nguyên cho mọi consumer khác

Là người bảo trì, tôi muốn thay đổi này chỉ đụng đúng đường cảnh báo của màn bán hàng, để
Chuyển kho nhanh và các luồng khác không đổi hành vi âm thầm.

- **AC-11** — Given cùng request catalog, When BE trả về, Then `quantityOnHand` **vẫn** là
  tổng mọi vị trí trong chi nhánh (12 với `BX140`) và tập mặt hàng trả về **không đổi** —
  mặt hàng chỉ có tồn ở kho lưu trữ vẫn nằm trong kết quả (A-04, A-07).
- **AC-12** — Given quét mã vạch/SKU `BX140` ở ô tìm hàng (`lookupByCode`), When dòng được
  thêm vào giỏ, Then `maxQty` = **4** — giống hệt đường tìm kiếm (A-10).
- **AC-13** — Given giỏ đang có `BX140` với `maxQty = 4`, When catalog refetch
  (`syncPurchaseCartOnHand`, sau checkout hoặc hết `staleTime`), Then `maxQty` vẫn = **4**,
  không quay về 12 (A-08).

---

## Kiểm chứng bắt buộc trước G4

Ngoài AC, Demo script của UOW-01 phải chạy truy vấn đối chiếu định nghĩa "showroom" giữa
đường cảnh báo và đường trừ kho (A-05, A-06): với mỗi chi nhánh, tập `showrooms.storage_id`
so với tập `storages.id WHERE is_main_storage = true`. Lệch nhau là phát hiện phải báo cáo,
không được lặng lẽ đi tiếp.
