---
feature: pos-stock-warning-showroom-only
ran_by: claude
ran_at: 2026-08-22
environment: erp_dev @ localhost:5433 (docker compose, project `jack-erp`)
---

# Kiểm chứng trên dữ liệu thật

## 1. A-06 / ADR-01 — `showrooms` có trùng `storages.is_main_storage` không?

```
   branch    |             main_storages              |           showroom_storages
-------------+----------------------------------------+----------------------------------------
 Hà Nội      | {2182550c-a63e-4ddd-9764-374c8c59a8f6} | {2182550c-a63e-4ddd-9764-374c8c59a8f6}
 CCC         | {ac67b783-aee6-4069-8431-36cab2a214b8} | {ac67b783-aee6-4069-8431-36cab2a214b8}
 Hồ Chí Minh | {676d5645-04d6-4d69-9399-ed4a1555d483} | {676d5645-04d6-4d69-9399-ed4a1555d483}
(3 rows)
```

**Trùng khít trên cả 3 chi nhánh**, mỗi chi nhánh đúng một main storage. Không có lỗi dữ liệu
để báo cáo trên dev. Xác nhận lại ở mức từng dòng ở mục 3: `isShowroom` và `isMainStorage`
bằng nhau trên mọi dòng tồn.

## 2. A-11 — chi nhánh nào không có main storage?

Không có (truy vấn trả 0 dòng). Nhánh thoái lui `itemLocationMap.get(itemId) ?? item.locationId`
không kích hoạt trên dev.

## 3. Câu SQL đã sửa có chạy được trên Postgres thật không?

Đây là rủi ro còn mở của T-01-02: ba câu SQL chỉ được phủ bằng mock. Đã chạy nguyên văn câu
`getCatalog` sau khi sửa, qua `PREPARE`/`EXECUTE` với đúng hai tham số thật:

```
                itemId                | quantity | locationName | isShowroom | isMainStorage |     code
--------------------------------------+----------+--------------+------------+---------------+---------------
 7f71001d-2765-4d5d-9db7-d75fd2a828ae | -4       | Mặc định     | t          | t             | ABA2777-D-38
 7f71001d-2765-4d5d-9db7-d75fd2a828ae | -1       | A99.99       | f          | f             | ABA2777-D-38
 7f71001d-2765-4d5d-9db7-d75fd2a828ae | 4        | A01.01       | f          | f             | ABA2777-D-38
 492fd67e-3a56-4854-9c35-6ac319ab2781 | -1       | Mặc định     | t          | t             | ABA2777-D-39
 492fd67e-3a56-4854-9c35-6ac319ab2781 | 18       | A01.01       | f          | f             | ABA2777-D-39
 ... (22 dòng đầu)
```

**Chạy được.** Đây là điều cần chứng minh: `st.branch_id::text = $2` trong khi cùng tham số
`$2` cũng được so với `sb.branch_id` (varchar). Bản đầu viết `st.branch_id = $2::uuid` sẽ làm
Postgres suy ra hai kiểu mâu thuẫn cho một tham số và từ chối chạy — mock không bắt được, chỉ
lượt chạy này bắt được.

Phụ thêm: `isShowroom` (bảng `showrooms`) và `isMainStorage` (`storages.is_main_storage`)
**bằng nhau trên mọi dòng**, củng cố mục 1 ở mức từng dòng chứ không chỉ mức tập hợp.

## 4. A-03 — độ phủ tồn showroom, và mức độ "cảnh báo liên tục"

```
branch       pos_visible_items  items_with_any_stock  items_with_showroom_stock
Hà Nội       19949              3                     0
CCC          0                  0                     0
Hồ Chí Minh  19949              28                    0
```

Số dòng `stock_balances` **dương** ở main storage trên toàn DB dev: **0**.

Vì sao bằng 0 — phân rã theo kho:

```
branch       storage               is_main  location   rows  qty
Hà Nội       Hà Nội - Showroom     t        Mặc định     1    -7
Hà Nội       Kho lưu trữ HN        f        A01.01       3     6
Hà Nội       Kho lưu trữ HN        f        A01.03       3     1
Hồ Chí Minh  Hồ Chí Minh - Showroom t       Mặc định    30   -92
Hồ Chí Minh  Kho hàng lỗi HCM      f        A99.99       2    -3
Hồ Chí Minh  Kho lưu trữ HCM       f        A01.01      15   291
Hồ Chí Minh  Kho lưu trữ HCM       f        A01.02      15    26
```

**Mọi tồn showroom trên dev đều âm.** Hàng nằm ở kho lưu trữ; showroom bị trừ mà chưa bao giờ
được bù.

Đây vừa là bằng chứng mạnh nhất cho chính lỗi đang chữa, vừa là cảnh báo về A-03:

- **Bằng chứng:** −92 ở showroom HCM chính là dấu vết tích luỹ của việc POS **vẫn luôn** trừ
  kho ở showroom trong khi cảnh báo đọc tổng chi nhánh (dương) nên im lặng suốt. Nếu POS trừ
  kho ở nơi khác thì con số này không thể âm.
- **Cảnh báo:** với dữ liệu dev, sau khi sửa thì **mọi** dòng bán đều cảnh báo. Ví dụ
  `ABA2777-D-39`: hôm nay POS ghi `Tồn: 17` (18 − 1) và chỉ đỏ khi bán quá 17; sau khi sửa ghi
  `Tồn: -1` và đỏ ngay từ 1 chiếc.

### Vì sao **chưa** kết luận là A-03 sai

Dev không phải production. Ảnh chụp hiện trường mà chủ sở hữu gửi
(`erp.giaymt.com.vn`, chi nhánh MT46, SKU `BX140`) cho thấy `Showroom MT46 / Mặc định = 4` —
**dương**. Nghĩa là production có xếp hàng ra showroom, còn dev thì không ai duy trì. Ba chi
nhánh trên dev (Hà Nội, CCC, Hồ Chí Minh) cũng không có MT46, nên fixture của
`02-requirements.md` không tồn tại ở đây.

### Việc phải làm trước khi bàn giao

Chạy đúng truy vấn ở mục 4 trên **dữ liệu production** trước khi bật cho quầy. Nếu tỉ lệ
`items_with_showroom_stock / items_with_any_stock` ở production cũng thấp thì A-03 cần mở lại
với chủ sở hữu: cảnh báo sẽ đúng về nghiệp vụ nhưng bật ở gần như mọi dòng, và một cảnh báo
luôn bật thì không còn là cảnh báo.
