---
feature: goods-issue-source-warehouse
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Chọn kho nguồn theo "Chi tiết vị trí hàng hóa"

Chạy bằng `admin@erp.local`, chi nhánh **HCM** (`LOCAL_BACKOFFICE_BRANCH_NAME`). Chi nhánh này có
đúng ba kho, và cấu hình của chúng là tiền đề của mọi bước dưới đây:

| Kho | `is_main_storage` | `is_default_receiving` | Vị trí |
| --- | --- | --- | --- |
| `Kho Lưu trữ HCM` | false | **true** | `A10`, `Chưa xếp` (không có vị trí "Mặc định") |
| `HCM - Showroom` | **true** | false | `DEFAULT · Mặc định` (`is_default = true`) |
| `Showroom BMT` | false | false | `DEFAULT · Mặc định` |

Vì `Kho Lưu trữ HCM` là kho nhận hàng mặc định, `defaultStorage` của cả hai form đều trỏ vào nó —
đúng tình huống người dùng báo lỗi: mã chỉ nằm ở showroom nhưng dòng phiếu lại điền kho lưu trữ.

## Dữ liệu kiểm chứng

Ba mã `VERIFY-SRC-*` được seed riêng cho bộ bước này, **không dùng dữ liệu có sẵn**: `erp_dev` là
môi trường đang có người dùng, mỗi lần ai đó bán hàng là tồn đổi và bằng chứng trôi. Ba mã này
không nằm trong bất kỳ luồng nghiệp vụ nào nên số liệu của chúng đứng yên.

```
 code                | kho                 | vị trí   | SL | đang theo dõi
---------------------+---------------------+----------+----+---------------
 VERIFY-SRC-SHOWROOM | HCM - Showroom      | Mặc định |  0 | t
 VERIFY-SRC-BOTH     | HCM - Showroom      | Mặc định |  2 | t
 VERIFY-SRC-BOTH     | Kho Lưu trữ HCM     | A10      |  5 | t
 VERIFY-SRC-NONE     | (không có dòng nào) |          |    |
```

`VERIFY-SRC-SHOWROOM` cố ý để **SL = 0**. Đây là điểm mà một resolver "chọn kho có tồn > 0" sẽ
trượt, và cũng đúng bằng ảnh chụp người dùng gửi (mã ở Showroom MT46, số lượng 0).

**Cách dựng.** Ba mã này ghi thẳng vào `items` + `stock_balances` chứ không đi qua phiếu nhập kho.
Có chủ đích: đầu vào duy nhất của `resolveItemSourceBatch` là phép join
`stock_balances × locations × storages`, nên ghi thẳng ba bảng đó là dựng đúng thứ resolver đọc,
không phải dựng một xấp xỉ. Dựng bằng phiếu nhập sẽ thêm bút toán sổ cái vào `erp_dev` mà không
chứng minh thêm được gì.

## Steps

Mỗi bước tự mở lại phiếu từ đầu — runner `page.goto()` trước mỗi bước nên trạng thái không mang
sang bước sau. Động từ `wait` cuối chuỗi tương tác là chủ ý: `count` không tự chờ, mà kho/vị trí
chỉ hiện sau khi `POST /inventory/locations/resolve-item-source/batch` trả về.

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Phiếu xuất, mã chỉ có vị trí ở showroom (SL = 0): dòng nhận **HCM - Showroom** + vị trí `DEFAULT`, không phải kho nhận mặc định `Kho Lưu trữ HCM` | `/inventory/goods-issues` | `click [aria-label="Hành động trang"] button:has-text("Thêm mới"); fill [role="dialog"] input[placeholder="Tìm mã hoặc tên"] = VERIFY-SRC-SHOWROOM; click [data-lookup-popover] tr[role="option"]:has-text("VERIFY-SRC-SHOWROOM"); wait [role="dialog"] tr[data-row-index="0"] input[value="HCM - Showroom"]` | AC-01 | `count [role="dialog"] tr[data-row-index="0"] input[value="HCM - Showroom"] = 1; count [role="dialog"] tr[data-row-index="0"] input[value="DEFAULT"] = 1; count [role="dialog"] tr[data-row-index="0"] input[value="Kho Lưu trữ HCM"] = 0` |
| S2 | Phiếu xuất, mã có vị trí ở **cả hai** kho: kho đang được đề xuất (`Kho Lưu trữ HCM`) được giữ nguyên và vị trí là `A10` của chính kho đó — không nhảy sang showroom | `/inventory/goods-issues` | `click [aria-label="Hành động trang"] button:has-text("Thêm mới"); fill [role="dialog"] input[placeholder="Tìm mã hoặc tên"] = VERIFY-SRC-BOTH; click [data-lookup-popover] tr[role="option"]:has-text("VERIFY-SRC-BOTH"); wait [role="dialog"] tr[data-row-index="0"] input[value="A10"]` | AC-02 | `count [role="dialog"] tr[data-row-index="0"] input[value="Kho Lưu trữ HCM"] = 1; count [role="dialog"] tr[data-row-index="0"] input[value="A10"] = 1; count [role="dialog"] tr[data-row-index="0"] input[value="HCM - Showroom"] = 0` |
| S3 | Phiếu xuất, mã chưa có dòng Chi tiết vị trí nào: kho mặc định **được giữ nguyên** chứ không bị xoá. Vị trí để trống vì `Kho Lưu trữ HCM` không có vị trí "Mặc định" — đúng hành vi trước thay đổi | `/inventory/goods-issues` | `click [aria-label="Hành động trang"] button:has-text("Thêm mới"); fill [role="dialog"] input[placeholder="Tìm mã hoặc tên"] = VERIFY-SRC-NONE; click [data-lookup-popover] tr[role="option"]:has-text("VERIFY-SRC-NONE"); wait [role="dialog"] tr[data-row-index="0"] input[value="Kho Lưu trữ HCM"]` | AC-03 | `count [role="dialog"] tr[data-row-index="0"] input[value="Kho Lưu trữ HCM"] = 1; count [role="dialog"] tr[data-row-index="0"] input[value="HCM - Showroom"] = 0` |
| S4 | Chuyển kho, mã chỉ có vị trí ở showroom: **Kho xuất** rơi xuống `HCM - Showroom` thay vì dừng ở kho lưu trữ rỗng | `/inventory/stock-transfers` | `click [aria-label="Hành động trang"] button:has-text("Thêm mới"); fill [role="dialog"] input[placeholder="Tìm mã/tên"] = VERIFY-SRC-SHOWROOM; click [data-lookup-popover] tr[role="option"]:has-text("VERIFY-SRC-SHOWROOM"); wait [role="dialog"] tr[data-row-index="0"] input[value="HCM - Showroom"]` | AC-04 | `count [role="dialog"] tr[data-row-index="0"] input[value="HCM - Showroom"] = 1; count [role="dialog"] tr[data-row-index="0"] input[value="DEFAULT · Mặc định"] = 1` |
| S5 | Chuyển kho, mã có ở cả hai kho: showroom bị xếp sau nên **Kho xuất** là `Kho Lưu trữ HCM`, vị trí `A10 · A10` — giữ đúng ý đồ "có ở cả hai thì xuất từ kho lưu trữ" | `/inventory/stock-transfers` | `click [aria-label="Hành động trang"] button:has-text("Thêm mới"); fill [role="dialog"] input[placeholder="Tìm mã/tên"] = VERIFY-SRC-BOTH; click [data-lookup-popover] tr[role="option"]:has-text("VERIFY-SRC-BOTH"); wait [role="dialog"] tr[data-row-index="0"] input[value="A10 · A10"]` | AC-04 | `count [role="dialog"] tr[data-row-index="0"] input[value="Kho Lưu trữ HCM"] = 1; count [role="dialog"] tr[data-row-index="0"] input[value="A10 · A10"] = 1; count [role="dialog"] tr[data-row-index="0"] input[value="HCM - Showroom"] = 0` |
| S6 | Nguồn sự thật: màn **Chi tiết vị trí hàng hóa** lọc theo tiền tố `VERIFY-SRC-` cho đúng ba dòng mà S1/S2 dựa vào — hai kho của `VERIFY-SRC-BOTH`, một kho của `VERIFY-SRC-SHOWROOM`, và `VERIFY-SRC-NONE` không xuất hiện | `/inventory/item-location-details` | `fill input[placeholder="Giá trị..."] >> nth=1 = VERIFY-SRC-; wait text=Hiển thị 1 - 3 trên 3 kết quả` | AC-01, AC-03 | `text=Hiển thị 1 - 3 trên 3 kết quả; count tbody :text-is("HCM - Showroom") = 2; count tbody :text-is("Kho Lưu trữ HCM") = 1; count tbody :text-is("VERIFY-SRC-NONE") = 0` |

## Not verified here

- **AC-05 (người dùng tự chọn Kho thì không bị ghi đè)** — cần một chuỗi sáu động từ (mở phiếu →
  chọn mã → xoá kho → gõ kho khác → chọn từ dropdown → chờ vị trí), dài gấp đôi bất kỳ bước nào
  khác và mỗi mắt xích thêm một cách để đỏ vì lý do không liên quan đến tính chất cần chứng minh.
  Tính chất này được khoá ở tầng mã: đường "người dùng chọn kho" (`onSelect` của cột Kho) vẫn gọi
  `fillPreferredShelf` cũ, không gọi resolver mới — nghĩa là nó *không thể* đổi kho. Đã kiểm bằng
  tay trong phiên phát triển: đổi kho dòng 2 sang `Kho Lưu trữ HCM` → kho giữ nguyên, vị trí đổi
  thành `A10`.
- **Thứ tự "kho có tồn lớn nhất" khi mã nằm ở ba kho trở lên** — dựng qua UI thì tốn ba kho có tồn
  mà nhìn vào ảnh chỉ thấy một kết quả, không thấy được thứ tự. Khoá ở tầng dữ liệu bằng
  `inventory-location-stock.service.spec.ts` → `picks the fullest kho when the proposed kho holds
  nothing` và `orders candidates by quantity then last movement`.
- **Lọc bỏ dòng `is_tracked = false` / vị trí ngừng hoạt động / kho ngừng hoạt động** — muốn thấy
  trên UI phải tắt hoạt động một kho thật của `erp_dev`, ảnh hưởng mọi màn khác. Khoá bằng
  `only considers tracked balances on an active bin of an active kho, scoped by the kho branch`,
  assert thẳng trên mệnh đề SQL sinh ra.

## Notes

**Bộ chọn của dropdown phải là `[data-lookup-popover]`, không phải `[role="dialog"] …`.** Vòng
chạy đầu S1–S3 đỏ với `locator.click: Timeout`, trong khi ảnh chụp cho thấy dropdown *đang mở* với
đúng dòng cần bấm. Nguyên nhân: `LookupField` portal popover vào `wrapEl.closest('[role="dialog"]')`
— **trừ khi** truyền `portalToBody`, lúc đó nó ra thẳng `<body>`. Ba ô Mã SKU của phiếu xuất có
`portalToBody` (`GoodsIssueFormDialog.tsx:1291`), form chuyển kho thì không. Đó cũng là lý do S4/S5
xanh ngay từ vòng đầu còn S1–S3 đỏ. `[data-lookup-popover]` là chỗ duy nhất đúng cho cả hai.

**Động từ `wait` phải nhắm vào giá trị do *resolver* sinh ra.** Vòng đầu S5 đỏ với
`count … input[value="A10 · A10"] = 1, got 0` trong khi ảnh chụp sau đó cho thấy đúng `A10 · A10`.
Đó là một cuộc đua thật, không phải lỗi app: `count` **không tự chờ**, mà bước chờ của tôi lúc đó
nhắm vào `input[value="Kho Lưu trữ HCM"]` — giá trị dòng trống *đã có sẵn* trước khi gọi API, nên
nó trả về ngay lập tức. Chờ đúng thứ chỉ xuất hiện sau `POST …/resolve-item-source/batch` thì hết
đua. Bài học chung: ở bước nào mà kho kỳ vọng **trùng** kho form đoán sẵn thì phải chờ ở cột Vị trí.

**Vì sao assert dùng `input[value="…"]` chứ không dùng `text=`.** Ô Kho và Vị trí trong lưới chi
tiết là `<input role="combobox">`, không phải text node — `getByText` không bao giờ khớp. React ở
đây có phản chiếu thuộc tính `value` ra DOM nên bộ chọn CSS theo thuộc tính khớp được, và nó khớp
**chính xác** chứ không phải "có chứa": `input[value="Kho Lưu trữ HCM"] = 0` do đó là một khẳng
định phủ định thật sự, không phải một câu hỏi mơ hồ.

**Vì sao mỗi bước đều assert cả chiều phủ định.** Một bước chỉ hỏi "có phải HCM - Showroom không"
vẫn xanh nếu form điền cả hai kho vào hai ô khác nhau. Cặp `= 1` / `= 0` ghim đúng một kho.

**S3 là bước yếu nhất trong bộ và cố ý giữ nguyên như vậy.** Với `VERIFY-SRC-NONE`, resolver trả
`storage: null` nên **không có gì trên màn hình đổi** sau khi nó trả lời — không có mốc nào để
`wait` bám vào, và về lý thuyết bước này vẫn xanh kể cả khi resolver không hề chạy. Nó dựa vào
`waitForLoadState("networkidle")` mà runner chạy sau mỗi hành động. Chấp nhận được vì điều S3
khẳng định là một **phủ định** ("kho không bị đụng tới"), và phủ định đó được khoá chặt ở tầng dữ
liệu bởi `falls back to the proposed kho and its "Mặc định" bin when the mã is tracked nowhere` và
`returns nulls when the mã is tracked nowhere and no kho was proposed`.

**S3 xanh nghĩa là không có hồi quy, không phải là có tính năng mới.** Mã chưa có vị trí nào phải
hành xử **y như trước** thay đổi — đây là bước duy nhất trong bộ này chứng minh điều đó, và nó là
lý do resolver trả `storage: null` thay vì trả một kho đoán bừa.
