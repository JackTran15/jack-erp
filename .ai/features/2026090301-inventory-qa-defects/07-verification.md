---
feature: 2026090301-inventory-qa-defects
environments: [local-backoffice-session]
viewports: [desktop]
---

# Verification — Sửa 4 lỗi QA kho

Chỉ khai `local-backoffice`. Một bảng Steps chạy trên **mọi** environment được khai, nên bước POS
(AC-23) không thể nằm chung bảng — xem `## Not verified here`.

Desktop-only: cả hai app là màn hình quầy / back-office, không có layout mobile
(`.ai/aidlc.yaml` đã ghi lý do).

**Vì sao bảng này gánh nhiều hơn bình thường:** `@erp/backoffice-web` không có bộ chạy test —
`"test": "echo test"`, `vitest` không được cài. Với ba ticket frontend (T-03-01, T-03-02, T-04-06),
đây **là** lưới an toàn duy nhất, không phải phần bổ sung cho unit test. Đó cũng là cách hai feature
In tem mã trước đã làm (`barcode-sku-sort`, `barcode-picker-hide-unit-price`).

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Tổng hợp tồn kho mở được và có ô "Bộ lọc" | `/inventory-management` | — | AC-01 | `text=Tổng hợp tồn kho` |
| S2 | In tem mã: sắp xếp Vị trí tăng dần | `/admin/inventory-item-barcodes` | `click [aria-label="Sắp xếp theo Vị trí"]` | AC-11, AC-12 | `count [aria-label="Sắp xếp theo Vị trí"] = 1` |
| S3 | In tem mã: sắp xếp Vị trí giảm dần | `/admin/inventory-item-barcodes` | `click [aria-label="Sắp xếp theo Vị trí"]; click [aria-label="Sắp xếp theo Vị trí"]` | AC-11, AC-12 | `count [aria-label="Sắp xếp theo Vị trí"] = 1` |
| S4 | In tem mã: sắp xếp SKU vẫn còn và không hồi quy | `/admin/inventory-item-barcodes` | `click [aria-label="Sắp xếp theo Mã SKU"]` | AC-14 | `count [aria-label="Sắp xếp theo Mã SKU"] = 1` |
| S5 | In tem mã: cột Vị trí có mặt ở chế độ một chi nhánh | `/admin/inventory-item-barcodes` | — | AC-16 | `text=Vị trí` |
| S6 | Chi tiết vị trí: bộ lọc trạng thái vẫn cho chọn "Ngừng theo dõi" | `/inventory/item-location-details` | — | AC-22 | `count option:has-text("Ngừng theo dõi") = 1` |
| S7 | Vị trí hàng hóa: một vị trí đã ngừng hoạt động vẫn nằm trong danh sách | `/inventory/item-locations` | — | AC-22 | `count td:has-text("Ngừng hoạt động") = 1` |
| S10 | In tem mã: vào chế độ chuỗi thì cột Vị trí biến mất cùng nút sắp xếp của nó | `/admin/inventory-item-barcodes` | `click [aria-label="Sắp xếp theo Vị trí"]; click button[aria-haspopup="menu"]; click [role="menuitemradio"]:has-text("Chuỗi cửa hàng")` | AC-15 | `count [aria-label="Sắp xếp theo Vị trí"] = 0` |

Đường dẫn của S6 / S7 phải kiểm lại trong `App.tsx` trước lần chạy đầu — hai trang này chưa được
xác minh route trong lúc lập kế hoạch, và một path sai sẽ đỏ vì 404 chứ không vì lỗi thật.

## Not verified here

Bảng trên chỉ chứa những gì **quan sát được** bằng ≤3 thao tác trên một trang. Phần còn lại cố ý để
ngoài, kèm thứ đang phủ nó — nói rõ còn hơn để người đọc sau tưởng ảnh chụp bị thiếu:

- **AC-23 (POS Chuyển kho tạm).** Khác environment (`local-pos`, base path `/pos/`), không thể nằm
  chung bảng. Kiểm tay trong T-04-06, ghi kết quả vào ticket.
- **Trạng thái sort bị xoá ở chế độ chuỗi (AC-15) — chỉ nửa quan sát được.** S10 chứng minh cột
  Vị trí và nút sắp xếp của nó biến mất, nhưng **không** nhìn thấy được state `sort` bên trong đã
  về `null` hay chưa — đó chính là lý do lỗi này tồn tại: nó vô hình. Nửa còn lại nằm ở kiểm tay
  ghi trong T-03-02. Ngoài ra S10 chỉ chạy được với tài khoản thấy được lựa chọn "Chuỗi cửa hàng"
  (`showChainOption` trong `BranchSelector.tsx:133`); tài khoản một chi nhánh sẽ không có mục này
  và bước sẽ đỏ vì thiếu quyền, không phải vì lỗi.
- **Thứ tự dòng thực tế sau khi sắp xếp (AC-11, AC-12, AC-13).** DSL không diễn đạt được thứ tự
  hàng. S2/S3/S4 chỉ khoá được cái khung (nút sắp xếp tồn tại, đúng một cái); **bằng chứng thật là
  ảnh chụp** cộng khung "Xem trước" ở sidebar. Đây đúng là giới hạn mà `barcode-sku-sort` đã ghi lại.
- **AC-01 tới AC-05 ở mức số liệu.** S1 chỉ chứng minh trang mở được. Bằng chứng thật là unit test
  trong `stock-summary.service.spec.ts` (T-01-01 → T-01-04), nơi đếm được số dòng và `storageId`.
- **AC-06, AC-07, AC-08 (bộ lọc "Đối tượng" ở cả ba màn).** Phủ bằng e2e chạm Postgres thật của
  T-02-01 (6/6 xanh), **mạnh hơn ảnh chụp** cho một lỗi kiểu SQL: e2e đỏ với đúng nguyên văn
  `operator does not exist: uuid = character varying` trước khi sửa, xanh sau khi sửa.
  Bước chụp màn hình đã bị gỡ khỏi bảng Steps vì ô lọc free-text **không có `aria-label`**
  (`BaseDataTable.tsx:570-576` — chỉ biến thể date và number-range mới có), nên chỉ chọn được
  bằng vị trí cột. Một selector theo thứ tự cột sẽ đỏ ngay lần ai đó đổi thứ tự cột, và đỏ vì
  lý do không liên quan tới lỗi — tệ hơn là không có bước nào.
- **AC-16 tới AC-21 ở mức dữ liệu.** Cần một mặt hàng có đúng hình A07.02 (đang theo dõi) +
  E03.01 (ngừng theo dõi). Dữ liệu này **không có** trong bất kỳ DB cục bộ nào (đã quét 7 DB — xem
  ghi chú tiền điều kiện của T-01-01), nên phải dựng fixture trước khi chạy; S5 chỉ khoá được sự
  tồn tại của cột.

- **AC-02, AC-03, AC-04 (trùng dòng, phân trang, tổng footer).** Đây là những phát biểu **về số**,
  không phải về giao diện, và đã được đo trực tiếp trên Postgres thật (`erp_clone_24`, tổ chức MT,
  `pageSize: 20`) — kết quả ghi trong T-01-02 và T-01-03: trang 1 **55 → 20** dòng, ba trang cho
  **60 khoá phân biệt, không chồng lấn**, tổng footer **76 → 0** khi bộ lọc không khớp dòng nào.
  Một ảnh chụp lưới không chứng minh được "tổng bằng tổng cột"; phép đo thì có.
- **AC-09 (lọc theo tên nhân viên).** Phủ bởi e2e `goods-doc-party-filter.e2e-spec.ts`, có fixture
  `counterparty_kind = 'employee'` và khẳng định trả **đúng** phiếu chứ không chỉ HTTP 200.
- **AC-10 (lưới test bắt được lỗi kiểu SQL).** Bản thân nó là một phát biểu **về bộ test**, không
  phải về màn hình — không có gì để chụp. Bằng chứng là e2e đỏ với nguyên văn
  `operator does not exist: uuid = character varying` trước khi sửa, xanh sau khi sửa.
- **AC-17, AC-18, AC-19 (dropdown và auto-fill vị trí).** Cần đúng một hình dữ liệu: một mặt hàng
  có kệ đang theo dõi **và** kệ đã ngừng theo dõi, cộng một mặt hàng đã gán kệ nhưng chưa từng nhận
  hàng. Bản seed demo không có hình này, và dựng nó bằng SQL tay chỉ để chụp ảnh sẽ tạo ra một
  fixture không ai bảo trì. Phủ bằng unit test trong `resolve-item-locations.handler.spec.ts`
  (4 ca, gồm cả ca "đã gán nhưng chưa nhận hàng" mà `NOT EXISTS` cố ý giữ lại) và
  `stock-ledger.service.spec.ts`.
- **AC-20 (ô chọn vị trí ở form CRUD chung).** Thay đổi một dòng (`activeOnly: "true"`), và tham số
  đó được server áp bằng **hai** mệnh đề (`location.isActive` + `storage.isActive`,
  `inventory-location.service.ts:779-783`). Để chụp được cần một entity CRUD có trường `locationId`
  đang bật trong tổ chức demo — không có sẵn.

## Ghi chú

`verify.py` sẽ cảnh báo các id `AC-*` ở đây có mặt trong `02-requirements.md` — đó là cảnh báo mong
đợi khi một bước phủ nhiều AC, không phải lỗi.

## Vận hành: phiên đăng nhập chỉ dùng được MỘT lần

`local-backoffice-session` dùng recipe `storage-state` vì recipe `form` của runner **không thể**
đăng nhập vào backoffice: `perform_login` (`runner/run.py:252-273`) là luồng hai bước (điền email →
submit → mới điền mật khẩu), còn form backoffice đặt cả ba ô trên một trang nên cú submit đầu bắn
đi với mật khẩu rỗng; và runner không hề biết tới ô "ID tổ chức" (`grep organization run.py` = 0).

**Refresh token xoay vòng**: mỗi lần khôi phục phiên sẽ tiêu thụ token trong file và phát hành
token mới, nên `.ai/.auth/local-backoffice-session.json` **hỏng sau đúng một lần chạy**. Phải
capture lại ngay trước mỗi lần `verify.py`. Đã mất một vòng chẩn đoán vì điều này: probe thứ hai
rơi về `/login` trong khi ảnh chụp của lần chạy trước vẫn hiện đầy đủ dữ liệu.

**Bẫy khi viết Assert**: `check_asserts` dùng `page.locator("text=…").first.wait_for(state="visible")`.
Thẻ `<option>` bị Playwright coi là **không visible**, nên nếu chuỗi cần tìm cũng nằm trong một
`<option>` của bộ lọc thì `.first` bám vào cái ẩn đó và bước sẽ đỏ dù màn hình hiện đúng. Đó là lý
do S6/S7 chuyển sang dạng `count <sel> = n` với selector chặn được `<option>` (`td:has-text(...)`),
hoặc nhắm thẳng vào `option` khi đó mới là thứ cần chứng minh.

**Chỉ chạy được MỘT viewport mỗi lần capture.** Đã thử `viewports: [desktop, laptop]`: desktop
xanh 8/8, laptop đỏ **8/8** — và ảnh chụp `laptop/S1.png` cho thấy **trang đăng nhập**, không phải
lỗi layout. Runner mở một browser context mới cho mỗi viewport, mỗi context khôi phục phiên một
lần, mà refresh token thì xoay vòng — nên context thứ hai luôn cầm token đã bị tiêu thụ. Đây là
giới hạn của mô hình auth, không phải chuyện thêm retry hay tăng timeout; thêm retry chỉ làm
hỏng-thật và hỏng-do-phiên trông giống hệt nhau.

Giữ `viewports: [desktop]`. Việc này không làm mất độ phủ: cả hai app đều không có layout mobile
(`.ai/aidlc.yaml` đã ghi), `laptop` chỉ khác chiều cao và sinh ra cho các popover dài — không có
popover nào trong 4 lỗi của đợt này.

**Fixture dữ liệu**: S7 cần ít nhất một vị trí `is_active = false`. Bản seed demo tạo 12 vị trí và
**không có cái nào** ngừng hoạt động, nên đã tắt đúng một vị trí (`A-01`,
id `60000000-0000-4000-8000-000000000001`) trong **tổ chức demo** `10000000-…-0001`. Tổ chức thật
`MT` (`e60e5f49-…`) không bị đụng tới — đã đối chiếu số bản ghi trước/sau.
