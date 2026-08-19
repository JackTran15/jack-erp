# Evidence G4 — click-through thật, 2026-08-19

Môi trường: dev server **worktree** ở `localhost:3002` (KHÔNG phải `:3001` — server đó chạy
từ checkout gốc, không có thay đổi này), API `:4000`, DB `erp_dev`, chi nhánh **Hồ Chí Minh**,
tài khoản do người dùng tự đăng nhập. Kho xuất = `Kho hàng lỗi HCM`, Kho nhập =
`Hồ Chí Minh - Showroom`, tab **Xuất đi**.

Fixture (tra từ `item_storage_locations`, storage `9a6604e4…` = Kho hàng lỗi HCM):

| Mã | Kệ trong kho này |
|---|---|
| `ABA2777-D-38` | `A99.99` |
| `ABA2777-D-39`, `-D-41` | **không có** |

## Kết quả từng AC

| AC | Nội dung | Kết quả | Bằng chứng |
|----|---|---|---|
| AC-01 | Quét mã khớp tuyệt đối → dòng vào bảng | ✅ | Gõ `ABA2777-D-38` + 1 Enter → dòng 13:39 vào bảng, **0 lần chạm chuột** |
| AC-02 | Giữ người vận chuyển, focus về ô Hàng hóa | ✅ | Sau dòng 1, "Nhân viên HCM" còn nguyên; gõ tiếp mã thứ hai được ngay mà không đụng ô carrier |
| AC-03 | Thiếu carrier → báo lỗi, focus về ô carrier | ✅ | Xoá carrier rồi gõ `ABA2777-D-38` + Enter → dialog **"Vui lòng chọn người vận chuyển."**, vẫn 3 dòng, focus nhảy về ô *Người vận chuyển* (dropdown tự mở). Draft hàng hoá giữ nguyên để thử lại |
| AC-04 | Enter trên ô trống → không làm gì | ✅ | Enter khi ô Hàng hóa rỗng → vẫn 3 dòng, không toast lỗi |
| AC-05 | Enter dồn không tạo dòng trùng | ✅ | Bắn **2 `keydown` Enter trong cùng một tick** (không await, không setTimeout ở giữa) → thêm **đúng 1 dòng** (3→4). DB xác nhận chỉ 1 bản ghi lúc 13:57:53 |
| AC-06 | Không khớp tuyệt đối → dòng đầu sáng sẵn, Enter chọn | ✅ | Gõ `ABA2777-D-39` → dropdown mở, **dòng đầu nền xanh**, Enter → dòng 13:40 vào bảng |
| AC-07 | Mũi tên đổi lựa chọn | ✅ | Gõ `ABA2777` → ↓ → highlight sang `ABA2777-D-41` → Enter → **đúng D-41** vào bảng (dòng 13:45) |
| AC-08 | Không tìm ra → "Không có kết quả.", không thêm dòng | ✅ | Gõ `XXXX-KHONG-CO-THAT` + Enter → hiện "Không có kết quả.", vẫn 2 dòng, **chuỗi vẫn còn trong ô** |
| AC-09 | Checkout / PosSelect không đổi hành vi | ✅ | Ô tìm hàng Checkout gõ `ABA2777` → 6 kết quả, **không dòng nào sáng**. Dropdown *Kho xuất* và *Người vận chuyển* cũng không sáng dòng nào |
| AC-10 | Không giữ kệ của mặt hàng trước | ✅ | Xem bảng dưới |
| AC-11 | Dòng thêm ra mang đúng kệ | ✅ | `-D-38` lưu `source_location_id` = A99.99 dù Enter ngay lập tức |
| AC-12 | Không có kệ vẫn thêm được, cột Vị trí trống | ✅ | `-D-39` và `-D-41` vào bảng với Vị trí trống; ô *Vị trí* hiện placeholder "Chưa có vị trí" |
| AC-13 | Không còn khung "Không có kết quả." treo | ✅ | Sau mỗi lần tự chọn hàng, dưới ô Hàng hóa **sạch** |

## Bằng chứng cho lỗi gốc trong ảnh QA

Đây là chỗ lỗi cũ lộ ra rõ nhất — quét mặt hàng **có** kệ rồi ngay sau đó mặt hàng
**không** có kệ:

| Thời gian | Mã SKU | Vị trí trên bảng |
|---|---|---|
| 13:45 | ABA2777-D-41 | *(trống)* |
| 13:40 | ABA2777-D-39 | *(trống)* |
| 13:39 | ABA2777-D-38 | `A99.99` |

Bản cũ sẽ hiện `A99.99` cho cả ba dòng. Kiểm tiếp ở tầng dữ liệu:

```sql
select i.code, twl.notes, l.name as ke, twl.source_location_id is null as ke_rong
from temp_warehouse_lines twl
join items i on i.id = twl.item_id
left join locations l on l.id = twl.source_location_id
order by twl.created_at desc limit 2;
```
```
ABA2777-D-39 |        |        | t     ← NULL, đúng
ABA2777-D-38 | A99.99 | A99.99 | f     ← đúng kệ của chính nó
```

Cả `notes` lẫn `source_location_id` đều đúng, không dòng nào mang kệ của mặt hàng trước.

## Đính chính: hai AC ban đầu báo "chưa nghiệm"

Lần chạy đầu tôi ghi AC-03 và AC-05 là chưa nghiệm được. Sau khi soi lại thì **cả hai đều
là giới hạn của cách tôi lái trình duyệt, không phải lỗi ứng dụng** — và cả hai đều pass
khi kiểm đúng cách:

- **AC-03.** Tôi kết luận "nút × xoá carrier không bấm được". Sai. Đo bằng
  `getBoundingClientRect` thì nút nằm ở toạ độ trang **(473, 179)**, kích thước 20×20, và
  `document.elementFromPoint(473,179)` trả về đúng `<path>` bên trong nó — **không có gì
  che**. Các cú bấm trước của tôi rơi vào khoảng **(425, 160)**, lệch ~48px sang trái và
  ~19px lên trên, do tôi nhầm hệ toạ độ ảnh chụp với hệ toạ độ trang (viewport 2000px,
  ảnh 1524px → hệ số 1,31). Bấm đúng chỗ là chạy ngay.
- **AC-05.** Mỗi lần `key` của tôi là một vòng gọi công cụ riêng, cách nhau hàng trăm ms —
  không thể tái hiện hai Enter sát nhau như máy quét. Bắn thẳng 2 `keydown` trong cùng một
  tick thì rào `addInFlightRef` + `try/finally` chặn đúng: 1 dòng, không phải 2.

Bài học cho lần sau: đừng kết luận "không bấm được" từ vài cú bấm trượt — đo toạ độ thật
và `elementFromPoint` trước khi đổ cho giao diện.

## Còn lại cho người dùng

- Bước "lặp 10 lần xen kẽ" và bước "chặn `preferred-shelf/batch` rồi quét" của Demo script
  UOW-03 — mới chạy 3 lần quét, chưa chặn mạng.
- Toàn bộ đo bằng **bàn phím ảo**, chưa bằng **máy quét thật** (A-06 vẫn `pending`).
- Ba dòng kho tạm test ở trên còn nằm trong `erp_dev` chi nhánh HCM — xoá nếu vướng.
