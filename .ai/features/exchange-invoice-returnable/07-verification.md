---
feature: exchange-invoice-returnable
environments: [local-pos-worktree]
viewports: [desktop]
---

# Verification — Đổi trả theo hoá đơn trên hoá đơn đổi trả

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Lưới Đổi trả hàng trộn hoá đơn bán và hoá đơn đổi, có cột "Loại" | `/return-goods` | `click [aria-label="Lọc theo khoảng thời gian"]; click [role="option"]:has-text("Toàn bộ"); click button:has-text("Áp dụng")` | AC-01, AC-02, AC-04, AC-06 | `text=Loại; text=RTN-202607-00001; text=RTN-202607-00012; text=INV-202608-00013; no-text=2608220001TH` |
| S2 | Hoá đơn đổi đã hoàn tiền hiện Tổng thanh toán âm | `/return-goods` | `click [aria-label="Lọc theo khoảng thời gian"]; click [role="option"]:has-text("Toàn bộ"); click button:has-text("Áp dụng")` | AC-07 | `text=-580.000` |
| S3 | Lọc Loại = "Đổi trả" chỉ còn hoá đơn đổi, chân trang tổng lại | `/return-goods` | `click [aria-label="Lọc theo khoảng thời gian"]; click [role="option"]:has-text("Toàn bộ"); click button:has-text("Áp dụng"); click [aria-label="Lọc theo loại chứng từ"]; click [role="option"]:has-text("Đổi trả"); wait text=-20.000` | AC-05, AC-06 | `text=RTN-202607-00001; text=-20.000; no-text=INV-202608-00013` |
| S4 | Lọc Loại = "Bán hàng" chỉ còn hoá đơn bán, tổng đổi theo | `/return-goods` | `click [aria-label="Lọc theo khoảng thời gian"]; click [role="option"]:has-text("Toàn bộ"); click button:has-text("Áp dụng"); click [aria-label="Lọc theo loại chứng từ"]; click [role="option"]:has-text("Bán hàng"); wait text=91.229.000` | AC-05, AC-06 | `text=INV-202608-00013; text=91.229.000; no-text=RTN-202607-00001` |
| S5 | Hộp thoại trả hàng của hoá đơn đổi chỉ chào hàng "Mua thêm" | `/return-goods` | `click [aria-label="Lọc theo khoảng thời gian"]; click [role="option"]:has-text("Toàn bộ"); click button:has-text("Áp dụng"); click tbody tr:has-text("RTN-202607-00001") button:has-text("Đổi trả")` | AC-08 | `text=SETVOANM-D; no-text=ABA2777-D-38` |

## Nhịp bất đối xứng của hai bộ lọc

Pill ngày gọi `setDateRange` thẳng, còn ô lọc cột đi qua `useDebounce(filters, 300)`.
Nên sau khi chọn "Đổi trả"/"Bán hàng" phải `wait` cho tới khi **chân trang** đổi số —
`no-text` trong runner đọc `.count()` ngay lập tức, không chờ, nên thiếu `wait` là lưới
còn nguyên tập cũ và step đỏ vì nhịp chứ không phải vì tính năng. Số chờ chính là tổng có
dấu của tập đang lọc, nên cái `wait` đó đồng thời là bằng chứng cho AC-05.

## Fixtures

Cố định theo `erp_dev`, chi nhánh **Hồ Chí Minh** (`c3bf1922-3a2e-42d9-b00d-a7129efe592c`),
tổ chức `f1000000-0000-4000-8000-000000000001`:

| Mã | Loại | Trạng thái | Vai trò trong bài kiểm |
|---|---|---|---|
| `RTN-202607-00001` | EXCHANGE | paid | `netAmount` = −580.000 (AC-07); 1 dòng IN `ABA2777-D-38` + 1 dòng OUT `SETVOANM-D` còn trả được 2 (AC-08) |
| `RTN-202607-00012` | EXCHANGE | debt | Hoá đơn đổi ghi nợ vẫn phải hiện (AC-04) |
| `INV-202608-00013` | SALE | paid | Đối chứng: phải biến mất khi lọc "Đổi trả", còn lại khi lọc "Bán hàng" |
| `2608220001TH` | RETURN | paid | Phải **không bao giờ** xuất hiện (AC-02) — nằm trong khoảng ngày, chỉ có dòng IN |

Ô lọc ngày mặc định là `TODAY`, mọi fixture đều cũ hơn hôm nay, nên bước đầu của mọi
step phải mở pill ngày và chọn "Toàn bộ". Bỏ ba thao tác đó thì lưới rỗng và mọi
assertion đỏ vì lý do không liên quan gì tới tính năng.

## Khiếm khuyết đã biết — nút "Đổi trả" tràn mép phải ở 1440×900

Tìm ra ở G4, đúng bằng phép kiểm mà T-02-01 hoãn sang đây. **Không chặn tính năng** (nút
vẫn bấm được, S5 xanh), nhưng có thật và không sửa trong phạm vi feature này.

Đo bằng cách ẩn cột `Loại` để dựng lại bố cục 7 cột cũ:

| | ô Action | nút | mép phải bảng |
|---|---|---|---|
| 8 cột (hiện tại) | 75px | 51px (bị bóp) | 1456 |
| 7 cột (trước T-02-01) | 120px | 71px | 1424 |

**Gốc rễ không nằm ở cột `Loại`.** Ẩn riêng hàng lọc đi thì bảng co về đúng 1408 và vừa
khít. Mỗi cột có `PosDataTableFilterCell` đòi 214px vì `<input>` mang chiều rộng mặc định
của UA (~20 ký tự) cộng ô chọn toán tử `w-8`; sáu cột như thế là 1284px, không còn chỗ cho
cột thứ tám. Cột `Loại` chỉ chiếm 93px — nó là giọt nước, không phải cái ly.

Đã thử `min-w-[120px]` cho cột Action: nút trả về đúng 71px nhưng bảng phình lên 1497 và
nút văng ra xa mép hơn (1501 so với 1456) — **tệ hơn**, nên đã hoàn nguyên. Fix thật là
lấy lại ~90px từ hàng lọc, tức sửa `PosDataTableFilterCell` — dùng chung cho mọi lưới POS,
ngoài phạm vi và cần ticket riêng.

## Not verified here

- **AC-03** (hoá đơn đổi trả hết dòng OUT rơi khỏi lưới) — `erp_dev` chưa có hoá đơn đổi
  nào trả hết, và dựng một cái nghĩa là **post** một phiếu trả thật: bút toán, chuyển kho,
  chi tiền, không hoàn tác được (chứng từ đã post là bất biến, sửa bằng bút toán đảo).
  Đang khoá bằng unit test `search-returnable-invoices-v2.handler.spec.ts` — "drops an
  exchange whose OUT lines are all returned (AC-03)" — cộng vị từ `EXISTS` trong
  `buildQuery`. Cần bằng chứng chạy thật thì phải xin phép mutate `erp_dev` trước.
- **AC-09, AC-10, AC-11** — đường ghi, không có bề mặt UI trong phạm vi UOW-02. Đã kiểm
  bằng lệnh gọi API thật trên `RTN-202607-00001` (xem `08-evidence.md` phần ghi chú) và
  bằng test ở `return-eligibility.service.spec.ts` + `checkout-return.service.spec.ts`.

## Notes

- Chạy trên `local-pos-worktree` (`:3002`) — vite dựng từ chính worktree này. `:3001` là
  checkout gốc, verify ở đó là chụp nhầm bản.
- Tài khoản `admin@erp.local`, chi nhánh Hồ Chí Minh — đã nằm sẵn trong phiên lưu ở
  `.ai/.auth/local-pos-worktree.json`. Dựng lại phiên bằng `.ai/capture-pos-session.py`
  khi refresh token hết hạn.
- `apps/pos-web/.env` phải có `VITE_DEV_ORG_ID=f1000000-...`. Với `storage-state` thì
  phiên đã mang sẵn `organization_id`, nhưng lúc **chụp** phiên thì ô "ID tổ chức" lấy giá
  trị prefill của trang, mà mặc định trong code trỏ sang một tổ chức khác không có fixture
  nào — sai từ bước đó thì mọi thứ sau đều sai theo.
