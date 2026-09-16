---
feature: product-image-utilities
stories: 3
acceptance_criteria: 17
---

# Requirements — Cập nhật ảnh & Cập nhật ảnh nhanh

Dữ liệu mẫu dùng xuyên suốt (fixture của media-storage, `07-verification.md` của feature đó):
mẫu mã **A** `AAA-MEDIA-A` (có biến thể Màu × Size, owner `PRODUCT`), hàng lẻ **B** `AAA-MEDIA-B`
(owner `ITEM`), hàng lẻ **C** `AAA-MEDIA-C` (chưa có ảnh). "Nhóm" = một dòng của
`buildCombinedCte()` (mẫu mã hoặc hàng lẻ).

## US-01 — Tìm hàng hoá theo trạng thái ảnh

Là nhân viên danh mục, tôi muốn liệt kê hàng hoá theo *chưa có ảnh / đã có ảnh*, theo nhóm
hàng hoá và theo mã/tên, để biết còn bao nhiêu mẫu mã phải tải ảnh.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Hai mục mới trong Tiện ích
```gherkin
Given tôi có inventory.write và đang ở /admin/inventory-items
When tôi mở menu Tiện ích
Then menu có thêm "Cập nhật ảnh" và "Cập nhật ảnh nhanh" sau hai mục trạng thái
And chọn "Cập nhật ảnh" mở /admin/inventory-items/images, "Cập nhật ảnh nhanh" mở /admin/inventory-items/images/quick
And nút Quay lại trên cả hai trang đưa về /admin/inventory-items
```

**AC-02** — Mặc định: hàng chưa cập nhật ảnh
```gherkin
Given tổ chức có 2.448 nhóm đang kinh doanh (2.507 kể cả ngừng kinh doanh), trong đó A và B đã có ảnh
When tôi mở Cập nhật ảnh (bộ lọc mặc định "Hàng hóa chưa cập nhật ảnh", nhóm "Tất cả")
Then bảng hiện 50 dòng đầu theo mã tăng dần và chân trang ghi "Hiển thị 1 - 50 trên 2446 kết quả"
And không dòng nào là A hay B
And mỗi dòng có Mã SKU, Tên hàng hóa, Nhóm hàng hóa, cột Ảnh với placeholder và nút "Tải ảnh"
```

**AC-03** — Đã cập nhật ảnh / Tất cả
```gherkin
Given như AC-02
When tôi chọn "Hàng hóa đã cập nhật ảnh" và bấm Lấy dữ liệu
Then bảng chỉ còn A và B, cột Ảnh hiện thumbnail ảnh đầu tiên của mỗi dòng
When tôi chọn "Tất cả" và bấm Lấy dữ liệu
Then tổng là 2448, A và B có thumbnail, các dòng còn lại có placeholder
```

**AC-04** — Lọc theo nhóm hàng hoá (cây)
```gherkin
Given nhóm "GIÀY DÉP" có nhóm con "Giày nữ" và "Giày thể thao"; A thuộc "Giày nữ"
When tôi mở dropdown Nhóm hàng hóa
Then nhóm cha hiện thành tiêu đề, nhóm con thụt vào bên dưới (theo cây của /v2/inventory/item-categories/tree)
When tôi chọn "GIÀY DÉP" với bộ lọc "Tất cả" và bấm Lấy dữ liệu
Then kết quả gồm A và mọi nhóm thuộc "Giày nữ" hoặc "Giày thể thao"; không có nhóm thuộc "QUÀ TẶNG"
And cột Nhóm hàng hóa của A ghi "Giày nữ" (nhóm của biến thể)
```

**AC-05** — Tìm theo mã SKU hoặc tên
```gherkin
Given A có biến thể mã "AAA-MEDIA-A-DEN-39"
When tôi gõ "media-a-den" (khác hoa/thường) với bộ lọc "Tất cả" và bấm Lấy dữ liệu
Then kết quả có A (khớp mã biến thể) và không có B
When tôi gõ tên của B
Then kết quả có B
```

**AC-06** — Quyền
```gherkin
Given tài khoản chỉ có inventory.read
When tài khoản đó gọi POST /v2/inventory-items/images/search
Then 200 (đọc được)
When tài khoản đó gọi POST /inventory/items/set-images hoặc POST /media/uploads ownerType PRODUCT
Then 403
And trên giao diện tài khoản đó không thấy menu Tiện ích
```

## US-02 — Tải ảnh cho từng dòng

Là nhân viên danh mục, tôi muốn bấm **Tải ảnh** ngay trên dòng để chọn ảnh và gắn cho mẫu mã
đó, không phải mở form Sửa.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-07** — Tải ảnh thay toàn bộ bộ ảnh (A-01)
```gherkin
Given A đang có 3 ảnh và đang hiện trên bảng
When tôi bấm Tải ảnh trên dòng A và chọn 2 file hợp lệ x.png, y.png (theo thứ tự đó)
Then dòng A hiện thumbnail của x.png sau khi tải xong, không cần tải lại trang
And GET /admin/entities/inventory-items/records/<A> trả images đúng 2 URL, x trước y
And 3 media cũ của A có status DELETED
```

**AC-08** — Chặn file không hợp lệ trước khi tải
```gherkin
Given tôi bấm Tải ảnh trên một dòng
When tôi chọn file .pdf, hoặc ảnh 3 MB, hoặc 11 ảnh
Then không có lượt POST /media/uploads nào được gửi
And tôi thấy đúng thông báo của form hàng hoá ("Mỗi ảnh tối đa 2MB", "Tối đa 10 ảnh", định dạng không hỗ trợ)
```

**AC-09** — Owner suy từ dòng, không từ client
```gherkin
Given dòng A là mẫu mã (type product) và dòng C là hàng lẻ (type orphan)
When set-images nhận { assignments: [{ id: <A>, imageIds: [m1] }, { id: <C>, imageIds: [m2] }] }
Then m1 có owner_type PRODUCT / owner_id <A>, m2 có owner_type ITEM / owner_id <C>
And body không có trường ownerType; nếu gửi thêm thì 400 (forbidNonWhitelisted)
```

**AC-10** — Partial success
```gherkin
Given assignment thứ nhất hợp lệ, thứ hai dùng id của tổ chức khác, thứ ba dùng mediaId của tổ chức khác
When set-images nhận cả ba trong một lần gọi
Then 200 với updated = [dòng 1], failed = [{ id 2, reason OWNER_NOT_FOUND }, { id 3, reason MEDIA_NOT_FOUND }]
And ảnh của dòng 1 đã gắn, media của dòng 3 vẫn UPLOADED và chưa gắn
And gọi lại cùng body với cùng X-Idempotency-Key trả lại cùng response (REPLAYED), không ghi thêm
```

## US-03 — Cập nhật ảnh nhanh theo tên file

Là nhân viên nhập liệu, tôi muốn thả một thư mục ảnh đã đặt tên theo mã SKU và để chương trình
tự gắn ảnh cho từng mẫu mã.

**Priority:** must
**Depends on:** US-02 (dùng chung set-images)

### Acceptance criteria

**AC-11** — Phân loại từng file sau khi thả
```gherkin
Given tôi thả 6 file: "AAA-MEDIA-A (01).png", "AAA-MEDIA-A (02).png", "AAA-MEDIA-B.png",
  "aaa-media-a-den-39.png" (mã biến thể của A), "KHONG-CO.png", "to-3mb.png" (ảnh 3 MB)
When trang phân tích xong
Then mỗi thẻ file ghi: 01 và 02 → "Mẫu mã AAA-MEDIA-A", B → "Hàng hóa AAA-MEDIA-B",
  biến thể → "Gắn vào mẫu mã AAA-MEDIA-A (mã biến thể)", KHONG-CO → "Không có mã SKU hàng hóa trùng tên ảnh",
  to-3mb → "Mỗi ảnh tối đa 2MB"
And tiêu đề ghi "Cập nhật 4/6 ảnh"
And chưa có lượt POST /media/uploads nào
```

**AC-12** — Quy tắc tên file (server, `resolve-image-names`)
```gherkin
Given names = ["ABC (01)", "ABC(2)", "abc (10)", "ABC (11)", "ABC (00)", "ABC (01)", "XYZ"]
When gọi POST /v2/inventory-items/resolve-image-names với ABC là mẫu mã có thật, XYZ không có
Then "ABC (01)" → code ABC seq 1; "ABC(2)" → seq 2; "abc (10)" → seq 10
And "ABC (11)" và "ABC (00)" → error SEQ_OUT_OF_RANGE (không khớp ngay cả khi mã "ABC (11)" không tồn tại)
And "ABC (01)" lần hai → error DUPLICATE_SEQ
And "XYZ" → match null
And tên ngoài giới hạn 500 phần tử → 400
```

**AC-13** — Cập nhật ghi đè toàn bộ theo STT (A-02, A-03)
```gherkin
Given như AC-11, A đang có 3 ảnh cũ
When tôi bấm Cập nhật
Then A có đúng 3 ảnh mới theo thứ tự: (01), (02), rồi ảnh mã biến thể; 3 ảnh cũ DELETED
And B có đúng 1 ảnh
And có đúng 4 lượt POST /media/uploads và mỗi mẫu mã chỉ được gọi set-images một lần
And bốn thẻ đó chuyển sang trạng thái "Đã cập nhật", tiêu đề ghi "Cập nhật 4/6 ảnh"
```

**AC-14** — Lỗi từng file không chặn phần còn lại (A-04)
```gherkin
Given người dùng đã chạm hạn mức 100 lượt tải chưa gắn trong 24h
When tôi thả 2 file hợp lệ cho 2 mẫu mã khác nhau và bấm Cập nhật
Then thẻ nào bị 429 ghi "Hết hạn mức tải lên trong ngày, thử lại sau"
And thẻ còn lại (nếu tải được) vẫn được gắn
And toast tổng kết "Đã cập nhật k/N ảnh", nút Cập nhật bật lại để chạy tiếp các thẻ lỗi
```

**AC-15** — Đổi ảnh / bỏ file / thả thêm
```gherkin
Given một thẻ đang báo "Không có mã SKU hàng hóa trùng tên ảnh"
When tôi bấm Đổi ảnh và chọn "AAA-MEDIA-C.png"
Then thẻ đó phân loại lại thành "Hàng hóa AAA-MEDIA-C" và bộ đếm tăng 1
When tôi bấm (x) trên một thẻ
Then thẻ biến mất và N giảm 1
When tôi thả thêm file
Then thẻ mới nối vào cuối, thẻ cũ giữ nguyên trạng thái
```

**AC-16** — Trùng tên trong cùng lượt thả
```gherkin
Given tôi thả "ABC (01).png" rồi thả thêm "ABC (01).jpg"
When trang phân tích xong
Then thẻ thứ hai báo "Trùng STT 01 với file khác của mẫu mã ABC" và không được đếm
```

**AC-17** — Đang tải thì không rời trang mất dấu
```gherkin
Given đang bấm Cập nhật và còn file đang tải
When tôi bấm Quay lại
Then hộp thoại xác nhận "Đang tải ảnh, rời trang sẽ dừng các file chưa xong?"
And nút Cập nhật bị vô hiệu trong lúc chạy
```

## Non-functional

| Kind | Requirement | Verified by |
| --- | --- | --- |
| Performance | `images/search` mỗi trang phát đúng 2 truy vấn SQL (data + count) + 1 truy vấn media (`resolvePublicUrls` một lần cho cả trang) | T-01-01 |
| Performance | `resolve-image-names` 500 tên ⇒ 1 truy vấn products + 1 truy vấn items | T-02-01 |
| Performance | Trang ảnh nhanh tải lên tối đa 3 file đồng thời; 200 file không làm treo tab | T-02-03 |
| Security | Owner type/id chỉ suy từ id trong body qua bảng `products`/`items` của tổ chức actor; media của tổ chức khác ⇒ `MEDIA_NOT_FOUND` | T-01-02 |
| Contract | `pnpm openapi:generate` sau khi thêm 3 endpoint; `schema.ts` + `openapi.snapshot.json` commit | T-02-04 |
