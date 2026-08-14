---
feature: daily-report-voucher-columns
environments: [local-pos]
viewports: [desktop]
---

# Verification — Thu/Chi tiền mặt đọc theo phiếu, cột NV Thu / NV Chi

Chỉ khai báo `local-pos`. Toàn bộ thay đổi nhìn thấy được nằm trên `/daily-report` của POS;
backoffice không đụng tới.

Desktop-only: đây là màn hình quầy, không có layout mobile. Thêm viewport mobile chỉ đẻ ra
checkbox được tick mà không ai thật sự nhìn màn 390px.

Hai dòng "Tiền mặt" nằm cùng một thẻ (một ở mục Thu, một ở mục Chi) nên selector phải dùng
`nth=` — `text=Tiền mặt` là mơ hồ và sẽ hỏng ở strict mode.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Modal "Tổng tiền mặt" mở ra và có cột NV Thu ngay cạnh Khách hàng, không đẩy Số tiền ra ngoài | `/daily-report` | `click button:has-text("Tiền mặt") >> nth=0; wait text=Tổng tiền mặt` | AC-04 | `text=Tổng tiền mặt; text=Khách hàng; text=NV Thu; text=Số tiền` |
| S2 | Modal Thu không còn liệt kê hoá đơn — chỉ chứng từ quỹ | `/daily-report` | `click button:has-text("Tiền mặt") >> nth=0; wait text=Tổng tiền mặt` | AC-01 | `no-text=INV-2026; no-text=RTN-2026` |
| S3 | Dropdown "Loại chứng từ" giữ nguyên bộ lựa chọn cũ | `/daily-report` | `click button:has-text("Tiền mặt") >> nth=0; wait text=Tổng tiền mặt; click button[aria-haspopup="listbox"]:text-is("Tất cả")` | AC-08 | `text=Bán hàng; text=Đổi trả; text=Hoàn tiền mặt; text=Thu nợ; text=Thu khác` |
| S4 | Modal "Tổng chi tiền mặt" có cột NV Chi ngay cạnh Khách hàng, không đẩy Số tiền ra ngoài | `/daily-report` | `click button:has-text("Tiền mặt") >> nth=1; wait text=Tổng chi tiền mặt` | AC-05 | `text=Tổng chi tiền mặt; text=Khách hàng; text=NV Chi; text=Số tiền` |
| S6 | Cột Loại chứng từ không còn toàn "Thu khác": phiếu do huỷ trả hàng có nhãn riêng | `/daily-report` | `click button:has-text("Tiền mặt") >> nth=0; wait text=Tổng tiền mặt` | AC-11 | `text=Huỷ trả hàng` |
| S7 | `PT000007` đọc là "Đổi trả, mua thêm" — nhãn suy từ `invoices.type`, không từ mã `RTN-` | `/daily-report` | `click button:has-text("Tiền mặt") >> nth=0; wait text=Tổng tiền mặt` | AC-10 | `text=PT000007; text=Đổi trả, mua thêm` |
| S8 | Dropdown có thêm lựa chọn "Huỷ trả hàng", 7 lựa chọn cũ vẫn còn | `/daily-report` | `click button:has-text("Tiền mặt") >> nth=0; wait text=Tổng tiền mặt; click button[aria-haspopup="listbox"]:text-is("Tất cả")` | AC-14 | `text=Huỷ trả hàng; text=Bán hàng; text=Hoàn tiền mặt; text=Thu nợ; text=Thu khác` |
| S5 | Thu chuyển khoản **không** bị đổi lây: bộ cột giữ nguyên, không mọc cột nhân viên | `/daily-report` | `click button:has-text("Chuyển khoản") >> nth=0; wait text=Tổng tiền chuyển khoản` | AC-03 | `text=Tổng tiền chuyển khoản; text=Tài khoản ngân hàng; no-text=NV Thu` |

## Not verified here

- **AC-02 (phiếu thu `POS_SALE` được tính), AC-03 (`revenue-bank-transfer` không đổi),
  AC-06 (`staffName` rỗng khi `staff_id` NULL), AC-07 (lui về `partner_name_snapshot`),
  AC-09 (handler tổng hợp không đổi)** — đều là **hình dạng dữ liệu trả về**, không phải thứ
  quan sát được bằng một lần chụp màn hình. Muốn dựng đủ 5 ca này qua UI thì phải seed từng loại
  phiếu với từng tổ hợp `purpose` / `staff_id` / `payer_name` rỗng — giòn hơn nhiều so với giá trị
  nó chứng minh.

  Đang được phủ bởi 6 test bám đúng từng AC trong
  `get-pos-daily-summary-detail.handler.spec.ts`, cộng toàn bộ suite API 267/267 (2523 test) —
  trong đó `get-pos-daily-summary.handler.spec.ts` xanh chính là bằng chứng cho AC-09.

  Riêng AC-03 không thể kiểm bằng dữ liệu trả về được: `qbStub` trong spec **không** áp dụng bộ
  lọc nào, nên mọi dòng đưa vào đều được trả ra và một test "loại trừ POS_SALE" sẽ xanh kể cả khi
  code sai. Đã xử lý bằng cách ghi lại SQL của từng `where`/`andWhere` rồi assert thẳng trên chuỗi.

- **Ô "Khách hàng" và "NV Thu/Chi" có dữ liệu thật** — cần một phiếu thu và một phiếu chi lập
  **thủ công** ở màn Quỹ tiền, vì mọi phiếu do consumer sinh đều để `staff_id` NULL (**A-02**).
  Dựng dữ liệu đó nằm ngoài 4 động từ mà runner có. Bốn bước trên chứng minh **cột tồn tại và
  đúng tên**; việc ô có chữ hay không phụ thuộc dữ liệu, và hiện tại trống là **đúng**.

## Notes

- S2 dùng `no-text=INV-2026` / `no-text=RTN-2026` thay vì `no-text=INV-`: tiền tố trần dễ khớp
  nhầm vào chữ khác trên trang. Mã hoá đơn thật luôn có dạng `INV-YYYYMM-NNNNN`.
- S3 phải dùng `:text-is("Tất cả")` chứ không phải `text=Tất cả`: bộ lọc ở thanh trên trang có
  "Tất cả thu ngân" và "Tất cả NVBH", cả hai đều **chứa** chuỗi "Tất cả" nên selector con trở nên
  mơ hồ và click hết 30s timeout. Khớp đúng nguyên văn mới trúng trigger của cột Loại chứng từ.
- `text=Số tiền` ở S1/S4 **không** đủ để bắt lỗi tràn cột: Playwright coi một phần tử bị cuộn ra
  ngoài khung cuộn là vẫn "visible" (nó có bounding box). Nó chỉ chốt rằng cột còn tồn tại. Thứ
  thật sự bắt được lỗi là **ảnh chụp** — vòng chạy đầu tiên xanh cả 4 bước trong khi cột "Số tiền"
  đã bị đẩy khỏi khung 960px, và chỉ nhìn ảnh mới thấy. Đừng tin mỗi màu xanh ở bước này.
- **S5 chỉ chứng minh được một nửa AC-03, phải nói rõ.** Ngày chạy không có giao dịch chuyển khoản
  nào nên modal hiện "Không có dữ liệu". Ảnh chụp vì thế chứng minh **bộ cột giữ nguyên** — vẫn có
  "Tài khoản ngân hàng", **không** mọc "NV Thu" — tức thay đổi không lan sang category này. Nó
  **không** chứng minh dòng hoá đơn vẫn được liệt kê, vì không có dòng nào để liệt kê. Nửa còn lại
  do test `revenue-bank-transfer: unchanged…` phủ, và test đó assert thẳng trên chuỗi SQL nên bắt
  được cả mệnh đề loại trừ `POS_SALE`.
- S2 sẽ xanh một cách tầm thường nếu modal rỗng. Đó là lý do nó đi **kèm** S1 chứ không đứng một
  mình: S1 chứng minh modal thật sự mở và có bảng, S2 chứng minh trong bảng đó không có hoá đơn.
- Tổng trong modal Thu **thấp hơn** con số "Tiền mặt" trên thẻ Thu. Đã chốt, không phải lỗi —
  xem ADR-01 và A-01.
