1. Nhóm hàng hóa.
T1: Cho phép group nhóm hàng hóa (Chọn parent)
T2: Query lấy danh sách ưu tiền show parent not null xong rồi fill những thằng con vào.

2. Kho hàng
Mặc định showroom là kho tự sinh không được phép xóa trên UI, nếu đang chọn nó thì không được xóa
Có thêm chức năng là "Kho mặc định nhâp hàng"

Tất cả Kho chỉ được 1 Kho mặc định nhập hàng, nếu muốn đổi thì disable nó đi 

Đổi text Label "Kho chính" thành "Kho nhập hàng mặc định" 

11. Chuyển Kho.
Thêm label chọn kho, nhập khẩu, cho scan barcode
chọn kho là chọn kho khi nhập item sẽ auto fill (- Autofill kho xuất/ vị trí xuất theo vị trí hàng hoá -> nếu ko có thì lấy theo kho mặc đinh.)
khi fill item sẽ call backend để lấy thông tin vị trí hiện tại + theo "Kho mặc định nhập hàng" ở trên. Lưu ý API được gửi list item variant.
- Search Dialog: search nâng cao, theo group hàng hoá. (tìm theo Mẫu mã) Như hình.


Lưu ý: Tất cả variant cùng 1 production sẽ phải nằm ở một vị trí nhất định, không có trường hợp 2 variant nằm 2 vị trí khác nhau.

8. Nhập kho:
 - Đang ở chi nhánh Cà mau, lấy ưu tiên các trường thông tin (Kho, Vị trí) từ chi nhánh Cà Mau.
 - Từng dòng hàng hoá -> Trong kho đã từng có hàng rồi -> Tự fill vị trí. (Sử dụng tương tự API ở 11)
 - Search dialog: Chọn hàng hoá theo nhóm, không theo từng variant.
   + Chọn được nhiều.
 - Thêm min width cho table, đang chật chội quá. (UI/UX)

Đối tương: NCC & Khách hàng, search nâng cao (giông bên thu chi tiền mặt)

9. Xuất kho: 
Tương tự nhập kho

15. Thay đổi cho clear ngữ nghĩa.
- mã SKU mẫu mã, tên mẫu mã, mã SKU, tên hàng hoá.
 + Mã SKU Mẫu mã: ABA2777 (Mã SKU hàng hóa)
 + Tên mẫu mã: ABA2777 (Tên Hàng khóa)
 + mã SKU: ABA2777-D-38 (mã SKU of variant and mã barcode) 
 + Tên hàng hoá: Giày nam ABA2777-D-38 (Tên variant)


Lưu ý code. Phía backend có thể update thêm entity, properrties nhưng API phải tạo mới, theo flow CQRS. Không được sửa và dùng lại cái cũ.
khi fill item sẽ call backend để lấy thông tin vị trí hiện tại + theo "Kho mặc định nhập hàng" ở trên. Lưu ý API được gửi list item variant. Sẽ gửi list item + chi nhánh. sẽ check database xem chi nhánh đó có kho mặc đinh không. nhưng nếu client send thêm id của kho thì ưu tiên lấy vị trị kho thôi. không tìm thông tin mặc định.

Đối tương: NCC & Khách hàng, search nâng cao (giông bên thu chi tiền mặt)
Cái này nên viết 1 component mới có thể resue lại các page + API Query resue it.

Search Dialog: search nâng cao, theo group hàng hoá. (tìm theo Mẫu mã) Như hình.
Này cũng vậy cho phép collapse theo nhóm hàng hóa => mẫu => variant cũng là 1 component riêng, API Query it.

Codebase chỉ là context đừng có dựa vào style code của nó nha, tôi muốn bạn code theo một senior thật sự.
Phía backend luôn luôn phải theo mô hình CQRS (Có thể nhiều events). theo DDD thì càng tốt
Phía Frontend sẽ ưu tiền tái sử dụng, resue lại.




