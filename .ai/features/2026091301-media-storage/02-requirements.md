---
feature: media-storage
stories: 5
acceptance_criteria: 20
---

# Requirements — Lưu trữ media

Mọi AC giả định các assumption đang `pending` trong `01-assumptions.md` đúng như đề xuất. AC nào
dựa trên một assumption cụ thể thì ghi id của nó; assumption bị bác bỏ sẽ kéo AC đó theo.

## US-01 — Lưu ảnh hàng hoá từ backoffice

Là nhân viên quản lý hàng hoá, tôi muốn ảnh tôi chọn khi tạo/sửa hàng hoá được lưu thật
để lần sau mở lại vẫn thấy, và các kênh bán dùng được.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-01** — Lưu và mở lại
```gherkin
Given tôi có quyền sửa hàng hoá và đang ở form tạo hàng hoá
When tôi chọn 3 ảnh hợp lệ rồi bấm lưu
Then trình duyệt tải từng ảnh thẳng lên storage, không gửi byte ảnh nào tới API
And sau khi tải lại màn sửa hàng hoá đó, tôi thấy đúng 3 ảnh theo thứ tự đã tải lên
```

**AC-02** — Chặn phía client
```gherkin
Given tôi đang ở form hàng hoá
When tôi chọn một file không phải ảnh, hoặc ảnh lớn hơn 2 MB, hoặc ảnh thứ 11
Then file đó không được tải lên
And tôi thấy thông báo lỗi tiếng Việt tương ứng như form đang hiển thị hôm nay
```

**AC-03** — Server không tin client (A-09, ADR-02)
```gherkin
Given một vé tải lên hợp lệ đã được cấp cho ảnh hàng hoá với kích thước và loại file đã khai
When có người gửi lên storage một file khác kích thước đã khai hoặc khác loại đã khai rồi gọi xác nhận
Then API trả 400 với code MEDIA_INVALID
And object đó bị xoá khỏi storage và không gắn vào hàng hoá nào
When có người gửi lên storage một file lớn hơn giới hạn của vé
Then storage từ chối file và không có object nào được tạo
```

**AC-04** — Xoá ảnh
```gherkin
Given một hàng hoá đang có 3 ảnh
When tôi xoá 1 ảnh rồi bấm lưu
Then màn sửa chỉ còn 2 ảnh sau khi tải lại
And sau khi job dọn dẹp chạy, URL công khai của ảnh đã xoá trả 404
```

## US-02 — Ảnh hàng hoá xuất hiện ở POS và API đối tác

Là thu ngân POS hoặc đối tác storefront, tôi muốn nhận URL ảnh của sản phẩm để hiển thị
mà không phải đăng nhập vào storage.

**Priority:** must
**Depends on:** US-01

### Acceptance criteria

**AC-05** — POS `imageUrl` (A-11, A-25)
```gherkin
Given sản phẩm A có biến thể và 2 ảnh, hàng hoá B không có biến thể và 1 ảnh, sản phẩm C không có ảnh
When POS gọi API catalog sản phẩm của chi nhánh
Then A có imageUrl là URL công khai của ảnh đầu tiên của A
And B có imageUrl là URL công khai của ảnh của B
And C có imageUrl là null
```

**AC-06** — Đối tác `images[]` (A-10)
```gherkin
Given sản phẩm A có 2 ảnh và sản phẩm B không có ảnh
When đối tác gọi API tìm kiếm và API chi tiết sản phẩm bằng X-Api-Key
Then images của A là 2 URL công khai theo thứ tự tải lên
And images của B là mảng rỗng
And hình dạng response không đổi so với hợp đồng hiện tại
```

**AC-07** — URL công khai dùng được trong thẻ img (A-04)
```gherkin
Given một URL ảnh hàng hoá trả về từ AC-05 hoặc AC-06
When trình duyệt tải URL đó không kèm Authorization và không kèm chữ ký
Then storage trả 200 với content-type ảnh
And URL đó vẫn dùng được sau 24 giờ
```

**AC-08** — Cách ly tổ chức
```gherkin
Given tổ chức X đã tải lên một ảnh và nhận về mediaId
When một người dùng của tổ chức Y dùng mediaId đó để gắn vào hàng hoá của Y
Then API trả 404
And ảnh không bị gắn vào hàng hoá của Y
```

## US-03 — Ảnh nhân viên hiển thị ổn định và riêng tư

Là HR hoặc quản lý chi nhánh, tôi muốn ảnh nhân viên đã lưu vẫn hiển thị khi mở lại hồ sơ,
và người ngoài hệ thống không xem được.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-09** — Lưu và mở lại
```gherkin
Given tôi có quyền sửa hồ sơ nhân viên
When tôi chọn một ảnh hợp lệ cho nhân viên rồi lưu, sau đó tải lại trang hồ sơ
Then ảnh nhân viên hiển thị
And giá trị lưu trong employee_profiles không bắt đầu bằng "blob:"
```

**AC-10** — Riêng tư (A-04)
```gherkin
Given một nhân viên đã có ảnh
When ai đó gọi object ảnh đó trên storage mà không có chữ ký, hoặc bằng URL đã quá hạn
Then storage từ chối với 403
```

**AC-11** — Dọn dữ liệu blob cũ (A-13)
```gherkin
Given employee_profiles có các dòng photo_url bắt đầu bằng "blob:"
When migration của feature chạy
Then các dòng đó có photo_url là NULL
And màn hồ sơ của những nhân viên đó hiển thị trạng thái chưa có ảnh, không có ảnh vỡ
```

**AC-12** — Quyền (A-17)
```gherkin
Given tôi không có quyền sửa hồ sơ nhân viên
When tôi xin vé tải lên ảnh cho một nhân viên
Then API trả 403
```

## US-04 — Đính kèm tài liệu vào chứng từ

Là kế toán hoặc thủ kho, tôi muốn đính kèm file vào đúng phiếu để người khác mở phiếu là
xem được tài liệu gốc.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-13** — Đính kèm và tải về
```gherkin
Given tôi có quyền sửa phiếu nhập kho và đang mở một phiếu nháp
When tôi đính kèm 1 file PDF 3 MB rồi lưu, sau đó mở lại phiếu và bấm tải về
Then tôi thấy file trong danh sách với tên gốc và kích thước
And file tải về có cùng kích thước và checksum với file đã chọn
And response tải về có Content-Disposition: attachment
```

**AC-14** — Đủ 7 loại chứng từ (A-14)
```gherkin
Given một phiếu thuộc từng loại: nhập kho, lệnh chuyển kho, chuyển kho, phiếu thu tiền mặt, phiếu chi tiền mặt, phiếu thu ngân hàng, phiếu chi ngân hàng
When tôi đính kèm một file vào phiếu đó và lưu
Then attachmentIds của phiếu chứa id của file vừa đính kèm
And mở lại phiếu hiển thị file đó
```

**AC-15** — Riêng tư và theo quyền xem (A-05, A-17)
```gherkin
Given một phiếu thu có 1 file đính kèm
When một người dùng không có quyền xem phiếu thu xin link tải về
Then API trả 403
And link tải về cấp cho người có quyền sẽ hết hạn và storage trả 403 sau thời hạn
```

**AC-16** — Theo khả năng sửa của chứng từ (A-26)
```gherkin
Given một phiếu nhập kho đã ghi sổ, vẫn sửa được, có 1 file đính kèm
When tôi đính kèm thêm 1 file, gỡ file cũ rồi lưu
Then phiếu chỉ còn file mới
Given một phiếu thu đã đảo (REVERSED) có 1 file đính kèm
When tôi gửi yêu cầu sửa danh sách đính kèm của phiếu đó
Then API từ chối đúng như với mọi yêu cầu sửa phiếu ở trạng thái đó
And danh sách đính kèm của phiếu không đổi
```

**AC-17** — Loại file bị cấm (A-09)
```gherkin
Given tôi đang đính kèm file vào một chứng từ
When tôi chọn một file .svg hoặc .html, hoặc file lớn hơn 10 MB, hoặc file thứ 11
Then file đó không được tải lên và tôi thấy thông báo lỗi tiếng Việt
```

## US-05 — Vận hành storage an toàn

Là người vận hành và lập trình viên, tôi muốn storage dựng lên được bằng một lệnh, lỗi storage
không làm hỏng dữ liệu nghiệp vụ, và file rác tự được dọn.

**Priority:** must
**Depends on:** —

### Acceptance criteria

**AC-18** — Dựng local bằng một lệnh (A-22)
```gherkin
Given một máy dev vừa clone repo
When tôi chạy docker compose up -d rồi lệnh khởi tạo bucket của feature
Then MinIO chạy, có bucket công khai và bucket riêng tư với đúng chính sách đọc
And luồng AC-01 chạy được trên máy đó
```

**AC-19** — Storage không với tới được
```gherkin
Given MinIO đang tắt
When API khởi động
Then API vẫn khởi động và các endpoint không liên quan media vẫn chạy
When người dùng xin vé tải lên hoặc xác nhận tải lên
Then API trả 503 với code STORAGE_UNAVAILABLE
And form trên backoffice báo lỗi mà không mất dữ liệu người dùng đã nhập
```

**AC-20** — Dọn file tải lên nhưng không gắn (A-18, ADR-05)
```gherkin
Given một file đã được tải lên storage nhưng không được gắn vào chủ sở hữu nào trong hơn 24 giờ
When job dọn dẹp hằng ngày chạy
Then object đó bị xoá khỏi storage và bản ghi của nó chuyển sang DELETED
And file đã gắn vào chủ sở hữu không bị động tới
```

## Non-functional

| Kind | Requirement | Verified by |
|---|---|---|
| Bảo mật | Request gửi file lên storage không mang `Authorization`, `X-Branch-Id` hay `X-Idempotency-Key` của ERP | Ticket FE upload client (G3) |
| Bảo mật | Vé tải lên (presigned POST) hết hạn ≤ 15 phút; presigned GET cho object riêng tư hết hạn ≤ 1 giờ | Unit test service cấp vé (G3) |
| Kiến trúc | Không thêm `FileInterceptor` nào vào `apps/api/src` | Kiểm bằng grep trong DoD của UoW (G3) |
| Khả chuyển | Backend chỉ gọi S3 API chuẩn; không import SDK riêng của MinIO (ADR-01) | Kiểm bằng grep `from 'minio'` (G3) |
| Quan sát | Mỗi lần xác nhận thất bại ghi log có `requestId`, `organizationId`, `mediaId`, lý do; không log presigned URL | Unit test (G3) |
| Tương thích | E2E hiện có vẫn xanh khi không có MinIO | Chạy `pnpm --filter @erp/api test:e2e` (G3) |
