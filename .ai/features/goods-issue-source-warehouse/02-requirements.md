# Requirements — Chọn kho nguồn theo "Chi tiết vị trí hàng hóa"

Bối cảnh: khi thêm một mã hàng vào **Phiếu xuất kho**, cột Kho được đoán hoàn toàn ở client
(`isDefaultReceiving` → `isMainStorage` → kho đầu tiên, hoặc kế thừa dòng trên) rồi cột Vị trí mới
được server giải **bên trong cái kho đã đoán**. Mã hàng chỉ tồn tại ở showroom vì thế rơi vào kho
lưu trữ và bỏ trống Vị trí.

Nguồn sự thật để chọn kho phải là chính dữ liệu màn **Chi tiết vị trí hàng hóa**: dòng
`stock_balances` **đang theo dõi**, trên vị trí **đang hoạt động** (không phải "Chưa xếp"), thuộc
kho **đang hoạt động** của chi nhánh hiện tại.

## Acceptance criteria

- **AC-01** — Mã hàng chỉ có dòng Chi tiết vị trí ở kho A thì dòng phiếu xuất phải điền Kho = A và
  Vị trí của dòng đó, kể cả khi kho mặc định là kho khác và **kể cả khi số lượng bằng 0**.
- **AC-02** — Nếu kho đang được đề xuất (kho mặc định / kho của dòng trên) *có* dòng Chi tiết vị trí
  cho mã hàng thì giữ nguyên kho đó, không nhảy sang kho có tồn lớn hơn.
- **AC-03** — Mã hàng không có dòng Chi tiết vị trí ở bất kỳ kho nào thì giữ nguyên hành vi cũ: kho
  mặc định được giữ nguyên, không bị resolver xoá.
- **AC-04** — Kho nguồn của **Chuyển kho** áp dụng cùng quy tắc, nhưng xếp kho showroom
  (`is_main_storage`) xuống cuối: mã có ở cả hai thì xuất từ kho lưu trữ.
- **AC-05** — Người dùng tự chọn Kho trên một dòng thì lựa chọn đó không bị resolver ghi đè; Vị trí
  được điền lại trong đúng kho vừa chọn.
