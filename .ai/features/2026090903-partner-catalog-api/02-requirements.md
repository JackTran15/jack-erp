---
feature: partner-catalog-api
stories: 4
acceptance_criteria: 22
---

# Requirements — 3 API danh mục hàng hoá cho đối tác

Ba endpoint, một bề mặt. Ký hiệu route dùng trong tài liệu này (chốt ở ADR-01):

| # | Chức năng | Route |
|---|---|---|
| 1 | Nhóm hàng hoá | `POST /v2/partner/catalog/categories/tree` |
| 2 | Tìm sản phẩm | `POST /v2/partner/catalog/products/search` |
| 3 | Chi tiết sản phẩm | `GET /v2/partner/catalog/products/:productId` |

Mọi request xác thực bằng header `X-Api-Key` (hoặc JWT, vì `AuthGuard` nhận cả hai).
Không endpoint nào gắn `@Public()`.

---

## US-01 — Đối tác lấy cây nhóm hàng hoá để dựng menu

Là hệ thống storefront của đối tác, tôi muốn lấy toàn bộ cây nhóm hàng hoá đang hoạt động
để dựng menu nhiều cấp và biết nhánh nào có hàng.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Happy path, cây lồng nhau
```gherkin
Given tổ chức có nhóm "GIÀY DÉP" (gốc) với nhóm con "Giày nữ", và "Giày nữ" có nhóm con "Giày cao gót"
When đối tác gọi POST /v2/partner/catalog/categories/tree với X-Api-Key hợp lệ
Then response 200 có dạng { data: [...] }
And "GIÀY DÉP" nằm ở mức gốc, "Giày nữ" nằm trong children của nó, "Giày cao gót" nằm trong children của "Giày nữ"
And mỗi node có id, code, name, parentId, productCount, children
```

**AC-02** — Chỉ nhóm ACTIVE, chỉ trong tổ chức của key
```gherkin
Given tổ chức A có 3 nhóm ACTIVE và 1 nhóm INACTIVE, tổ chức B có 5 nhóm ACTIVE
When đối tác gọi endpoint bằng API key của tổ chức A
Then response chỉ chứa 3 nhóm của tổ chức A
And không chứa nhóm INACTIVE
And không chứa nhóm nào của tổ chức B
```

**AC-03** — Đếm sản phẩm gộp cả nhánh con
```gherkin
Given nhóm cha "GIÀY DÉP" không có item nào gắn trực tiếp, nhưng nhóm con "Giày nữ" có 40 product
When đối tác gọi endpoint
Then productCount của "GIÀY DÉP" là 40, không phải 0
```

**AC-04** — Tổ chức chưa có nhóm nào
```gherkin
Given tổ chức của key chưa tạo nhóm hàng nào
When đối tác gọi endpoint
Then response 200 với { data: [] }
And không trả lỗi
```

---

## US-02 — Đối tác tìm sản phẩm có lọc, phân trang, sắp xếp

Là hệ thống storefront, tôi muốn truy vấn danh sách sản phẩm theo từ khoá, nhóm hàng,
khoảng giá, màu và kích thước, có phân trang và 3 kiểu sắp xếp, để dựng trang danh mục.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-05** — Phân trang
```gherkin
Given tổ chức có 107 sản phẩm khớp bộ lọc
When đối tác gọi search với page=1, limit=20
Then response { data, total, page, limit } có data đúng 20 phần tử, total = 107, page = 1, limit = 20
And gọi lại với page=6 trả về 7 phần tử còn lại
```

**AC-06** — Lọc theo nhóm hàng, bao gồm cả nhóm con
```gherkin
Given nhóm cha "GIÀY DÉP" không có item gắn trực tiếp, nhóm con "Giày nữ" có 40 product
When đối tác search với categoryId của "GIÀY DÉP"
Then response trả về 40 product đó
And total = 40, không phải 0
```

**AC-07** — Lọc theo khoảng giá
```gherkin
Given danh mục có sản phẩm giá 495.000, 750.000 và 1.650.000
When đối tác search với priceFrom=500000 và priceTo=1000000
Then chỉ sản phẩm 750.000 nằm trong kết quả
And sản phẩm có nhiều biến thể được tính theo khoảng giá của chính nó (giao nhau là khớp)
```

**AC-08** — Lọc theo màu và kích thước
```gherkin
Given product P có biến thể (38, BA) và (39, BA), product Q chỉ có biến thể (38, D)
When đối tác search với colors=["BA"]
Then chỉ P nằm trong kết quả
When đối tác search với colors=["BA"] và sizes=["39"]
Then chỉ P nằm trong kết quả, và khớp phải đến từ CÙNG một biến thể
When đối tác search với colors=["D"] và sizes=["39"]
Then kết quả rỗng, vì không biến thể nào vừa màu D vừa size 39
```

**AC-09** — Lọc theo từ khoá
```gherkin
Given có sản phẩm tên "Giày búp bê MY88610" mã "MY88610"
When đối tác search với keyword="búp bê"
Then sản phẩm đó nằm trong kết quả
When đối tác search với keyword="MY88610"
Then sản phẩm đó nằm trong kết quả
```

**AC-10** — Ba kiểu sắp xếp
```gherkin
Given danh mục có sản phẩm giá 495.000, 750.000 và 1.650.000, tạo ở các thời điểm khác nhau
When đối tác search với sort="price_asc"
Then thứ tự là 495.000, 750.000, 1.650.000, sắp theo priceMin của mỗi product
When đối tác search với sort="price_desc"
Then thứ tự đảo lại
When đối tác search với sort="newest"
Then sản phẩm tạo sau đứng trước
And sort không truyền thì mặc định là "newest"
And sort="popular" trả 400, vì A-04 đã loại giá trị này khỏi hợp đồng
```

**AC-11** — Hình dạng dòng kết quả
```gherkin
Given một product có 2 biến thể giá 495.000 và 750.000
When đối tác search
Then dòng kết quả có id, code, name, categoryId, categoryName, priceMin=495000, priceMax=750000, colors, sizes, inStock, images
And colors là mảng mã màu thô của ERP (ví dụ ["BA","D"]) theo chốt A-02, không phải tên hay mã hex
And priceMin/priceMax là number, không phải string
And images là mảng rỗng
```

**AC-12** — Cờ tồn kho toàn tổ chức
```gherkin
Given product P hết hàng ở chi nhánh HCM nhưng còn 5 cái ở chi nhánh Hà Nội
And API key có branchIds = NULL (toàn tổ chức)
When đối tác search
Then inStock của P là true
And kết quả không đổi khi request có hay không có header X-Branch-Id
```

**AC-13** — Không kết quả
```gherkin
Given không sản phẩm nào khớp bộ lọc
When đối tác search
Then response 200 với { data: [], total: 0, page, limit }
```

**AC-14** — Validation đầu vào
```gherkin
Given ValidationPipe toàn cục bật forbidNonWhitelisted
When đối tác gửi field không khai trong DTO
Then response 400
When đối tác gửi limit=500
Then response 400, vì limit tối đa là 100
When đối tác gửi sort="random"
Then response 400
```

---

## US-03 — Đối tác lấy chi tiết một sản phẩm

Là hệ thống storefront, tôi muốn lấy đầy đủ thông tin một sản phẩm cùng các biến thể để
dựng trang chi tiết có chọn màu và size.

**Priority:** must
**Depends on:** US-02

### Acceptance criteria

**AC-15** — Happy path
```gherkin
Given product "Giày búp bê MY88610" có 5 biến thể size 35..39
When đối tác gọi GET /v2/partner/catalog/products/<id>
Then response 200 có id, code, name, description, categoryId, categoryName, priceMin, priceMax, inStock, images, attributes, variants
And attributes liệt kê các chiều thuộc tính và giá trị có thể chọn, ví dụ Size: [35,36,37,38,39]
And variants có 5 phần tử, mỗi phần tử có id, code, variantLabel, price, inStock, attributes
And images là mảng rỗng
```

**AC-16** — Không tìm thấy
```gherkin
Given id không tồn tại
When đối tác gọi GET /v2/partner/catalog/products/<id>
Then response 404
```

**AC-17** — Không lộ sự tồn tại của sản phẩm tổ chức khác
```gherkin
Given product P thuộc tổ chức B
When đối tác dùng API key của tổ chức A gọi GET /v2/partner/catalog/products/<id của P>
Then response 404, không phải 403
And thông điệp lỗi không tiết lộ P có tồn tại
```

**AC-18** — Product không có biến thể nào đang hoạt động
```gherkin
Given product P có 3 item nhưng cả 3 đều is_active = false
When đối tác gọi GET chi tiết của P
Then response 404, đồng nhất với việc P không xuất hiện trong kết quả search
```

---

## US-04 — Bề mặt đối tác không lộ dữ liệu nội bộ

Là chủ tổ chức, tôi muốn cấp API key cho đối tác mà không trao kèm quyền đọc giá vốn hay
bất kỳ endpoint kho nội bộ nào.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-19** — Không có giá vốn ở bất kỳ đâu trong hợp đồng đối tác
```gherkin
Given toàn bộ response DTO của module partner-catalog
When quét mã nguồn các DTO đó
Then không xuất hiện purchasePrice, purchase_price, hay bất kỳ trường giá vốn nào
And kiểm tra này chạy như một test, không phải rà bằng mắt
```

**AC-20** — Key đối tác không mở được endpoint kho nội bộ
```gherkin
Given một API key chỉ được gán quyền partner.catalog.read
When key đó gọi POST /v2/inventory-items/search
Then response 403
And khi gọi POST /v2/partner/catalog/products/search thì response 200
```

**AC-21** — Thiếu credential
```gherkin
Given request không có Authorization Bearer và không có X-Api-Key
When gọi bất kỳ endpoint nào trong 3 endpoint
Then response 401
```

**AC-22** — Key thiếu quyền
```gherkin
Given một API key hợp lệ nhưng role của nó không có partner.catalog.read
When key đó gọi POST /v2/partner/catalog/products/search
Then response 403
```

---

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Hiệu năng | `products/search` trả trong < 500 ms với 4.731 product / 41.718 item của erp_dev, page=1 limit=20, có lọc màu + size | T-02-06 |
| Hiệu năng | `categories/tree` trả trong < 200 ms với 62 nhóm; cây dựng trong RAM như handler có sẵn | T-01-03 |
| Bảo mật | Không response nào của bề mặt đối tác chứa giá vốn, `isPosVisible`, `createdBy`, hay `branchId` | T-04-01 |
| Tương thích | Không sửa DTO/handler nào đang phục vụ backoffice hoặc POS | T-04-02 |
| Tài liệu | Cả 3 endpoint có `@ApiOkResponse` với response DTO khai đủ `@ApiProperty`, theo mẫu `inventory-item-v2.controller.ts:27`, và `@ApiSecurity('api-key')` | T-04-03 |
| Tài liệu | `pnpm openapi:generate` chạy lại, `schema.ts` + `openapi.snapshot.json` được commit | T-04-03 |
