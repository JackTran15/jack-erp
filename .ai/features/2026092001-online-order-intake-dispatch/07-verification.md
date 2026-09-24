---
feature: 2026092001-online-order-intake-dispatch
environments: [local-backoffice-erp2]
viewports: [desktop]
---

# 07 — Bằng chứng xác minh

## Đợt 2 (2026-09-24) — duyệt đơn · nhãn thiếu hàng · chọn chi nhánh từng đơn

Lưới Điều phối KHÔNG có cột mã đơn, nên bước nhận dòng theo **người nhận** (`Người nhận X`…, duy nhất theo đơn); dialog thì có mã đơn nên assert trong dialog dùng mã `DT…`.

Chạy bằng `verify.py --env local-backoffice-erp2` trên backoffice **:3010** của
checkout này, trỏ vào API **:4199** → DB **`erp_dev_3008`**, tổ chức Inventory Demo
Org. KHÔNG chạy qua `local-backoffice` (:3000): trên máy này nó gọi API erp3 nối vào
`erp_clone_prod`.

**Các bước có ghi và chạy theo thứ tự** — S5 phải trước S6, S9 trước S10. Chạy lại
cần bộ đơn mới (externalOrderId khác) vì S6 và S10 đổi trạng thái đơn.

### Fixture lần 2 (sau A-41, duyệt chuyển sang chi nhánh)

Sáu đơn mới qua `POST /v2/partner/orders` (key demo cũ): U1 `43-NAU × 5`, U2 `43-NAU × 30`,
U3 `43-NAU × 2 + 40-DEN × 20` (DT000154–156) — phân về **Main Branch** bằng
`POST /admin/sales-orders/:id/dispatch` **không duyệt trước** (200, AC-46 ở mức API);
Main Branch có `43-NAU = 22`, `40-DEN = 8` ⇒ U2 thiếu 8, U3 thiếu 12. V1–V3 `39-DEN × 1`
(DT000157–159) để lại pool. Phiên runner đăng nhập ở Main Branch.

### Fixture lần 1 (không qua UI, ghi lại ở đây)

Tồn thật, không sửa tay: `GELLI-39-DEN` = 30 Cà Mau + 30 Cần Thơ (toàn chuỗi 60),
`GELLI-40-NAU` = 60. Mười đơn đặt qua `POST /v2/partner/orders` bằng một API key
demo (vai trò *Đối tác đặt hàng*, kênh WEB):

| Mã | Vai | Dòng | Nhãn lúc nhận |
|---|---|---|---|
| DT000144 | A — đủ nhờ cộng 2 CN | 39-DEN × 45 | không |
| DT000145 | B — thiếu 2 dòng | 39-DEN × 70, 40-NAU × 61 | Thiếu hàng |
| DT000146 | X — đủ | 39-DEN × 10 | không |
| DT000147 | Y — thiếu 1 dòng | 39-DEN × 70 | Thiếu hàng |
| DT000148 | Z — thiếu 1 dòng | 39-DEN × 10, 40-NAU × 100 | Thiếu hàng |
| DT000149 | P | 39-DEN × 40 | không |
| DT000150 | Q | 39-DEN × 5 | không |
| DT000151 | R | 39-DEN × 1 | không |
| DT000152 | S — cho AC-45 | 39-DEN × 2 | không |
| DT000153 | T — cho AC-33 | 39-DEN × 3 | không |

Rồi qua API: duyệt P, Q, R, S (`POST /admin/sales-orders/:id/confirm`); huỷ S và T
(`POST /mobile/sales-orders/:id/cancel`) để giả lập "người khác vừa huỷ". Kiểm DB
sau khi nhận đơn: `stock_short` = f,t,f,t,t,f,f,f,f,f; mọi dòng
`chain_stock_at_intake = 60`; body 201 của đơn thiếu và đơn đủ cùng bộ khoá.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Điều phối: DT000145 (B, thiếu) có nhãn vàng, DT000144 (A, đủ nhờ cộng 2 CN) không | `/orders/dispatch` | `wait tbody tr:has-text("Người nhận A")` | AC-36, AC-37, AC-39 | `count tbody tr:has-text("Người nhận B"):has-text("Thiếu hàng") = 1; count tbody tr:has-text("Người nhận A"):has-text("Thiếu hàng") = 0` |
| S2 | Tất cả đơn: cùng nhãn cho cùng đơn | `/orders/all` | `wait tbody tr:has-text("Người nhận V1")` | AC-39 | `count tbody tr:has-text("Người nhận B"):has-text("Thiếu hàng") = 1; count tbody tr:has-text("Người nhận A"):has-text("Thiếu hàng") = 0` |

## Not verified here

AC-01, AC-02, AC-03, AC-04, AC-05, AC-06, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23, AC-24, AC-25, AC-26, AC-27, AC-28, AC-29 thuộc đợt 1 (UOW-01 … UOW-07): bằng chứng tay, SQL và ảnh chụp nằm ở phần
"Đợt 1" bên dưới, không qua runner.

AC-30, AC-31, AC-33, AC-34, AC-35, AC-40, AC-41, AC-42, AC-43, AC-44, AC-45, AC-46,
AC-47 — luồng có GHI (duyệt, phân, trả về) không chạy lại được bằng runner trên cùng dữ
liệu, nên được chứng minh bằng script E2E tạo bộ đơn mới mỗi lần:
`evidence/2026-09-24-e2e-dialog/run_e2e.py` → **41/41 đạt** (Playwright qua backoffice
:3010 + API :4199, ảnh 01–09, `report.md`, `results.json`), cộng e2e
`branch-confirm.e2e-spec.ts` (9/9) cho AC-33, AC-35. AC-32 (Huỷ ở cảnh báo) và AC-48
(đơn mobile) — e2e `branch-confirm` và lần chạy runner lần 2 (S10) trước khi đổi luồng
Điều phối; hành vi duyệt ở chi nhánh không đổi từ đó.

AC-38 (nhãn giữ nguyên sau nhập hàng) — e2e `partner-order.e2e-spec.ts` (T-08-03).

AC-49, AC-50, AC-51, AC-52, AC-53, AC-54 (US-12, lịch sử đơn) — dữ liệu phải dựng bằng
chuỗi thao tác ghi, nên chứng minh bằng `evidence/2026-09-24-e2e-history/run_e2e.py`
(**22/22**, modal trên ba màn + API) và e2e `sales-order-history.e2e-spec.ts` (T-13-03,
**7/7**, gồm AC-53 thiếu quyền → 403 và AC-54 đơn tư vấn viên).

## Notes

- S8 đếm 6 = số đơn Đã duyệt còn trong pool lúc đó (X, Y, Z sau S6; P, Q, R, S từ
  fixture = 7) trừ Q vừa đổi sang Cần Thơ. Nếu con số lệch, đọc ảnh trước khi sửa assert.
- Thứ tự đủ → thiếu trong dialog (S4: X trước Y, Z; S9: Q trước P) là thứ tự server
  trả; ảnh là bằng chứng, assert chỉ chặn nội dung.
- **Chạy lại**: S4–S6 duyệt X, Y, Z. Trước mỗi lần chạy lại toàn bộ, đưa ba đơn demo đó về Chờ duyệt: `UPDATE sales_orders SET confirmed_at=NULL, confirmed_by=NULL` + xoá các dòng `CONFIRM` của chúng trong `sales_order_dispatch_events` (chỉ dữ liệu demo DEMO0924-X/Y/Z trên `erp_dev_3008`). Phiên `.ai/.auth/local-backoffice-erp2.json` phải chụp lại trước mỗi lần chạy (refresh token xoay vòng).
- AC-33, AC-45: script `evidence/manual/partial-failures.py` (xem mục cùng tên).

## E2E lịch sử đơn — 2026-09-24 (`evidence/2026-09-24-e2e-history/`)

Run `140719`, H1 = DT000170 (đủ vòng), H2 (huỷ), H3 (trả về pool) → **22/22 đạt**. Dựng
bằng API thật: phân Cà Mau → Cà Mau duyệt (token chi nhánh qua `/auth/switch-branch`) →
Cà Mau trả về "hết hàng" → phân Main → Main duyệt → thu ngân Main xử lý. API lịch sử: 7
mốc đúng thứ tự, nhận đơn hiện "Website công ty", trạng thái sau: Chờ phân → Chờ duyệt →
Đã duyệt → Chờ phân → Chờ duyệt → Đã duyệt → Đã xử lý; Cần Thơ gọi → 403
`ORDER_NOT_HELD_BY_BRANCH`. Modal "Lịch sử" mở đúng trên Tất cả đơn (nút khoá khi chưa
chọn dòng), Điều phối (H3: Nhận → Phân Cà Mau → Trả về "sai kho"), Đơn hàng chi nhánh
Main (H1 đủ 7 mốc), H2 mốc cuối "Huỷ đơn" + "khách đổi ý". Ảnh 01–04.

Ghi chú: mốc "Thu ngân xử lý" hiện mã **hoá đơn nháp** (`DRAFT-…`) cho tới khi thu ngân
thu tiền và hoá đơn có số chính thức.

## E2E toàn chuỗi, dialog Điều phối — 2026-09-24 (`evidence/2026-09-24-e2e-dialog/`)

Sau A-48 / ADR-13 (UOW-12). Run `134015`, đơn DT000164–DT000169 → **41/41 đạt**. Khác bản
dưới ở chặng 2–3 và thêm chặng 8: lưới Điều phối không còn ô chọn chi nhánh; tick 4 đơn →
"Điều phối (4)" → dialog đúng 4 đơn, "Chọn cho tất cả" = Main Branch điền 4 dòng, đổi O3
→ Cà Mau; Validate trong dialog ("thiếu 8 tại Main Branch", "thiếu 40 tại Cà Mau", đủ
trước thiếu), đóng báo cáo lựa chọn còn nguyên; Lưu → 4/4, dialog đóng. Chặng 8 (AC-45):
tick O5, O6, mở dialog, O6 bị huỷ qua API, Lưu → O5 "Đã phân về Cần Thơ", O6 báo "Đơn
hàng không ở trạng thái chờ phân (CANCELLED)" tại dòng, giữ Cần Thơ, dialog không đóng.

## E2E toàn chuỗi — 2026-09-24 (`evidence/2026-09-24-e2e/`, luồng cột chọn trên lưới — đã thay)

Script `evidence/2026-09-24-e2e/run_e2e.py` (Playwright + API, bộ đơn mới mỗi lần chạy,
run `132919`, đơn DT000160–DT000163) → **27/27 kiểm tra đạt**. Báo cáo `report.md`, dữ
liệu `results.json`, ảnh `01…07-*.png` cùng thư mục. Bảy chặng: đối tác đặt đơn (nhãn
chỉ trên đơn thiếu toàn chuỗi, body 201 không đổi) → Điều phối không có bước duyệt, chọn
chi nhánh từng đơn, Validate ("thiếu 8 tại Main Branch", "thiếu 40 tại Cà Mau"), Lưu 4/4
→ thu ngân xử lý đơn chưa duyệt: 409 `ORDER_NOT_CONFIRMED`, không nháp, không có trong
`awaitingCashier` → chi nhánh Duyệt đơn: cảnh báo "theo tồn tại chi nhánh này", đủ trước
thiếu, Vẫn duyệt → Đã duyệt → thu ngân xử lý đơn đã duyệt: 200 PROCESSED + hoá đơn nháp →
chi nhánh duyệt rồi trả về pool: `confirmed_at` NULL, dòng CONFIRM còn, đơn hiện lại ở
Điều phối không nhãn duyệt. Không thay runner (`evidence/run.json` giữ nguyên).

## Kết quả chạy lần 2 — 2026-09-24 (sau A-41: duyệt ở chi nhánh)

**Runner:** `verify.py --env local-backoffice-erp2 --write` → **pass 11/11** trên API build
mới (:4199). `evidence_check.py` → PASS. Bộ bước ở trên thay hoàn toàn bộ bước lần 1
(lần 1 khẳng định "Duyệt đơn" nằm ở Điều phối — sai sau A-41).

- S3: Điều phối không còn "Duyệt đơn" / "Chờ duyệt", 10/10 dòng pool có ô chọn chi nhánh.
- S5: V1 chưa ai duyệt vẫn Lưu được → DB `branch_id` = Cần Thơ, `confirmed_at` NULL (AC-46).
- S6/S7: Y → Cà Mau "thiếu 40 tại Cà Mau", V3 → Cần Thơ đủ; Lưu → cả hai rời pool, V2 ở lại.
- S8–S11 ở `/orders` của Main Branch: U1–U3 "Chờ duyệt" → dialog "Theo tồn tại chi nhánh
  này, 2/3 đơn thiếu hàng": U1 đủ (cần 5 / tồn 22), U2 "cần 30 / tồn 22 / thiếu 8", U3
  dòng 40-DEN "cần 20 / tồn 8 / thiếu 12", đúng thứ tự đủ → thiếu. Huỷ không đổi gì; Vẫn
  duyệt → DB cả ba có `confirmed_at`. (U1–U3 thay vai X, Y, Z của demo UOW-09 cũ.)

**Lỗi tìm thấy (S9.png):** dòng "Khách web E2E" — đơn web đã **Đã xử lý** từ trước khi có
bước duyệt — vẫn mang nhãn "Chờ duyệt". Nhãn chỉ xét `needsConfirmation` (đơn web), phải
xét thêm `status = SENT`. **Đã sửa ở T-11-06** (Akenzy reopen G3): `toOrderRow` chỉ đặt `needsConfirmation` khi đơn còn `SENT`; vitest `order-mapper.test.ts` 22/22; kiểm lại trên `/orders` Main Branch: dòng "Khách web E2E" (Đã xử lý) 0 nhãn "Chờ duyệt", U1 vẫn "Đã duyệt" — ảnh `evidence/manual/T-11-06-processed-no-badge.png`.

Đơn Y (DT000147) mang `confirmed_at` từ luồng cũ (duyệt ở Điều phối trước A-41) — dữ liệu
demo sót lại, không phải hành vi mới.

## Kết quả chạy lần 1 — 2026-09-24 (luồng cũ, duyệt ở Điều phối — đã lỗi thời)

**Runner:** `verify.py --env local-backoffice-erp2 --write` → **pass 11/11**
(chromium 151, commit 16ab9b9b, cây làm việc chưa commit). `evidence_check.py` → PASS.
Ảnh: `evidence/local-backoffice-erp2/desktop/S1…S11.png`. Dialog ở S4 và S9 bị chụp
lúc còn hiệu ứng mờ dần — nội dung đọc được, thứ tự đúng: S4 X (Đủ hàng) → Y → Z
(Thiếu 1 dòng, vàng "cần 70 / tồn 60 / thiếu 10"); S9 Q (Đủ hàng, Cần Thơ) → P
("thiếu 10 tại Cà Mau"), R không có mặt.

**DB sau S10 (AC-42, AC-44):** P (DT000149) → Cà Mau dù thiếu 10 tại đó; Q
(DT000150) → Cần Thơ; R (DT000151) branch NULL. `status` giữ `SENT` (ADR-08). Lịch
sử: mỗi đơn đúng một dòng `CONFIRM`, hai dòng `DISPATCH` (Cà Mau, Cần Thơ).

**Script `evidence/manual/partial-failures.py` → 2/2 pass:**
- AC-33 — tick A (đủ) + T (đã huỷ) → Duyệt đơn: A "Đã duyệt"; dialog giữ mở, T báo
  lỗi ngay cạnh DT000153 và vẫn "Chờ duyệt". Ảnh `AC-33-dialog.png`, `AC-33-grid.png`.
- AC-45 — R → Cần Thơ, S (đã huỷ) → Cà Mau → Lưu: R rời pool (DB: Cần Thơ); dòng S
  viền đỏ + icon cảnh báo, ô chi nhánh giữ "Cà Mau"; toast "Đã phân 1/2 đơn —
  DT000152: Đơn hàng không ở trạng thái chờ phân (CANCELLED)". Ảnh `AC-45-grid.png`,
  `AC-45-row-error-hover.png`.

**Phát hiện nhỏ (không chặn AC):** lỗi hiện ra là `message` tiếng Việt của server
("Đơn hàng không ở trạng thái chờ duyệt (CANCELLED)"), không phải câu frontend tự
map cho `ORDER_NOT_CONFIRMABLE` trong `use-admin-sales-orders.ts:321` — bảng map đó
đang không được dùng khi server đã có message.

---

# Đợt 1 (2026-09-21) — bằng chứng tay

_Môi trường đợt 1: local-pos (pos-web :3001 → API :4188, DB erp_dev_3008), by claude (orchestrator)._


## T-04-05 — Ba nguồn số, một kết quả (AC-26)

Ba hoá đơn dựng bằng script (`/tmp/claude-502/t0405-fixtures.sql`), không gõ tay,
trên chi nhánh **Main Branch** của tổ chức `10000000-…-0001`.

### Nguồn 1 — DB (`invoices`)

| code | type | subtotal | discount | points | **shipping_fee** | **amount_due** | net_amount |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| HD-T0405-01 | SALE | 1.000.000 | 100.000 | 50.000 | **30.000** | **880.000** | 880.000 |
| HD-T0405-02 | SALE | 100.000 | 500.000 | 0 | **30.000** | **30.000** | 30.000 |
| HD-T0405-03 | RETURN | 1.000.000 | 100.000 | 50.000 | **0** | 0 | **−850.000** |

`#01` là ca demo: `1.000.000 − 100.000 − 50.000 + 30.000 = 880.000`.
`#02` là ca clamp: tiền hàng về 0, khách vẫn nợ đúng phần phí.

### Nguồn 2 — cột "Tổng thanh toán" trên lưới POS

Đọc thẳng từ DOM của `/pos/invoices` (không phải từ ảnh):

| Số hóa đơn | Trạng thái | **Tổng thanh toán** |
| --- | --- | ---: |
| HD-T0405-01 | Đã thanh toán | **880.000** |
| HD-T0405-02 | Đã thanh toán | **30.000** |
| HD-T0405-03 | Đã thanh toán | **−850.000** |

Khớp từng đồng với Nguồn 1. Ảnh: `evidence/t0405-02-grid-money.png`
(khung nhìn 2200px để lộ cột tiền; `evidence/t0405-01-grid.png` là khung 1440px
thường dùng, cột tiền nằm ngoài khung — chính vì vậy bảng DOM ở trên mới là
bằng chứng, ảnh chỉ là minh hoạ).

### Nguồn 3 — dòng tổng footer

Lưới hiển thị: **`Tổng tiền: 60.000`**

`880.000 + 30.000 + (−850.000) = 60.000` ✔

**Lưu ý về con số 910.000 trong demo script.** 910.000 là tổng của **chỉ hai hoá
đơn bán**; nó đúng khi trong tầm nhìn không có hoá đơn trả. Ở đây cả ba dòng cùng
nằm trong bộ lọc nên tổng có dấu đúng là 60.000. Đối chiếu bằng SQL:

```
footer_sum_all          =  60.000   -- cả ba dòng
footer_sum_sales_only   = 910.000   -- chỉ SALE
```

Cả hai đều nhất quán với `invoiceSignedTotalSql`
(`CASE WHEN type IN (RETURN, EXCHANGE) THEN net_amount ELSE amount_due END`).
Con số trong demo script không sai — nó chỉ giả định một tầm nhìn khác.

### Lọc theo khoảng tiền — lệch một đồng là trượt

Chạy đúng biểu thức mà `FilterBuilder.applyCompare` dùng:

| khoảng | số dòng khớp |
| --- | ---: |
| 880.000 – 880.000 | **1** |
| 879.999 – 879.999 | 0 |
| 880.001 – 880.001 | 0 |
| 850.000 – 850.000 (giá trị TRƯỚC khi cộng phí) | **0** |

Ô cuối là ô đáng giá: nếu phí không thực sự nằm trong `amount_due` thì hoá đơn
`#01` đã khớp ở 850.000.

### Ca RETURN không mang phí (A-23)

`HD-T0405-03` là hoá đơn trả của `#01`:

- `shipping_fee_amount = 0` — không đường nào ghi phí lên chứng từ trả.
- `net_amount = −850.000`, tức **đúng phần tiền hàng** của `#01`
  (`880.000 − 30.000`), không phải −880.000.
- Trên lưới, dòng này hiện **−850.000** ở cột "Tổng thanh toán" (dòng thứ ba,
  `evidence/t0405-02-grid-money.png`) — nhánh `RETURN → net_amount` chạy đúng.

Khách **không** được hoàn 30.000 tiền ship. Đó là A-23, và nó đo được ở cả ba
nguồn.

### Lưới an toàn hồi quy

Số học của ba nguồn được ghim bằng test chứ không chỉ bằng tài liệu này —
`apps/api/src/modules/pos/services/invoice-amount.util.spec.ts` (T-04-03), trong
đó ca A-23 chạy `refundableFactor` thật: thêm phí vào header hoá đơn **không**
được làm đổi số hoàn. Kiểm chứng bằng đột biến: rò phí vào `headerResidual` thì
test đỏ.

---

## T-03-03 — Màn "Tất cả đơn hàng": ba phạm vi (AC-14, AC-15)

Môi trường: `local-backoffice` (:3000 → API :4188, DB `erp_dev_3008`),
tài khoản `inventory.admin@erp.local` (giữ `pos.sales-order.read-all`).

**Mọi ảnh dưới đây đều kèm assert DOM** — số liệu trong bảng đọc thẳng từ
`document.querySelectorAll`, không phải nhìn ảnh mà gõ lại.

### Chạy lại từ đầu

```bash
# 1. dữ liệu — 5 đơn ở 4 phạm vi
psql … -f .ai/features/…/evidence/scripts/t03-03-fixtures.sql
#    rồi đẩy một đơn sang chi nhánh KHÔNG tồn tại để có ca "đã xoá":
#    update sales_orders set branch_id='99999999-0000-4000-8000-00000000dead'
#      where document_number='DTW000005';

# 2. dịch vụ
cd apps/api && PORT=4188 node dist/main &
cd apps/backoffice-web && VITE_API_BASE_URL=http://127.0.0.1:4188 pnpm dev &

# 3. ảnh + assert
set -a && . .ai/credentials.env && set +a
~/.venvs/aidlc-verify/bin/python .ai/features/…/evidence/scripts/t03-03-all-orders.py
~/.venvs/aidlc-verify/bin/python .ai/features/…/evidence/scripts/t03-03-branch-filter.py
```

`.ai/credentials.env` cung cấp `LOCAL_BACKOFFICE_ORG_ID/EMAIL/PASSWORD`.
Script tự đăng nhập và **điều hướng trong app** (`pushState` + `popstate`) chứ
không `goto` — tải lại trang làm mất access token trong bộ nhớ và văng về
`/login`.

### Ảnh 1 — đủ ba (thực ra bốn) phạm vi · `evidence/viz-11-all-deleted-branch.png`

Assert DOM: `Hiển thị 1 - 5 trên 5 kết quả`, cột **Chi nhánh**:

| đơn | người nhận | ô Chi nhánh |
| --- | --- | --- |
| DTW000005 | Vo Thi Lan | `(Chi nhánh đã xoá)` |
| DTW000004 | Pham Van Tu | `Main Branch` |
| DTW000001 | Nguyen Thi Mai | `Cà Mau` |
| DTW000002 | Tran Van Nam | `Cần Thơ` |
| DTW000003 | Le Thi Hoa | `(Chưa phân)` |

`(Chi nhánh đã xoá)` **khác** `(Chưa phân)` có chủ đích: đơn trỏ vào chi nhánh
đã xoá KHÔNG tự quay về pool, để trống hai ô giống nhau là nói dối người dùng.
Đây cũng là ca chứng minh quyết định của T-03-01 — tra tên chi nhánh bằng đọc
theo khoá, không `INNER JOIN`; join sẽ làm chính dòng này **biến mất** khỏi lưới.

### Ảnh 2 — lọc `(Chưa phân)` · `evidence/viz-12-filter-unassigned.png`

Assert DOM: còn đúng **1** dòng, ô Chi nhánh = `(Chưa phân)`.
Request thật: `GET /admin/sales-orders?page=1&limit=50&branchId=UNASSIGNED&…`

### Ảnh 3 — lọc theo một chi nhánh · `evidence/viz-13-filter-camau.png`

Assert DOM: còn đúng **1** dòng, ô Chi nhánh = `Cà Mau`.
Request thật: `GET /admin/sales-orders?…&branchId=20000000-0000-4000-8000-000000000002&…`

Danh sách lựa chọn của bộ lọc: `Tất cả | (Chưa phân) | Cần Thơ | Cà Mau | Main Branch`
— `(Chưa phân)` gửi sentinel `UNASSIGNED`, chi nhánh thật gửi uuid, và mục
"Tất cả" gửi chuỗi rỗng **không** được gửi đi (API trả 400 cho `branchId=""`).

### Ca đối chứng — `/orders` KHÔNG đổi

Assert DOM trên `/orders` ở cùng phiên: **không có** cột "Chi nhánh"
(`orgOnly` bị lọc khỏi `ORDER_COLUMN_ORDER`), và lưới chỉ còn đơn của chi nhánh
đang đăng nhập. Cột mới không rò sang màn cũ, kể cả với người đã lưu tuỳ chọn cột.

---

## T-05-05 — Kênh mới không cần migration (AC-18, AC-28)

Môi trường: API :4188, DB `erp_dev_3008`, tài khoản `inventory.admin@erp.local`.

### Bước 1 — đăng ký một kênh CHƯA TỪNG CÓ, qua đúng đường CRUD

```
POST /admin/entities/sales-channels/records  {"code":"ZALO","name":"Zalo OA","isActive":true}
→ 201, id ef386c21-6189-47cb-984b-4abb89505627
```

**Không chạy migration nào.** Kênh mới là một DÒNG DỮ LIỆU — đó là toàn bộ lý do
`sales_channels` tồn tại thay vì một enum (ADR-03).

### Bước 2 — hoá đơn trên ba kênh, đọc qua báo cáo thật

`POST /reports/invoices/search` với `reportType: invoice-order-listing`,
`columns: [invoiceCode, salesChannel, revenue.total]`:

| hoá đơn | `salesChannel` | `revenue.total` |
| --- | --- | ---: |
| HD-CH-POS | **Tại cửa hàng** | 250.000 |
| HD-CH-WEB | **Website cong ty** | 1.000.000 |
| HD-CH-ZALO | **Zalo OA** | 500.000 |

Ba nhóm phân biệt. `NULL` hiện thành "Tại cửa hàng" ở `listingCellValue`, nên ô
hiển thị và ô lọc so cùng một chuỗi.

**Hoá đơn Zalo được tạo TRƯỚC khi kênh ZALO được đăng ký.** Báo cáo vẫn nhóm
đúng — vì resolver chỉ đọc dòng hoá đơn, không tra `sales_channels` lần nào. Đó
cũng là lý do một kênh bị đổi tên hay xoá không làm hoá đơn cũ trống hay dồn
nhóm.

### Bước 3 — phí giao KHÔNG nằm trong doanh thu hàng hoá (A-21 còn treo)

`HD-CH-WEB` trong DB: `subtotal = 1.000.000`, `shipping_fee_amount = 30.000`,
`amount_due = **1.030.000**`.
Báo cáo trả `revenue.total = **1.000.000**`.

Chênh đúng 30.000 tiền ship, và đó là **đúng**: A-21 (tài khoản hạch toán cho
phí) chưa chốt, nên phí không được gộp vào doanh thu hàng hoá. `revenue.fee` vẫn
là `placeholder: 0`. Có một test mang tên
`keeps the delivery fee out of merchandise revenue while A-21 is pending` ghim
cả hai nguồn cột, nên nối `shipping_fee_amount` vào doanh thu trước khi chốt
A-21 sẽ làm test đỏ đích danh chứ không lọt êm.

---

## T-06-02 — Vòng DISPATCH → RETURN → DISPATCH (AC-21, AC-22)

> **Trạng thái: ĐÃ CHẠY 2026-09-21** (orchestrator, `local-backoffice` :3000 →
> API :4188, DB `erp_dev_3008`). Kết quả thật ở cuối mục này. Phần kịch bản bên
> dưới giữ nguyên để chạy lại được.

Môi trường: `local-backoffice` (:3000 → API :4188, DB `erp_dev_3008`).
Hai tài khoản, vì AC-21 nói về **thu ngân chi nhánh** chứ không phải Admin:

| vai | quyền dùng tới |
| --- | --- |
| Admin điều phối | `pos.sales-order.dispatch` (+ `read-all` cho `/orders/all`) |
| Thu ngân CN-A | `pos.sales-order.approve` — KHÔNG có `dispatch` |

Thu ngân chỉ có `approve` là ca đáng chạy: `POST /admin/sales-orders/:id/return`
khai quyền dạng mảng (OR), và nhánh thu hẹp "chỉ đơn chi nhánh mình" nằm trong
`SalesOrderService.returnToPool`, không ở decorator. Chạy cả vòng bằng tài khoản
Admin sẽ bỏ qua đúng cái nhánh ấy.

### Chuẩn bị

Một đơn `status = 'SENT'`, `invoice_id IS NULL`, chưa phân chi nhánh.

```sql
select id, document_number, status, branch_id, invoice_id
from sales_orders
where organization_id = :org and status = 'SENT' and invoice_id is null
order by created_at desc limit 5;
```

### Các bước và ô chờ điền

| # | Việc | Bằng chứng phải lấy | Kết quả |
| --- | --- | --- | --- |
| 1 | Admin `/orders/dispatch` → tick đơn → **Phân chi nhánh** → CN-A | ảnh lưới pool trước/sau | … |
| 2 | Thu ngân CN-A đăng nhập, mở `/orders` | assert DOM: đơn CÓ trong lưới | … |
| 3 | Tick đơn → **Trả đơn về** → lý do `hết hàng` → xác nhận | ảnh hộp lý do | … |
| 4 | Lưới CN-A tự nạp lại | assert DOM: đơn KHÔNG còn dòng nào | … |
| 5 | SQL sau khi trả về (bảng dưới) | `branch_id IS NULL`, `status = 'SENT'` | … |
| 6 | Admin `/orders/dispatch` | assert DOM: đơn xuất hiện lại | … |
| 7 | Admin phân lại cho "Chi nhánh kiểm thử" | ảnh lưới sau khi phân | … |
| 8 | SQL lịch sử điều phối | đúng **3** dòng DISPATCH → RETURN → DISPATCH | … |
| 9 | Đơn khác đã phát hành hoá đơn → **Trả đơn về** | API từ chối, `branch_id` KHÔNG đổi | … |

### SQL cho bước 5 và bước 8

```sql
-- AC-21: trả về pool KHÔNG đổi trạng thái (A-05)
select branch_id, status from sales_orders where id = :order_id;
-- kỳ vọng: branch_id = NULL, status = 'SENT'

-- AC-21: lý do nằm trong lịch sử điều phối; vòng đủ phải ra đúng 3 dòng
select action, from_branch_id, to_branch_id, reason, created_at
from sales_order_dispatch_events
where sales_order_id = :order_id
order by created_at;
-- kỳ vọng: DISPATCH(to=CN-A) → RETURN(from=CN-A, reason='hết hàng') → DISPATCH(to=CN kiểm thử)
```

**Vì sao bảng lịch sử đọc bằng SQL chứ không phải trên màn hình.** Đợt này
không có đường đọc `sales_order_dispatch_events` — không controller nào phơi ra
`GET …/dispatch-events`, nên không có gì để giao diện gọi. Demo script của
UOW-06 (bước 4 và 6) cũng chốt đúng như vậy: xem trong Adminer. Một tab "Lịch sử
điều phối" trên panel chi tiết là việc của một ticket có endpoint đi kèm.

### AC-22 — đơn đã phát hành hoá đơn (bước 9)

Hai lớp chặn, và phải thấy CẢ HAI:

1. **Nút** — tick một đơn "Đã xử lý" thì "Trả đơn về" xám, `title` đọc được:
   *"Đơn đã phát hành hoá đơn thì không trả về được — bỏ tick đơn đó, hoặc huỷ
   đơn nếu khách không lấy nữa"*. Chụp cả tooltip.
2. **API** — chặn thật, vì nút xám chỉ là tiện ích. Gọi thẳng:

```bash
curl -si -X POST "$API/admin/sales-orders/$ORDER_ID/return" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"reason":"hết hàng"}'
# kỳ vọng: 409, body.details.code = ORDER_HAS_INVOICE
```

`details.code` chứ không phải `code`: `HttpExceptionFilter` đẩy `HTTP_409` lên
`code` mức trên cùng và trải thân `ConflictException` vào `details`. Giao diện
đọc đúng chỗ ấy (`errorCodeOf` trong `OrdersPageToolbar.tsx`) — dò `code` mức
trên cùng là mọi lỗi 409 rơi về một câu chung chung.

Sau lời gọi đó, kiểm lại `branch_id` của đơn: phải **không đổi**.

### Bốn mã lỗi, bốn câu khác nhau

Người dùng không bao giờ đọc mã viết hoa. Bảng dưới là ánh xạ đang chạy
(`RETURN_ERROR_MESSAGES`); ca nào chạy được thì chụp lại câu tương ứng trong
cột "Kết quả" của dialog:

| mã | HTTP | câu hiện trên dialog |
| --- | --- | --- |
| `ORDER_HAS_INVOICE` | 409 | Đơn đã phát hành hoá đơn nên không trả về được. Muốn bỏ đơn thì huỷ đơn — hoá đơn sẽ được đảo theo. |
| `ORDER_NOT_HELD_BY_BRANCH` | 403 | Đơn đang thuộc chi nhánh khác. Chỉ chi nhánh đang giữ đơn mới trả về được. |
| `ORDER_NOT_DISPATCHED` | 409 | Đơn đã nằm ở pool chưa phân — có thể người khác vừa trả đơn này về trước. |
| `ORDER_NOT_DISPATCHABLE` | 409 | Đơn không còn ở trạng thái chờ xử lý nên không trả về được. |

`ORDER_NOT_HELD_BY_BRANCH` **không** dựng được bằng cách bấm nút: `/orders` đã
hard-filter theo `X-Branch-Id`, nên đơn của chi nhánh khác không bao giờ vào
lưới để mà tick, và `/orders/all` không có thanh hành động. Trên giao diện nó
chỉ nổi lên ở đúng một ca đua — đơn bị chuyển chi nhánh giữa lúc lưới tải và lúc
bấm xác nhận. Muốn thấy câu đó thì gọi thẳng API bằng token của thu ngân CN-A
trên một đơn đang thuộc CN-B; nhánh này đã có test ở T-06-01.


### Kết quả chạy thật — 2026-09-21

**Nút "Trả đơn về" và cách khoá.** Trên `/orders`, đọc từ DOM:

| ca | nút bật? | tooltip |
| --- | --- | --- |
| chưa tick dòng nào | **không** | "Chọn ít nhất một đơn để trả về" |
| tick một dòng `Chờ xử lý` | **có** | — |
| tick một dòng `Đã xử lý` (đã có `invoice_id`) | **không** | "Đơn đã phát hành hoá đơn thì không trả về được — bỏ tick đơn đó, hoặc huỷ đơn nếu khách không lấy nữa" |

Ca thứ ba là ô done-when: đơn `DTW000005` được đặt `status = PROCESSED` và
`invoice_id` khác NULL, nút khoá đúng và câu giải thích nói rõ lối đi thay thế
(huỷ đơn) thay vì chỉ báo "không được".

**Vòng DISPATCH → RETURN → DISPATCH.** Đơn `DTW000004`. Bước RETURN chạy **qua
giao diện** (tick dòng → "Trả đơn về" → nhập lý do "Hết hàng tại chi nhánh"),
hai bước dispatch chạy qua API. `sales_order_dispatch_events` sau đó:

| # | action | từ chi nhánh | tới chi nhánh | lý do |
| --- | --- | --- | --- | --- |
| 1 | `DISPATCH` | — | Main Branch | — |
| 2 | `RETURN` | Main Branch | — | **Hết hàng tại chi nhánh** |
| 3 | `DISPATCH` | — | Cà Mau | — |

**Đúng 3 dòng**, và đơn kết thúc ở Cà Mau. Sau bước 2 đơn quay về
`branch_id IS NULL` với `status` vẫn `SENT` (A-05 — không thêm trạng thái mới),
nên nó rơi lại đúng vào lưới pool của màn điều phối.

Dòng 3 có `from_branch_id` rỗng vì lúc phân lại đơn đang ở pool — đúng với
`CHK_sales_order_dispatch_events_shape` (DISPATCH bắt buộc `to_branch_id`,
`from_branch_id` là tuỳ chọn).

**Chưa chạy được qua giao diện:** `ORDER_NOT_HELD_BY_BRANCH`. `/orders` lọc cứng
theo `X-Branch-Id` nên không bấm tới được ca đó; nó được phủ bằng spec của
T-06-01 thay vì giả vờ bấm được.

---

## Hồi quy đường đơn MOBILE (UOW-01 DoD: "đơn mobile cũ vẫn chạy y như trước")

**Không có e2e cũ để chạy.** Ô DoD này nói "e2e cũ xanh", nhưng toàn bộ 104 file
e2e của repo không có file nào chạm `/mobile/sales-orders` ngoài hai file do
CHÍNH đợt này tạo (`partner-order`, `online-order-fulfilment`). Cùng một phát
hiện đã ghi lúc làm T-01-02. Ghi lại ở đây thay vì tick một ô ngụ ý đã chạy một
bộ không tồn tại.

Đường mobile được phủ bằng `sales-order.service.spec.ts` — **63/63 xanh** sau
mọi thay đổi của đợt này. Các ca đúng nghĩa "tạo / duyệt / huỷ":

| ca | kết quả |
| --- | --- |
| `create`: tổng do SERVER tính từ dòng | ✓ |
| `create`: giảm vượt thành tiền một dòng → 400, không ghi | ✓ |
| `create` với `isDraft` → DRAFT; update → SENT | ✓ |
| `approve`: tạo hoá đơn NHÁP trong cùng giao dịch, liên kết hai chiều, → PROCESSED | ✓ |
| `approve` khi chưa mở ca → 409 `NO_OPEN_SESSION`, đơn không đổi | ✓ |
| `approve` với điểm dự kiến: trừ đúng điểm, cùng transaction | ✓ |
| `approve` đơn không còn SENT → 409 | ✓ |
| `cancel` đơn LƯU TẠM ghi lý do → CANCELLED | ✓ |
| **`cancel` đơn của NGƯỜI KHÁC → 404** | ✓ |

Dòng cuối là dòng đáng nhìn nhất. T-07-02 nới `cancel()` từ `salespersonOf` +
`isOwn` sang `scopeOf` — vì đơn WEB có `salesperson_id = NULL` nên lối cũ 404
với **mọi** tài khoản backoffice, trái A-14. Nới rồi mà ca này **vẫn xanh**:
`scopeOf` chỉ trả `{}` cho người giữ quyền duyệt, nên tư vấn viên vẫn không huỷ
được đơn của người khác. Bảo đảm cũ không bị đánh đổi lấy bảo đảm mới.

---

## Bản đồ AC → bằng chứng (cho Definition of done của từng UoW)

Mọi dòng dưới đây trỏ tới một test đã chạy xanh hoặc một mục đã chạy thật ở
trên. Không dòng nào là "đã xem code thấy đúng".

### UOW-01 — AC-01..AC-08

| AC | bằng chứng | ở đâu |
| --- | --- | --- |
| AC-01 đơn web rơi vào pool | e2e `partner-order`: "AC-01: đối tác đặt đơn hợp lệ → 201, đơn rơi vào pool (branch_id NULL)" | `apps/api/test/e2e/partner-order.e2e-spec.ts` |
| AC-02 chỉ key có quyền mới tạo được | controller spec: 4 ca resolveChannel (kênh org khác → 403, không kênh → 403…) + e2e "key thiếu quyền partner.order.create → 403" | `partner-order-v2.controller.spec.ts`, e2e |
| AC-03 tên tỉnh/phường chốt trên đơn | DB test lúc đóng T-01-02: đổi tên `geo_wards` "Phuong X"→"Phuong Y", đơn vẫn "Phuong X"; spec `toView` "tên phường trả về là tên đã CHỐT trên đơn" | T-01-02, T-05-07 |
| AC-04 giá chốt lúc đặt | spec "selling_price đổi sau khi đơn tạo → dòng hàng không đổi giá" (đơn mới lấy giá mới, chứng minh snapshot không phải cache) | `sales-order.service.spec.ts` |
| AC-05 không áp CTKM cho đơn web | spec "CTKM toàn chuỗi đang bật vẫn KHÔNG sinh dòng giảm giá nào"; cấu trúc: `SalesOrderService` không có dependency nào tới promotion engine | `sales-order.service.spec.ts` |
| AC-06 gửi lại không đẻ đơn thứ hai | e2e "gửi lại cùng externalOrderId → 200 với đúng id cũ" **và** "hai request cùng externalOrderId chạy SONG SONG vẫn ra đúng một đơn" (200/201, một dòng DB) | e2e `partner-order` |
| AC-07 đơn pool vô hình với chi nhánh | e2e "đơn pool (branch_id NULL) vô hình với TỪNG chi nhánh qua GET /mobile/sales-orders" — hai chi nhánh, cả hai `data: []` | e2e `partner-order` |
| AC-08 khớp khách theo SĐT | spec "+84 901 234 567 và 0901234567 → CÙNG một customer" + bảng test `normalizePartnerPhone` | `sales-order.service.spec.ts` |

### UOW-02 — AC-09..AC-13 (gồm ca 403)

| AC | bằng chứng |
| --- | --- |
| AC-09 pool cấp tổ chức | `listForOrganization({unassigned:true})` spec; **chạy thật** ở mục T-02-03: lưới `/orders/dispatch` hiện đúng 3 đơn pool, loại đơn đã có chi nhánh |
| AC-10 toàn chuỗi | `listForOrganization` không lọc chi nhánh khi có `read-all`; chạy thật ở mục T-03-03 |
| AC-11 phân đơn không cần mở ca | e2e `admin-dispatch`: "phân đơn pool cho chi nhánh không mở ca POS nào vẫn → 200, trạng thái vẫn SENT" |
| AC-12 phân hai lần → 409, vết append-only | e2e "phân đơn đã có chủ lần hai → 409 ORDER_ALREADY_DISPATCHED, không sinh thêm dòng vết" + ca **song song** (một 200, một 409, đúng một dòng vết); chạy thật ở mục T-02-03 (lô 3 đơn, 1 đơn bị người khác giành → 2 xanh 1 đỏ) |
| **AC-13 ca 403** | e2e "tài khoản thiếu quyền pos.sales-order.dispatch → 403, đơn vẫn ở pool"; spec guard thật với `CASHIER_PERMISSION_KEYS`; **chạy thật** ở mục T-02-04: tài khoản thu ngân không thấy mục nav và gõ URL bị đẩy về `/`. DB: Quản lý chi nhánh giữ 16 quyền `pos.*` nhưng **0** `dispatch` — cố ý giữ lại |

### UOW-04 — AC-25, AC-27 và "hoá đơn không phí ra đúng số cũ"

- AC-25 (phí vào `amount_due`, sống qua clamp): 7/7 nơi gọi `computeAmountDue` có ca phí ≠ 0 — T-04-04, đột biến: bỏ phí → **36 test đỏ / 7 suite**.
- AC-27 (mọi nơi tính lại đều khớp helper chung): vòng "áp rồi gỡ CTKM trên hoá đơn có phí → phí y nguyên trước/giữa/sau" — T-04-04.
- AC-26: mục T-04-05 ở trên.
- **Hoá đơn không phí ra đúng số cũ từng đồng:** lúc đóng T-04-01, md5 của `(id, amount_due)` trên **5056** hoá đơn hiện có = `3f7d8bf4133239f7468a59d574e06c23` trước migration, sau `revert`, và sau `run` lại — **không đổi một đồng**. Mọi fixture cũ trong bộ test đều không có phí và không expected number nào phải sửa.

### UOW-05 — AC-16..AC-20, AC-28, AC-29

| AC | bằng chứng |
| --- | --- |
| AC-16 lưới chi nhánh thấy đơn của mình, không thấy pool | e2e `online-order-fulfilment` "AC-16 phủ định: đơn pool KHÔNG hiện trên GET /mobile/sales-orders của chi nhánh khác"; chạy thật ở mục T-05-03 |
| AC-17 công nợ COD = `amount_due` gồm phí | e2e: `invoice_debts.original_amount` **và** `remaining_amount` = **1.030.000** (không phải 1.000.000, không phải 1.060.000); T-05-02: 18 test, đột biến cộng phí lần hai → 4 test đỏ |
| AC-18 doanh thu tách theo kênh | mục T-05-05: ba nhóm `Tại cửa hàng` / `Website cong ty` / `Zalo OA` |
| AC-19 duyệt khi chưa mở ca → 409 | e2e "xử lý (approve) đơn khi chi nhánh CHƯA mở ca → 409 NO_OPEN_SESSION, đơn KHÔNG đổi trạng thái" |
| AC-20 tất toán COD | T-05-02 `collectPayment`: thu đủ 1.030.000 → PAID / remaining 0 / có `settledAt`; thu thừa một đồng bị từ chối |
| AC-28 kênh mới không cần migration | mục T-05-05: đăng ký ZALO qua CRUD, hoá đơn tạo TRƯỚC khi đăng ký vẫn nhóm đúng |
| AC-29 ẩn 8 cột, Thu hộ = tổng phải thu | mục T-05-04: lưới không rò 8 cột, Thu hộ = **1.030.000** khớp `amount_due` |

**Hoá đơn bán tại quầy (không từ đơn):** `HD-CH-POS` ở mục T-05-05 có
`sales_channel = NULL` (báo cáo hiện "Tại cửa hàng") và `shipping_fee_amount = 0`
— cột có `NOT NULL DEFAULT 0`, không đường nào của POS ghi phí.

### UOW-02 / UOW-07 — hai ràng buộc ở mức mã

- **`/mobile/sales-orders` không đổi một dòng (ADR-07):**
  `git diff --stat apps/api/src/modules/sales-order/sales-order.controller.ts` → **trống**.
  Đường đọc cấp tổ chức là controller MỚI (`admin-sales-order.controller.ts`),
  `BranchScopeGuard` cũ không bị nới.
- **Không dòng code nào sửa `invoices` của hoá đơn ĐÃ PHÁT HÀNH ngoài
  `CancelInvoiceService`:** grep mọi file đã đổi cho `manager.update(InvoiceEntity`
  / `invoiceRepo.save|update` — kết quả duy nhất ngoài `CancelInvoiceService` là
  `sales-order.service.ts:1143`, ghi lên `draft.id` — hoá đơn **nháp** vừa được
  `createDraftIn` dựng trong cùng transaction (có từ T-16-01), không phải hoá đơn
  đã phát hành.

---

## T-07-03 — Rollback bằng số (AC-23, AC-24) — **2/2 XANH (2026-09-22, sau T-07-04)**

File: `apps/api/test/e2e/online-order-cancel.e2e-spec.ts`. Chạy với
`OUTBOX_RELAY_DISABLED=1 pnpm --filter @erp/api test:e2e -- online-order-cancel.e2e-spec.ts online-order-fulfilment.e2e-spec.ts`:

```
Test Suites: 2 passed, 2 total
Tests:       5 passed, 5 total
```

(`online-order-cancel` 2/2, `online-order-fulfilment` 3/3 — cùng một fixture kho.)

### Lịch sử: 1/2 (2026-09-21) → 2/2, và hai nguyên nhân thật

Ca hạnh phúc từng đỏ ở assert cuối — tồn 99 → 100 sau huỷ. Chẩn đoán 09-21
("consumer hardcode groupId nên instance dev cướp sự kiện") **đúng nhưng chưa
đủ**. Đo lại 09-22 bằng `processed_events` của `erp_test`:

| bước | thấy gì |
| --- | --- |
| trước T-07-04 | không có dòng nào cho `*.invoice.cancelled.stock-return` — sự kiện đi sang instance dev |
| sau T-07-04 (prefix riêng `erp-e2e-<ts>`) | có dòng `erp-e2e-….invoice.cancelled.stock-return`, **nhưng tồn vẫn 99** |
| đọc consumer | `stock-return.consumer.ts` resolve vị trí nhập lại qua `resolveBranchItemLocations(..., showroomOnly)` → cần kho `is_main_storage` + vị trí `is_default` của chi nhánh. Fixture e2e tạo một kho thường + kệ SHELF → "no showroom location resolved" → bỏ qua, đánh dấu processed |

Hai sửa, hai chỗ:

1. **T-07-04** — `groupId` trong `@OnDomainEvent` là hậu tố; `EventConsumerService`
   luôn ghép `KAFKA_CONSUMER_GROUP_PREFIX`. 14 consumer bỏ tiền tố `erp-api.` (tên
   group production **không đổi**). `global-setup.ts` của e2e đặt prefix
   `erp-e2e-<ts>` → group riêng, `fromBeginning: false` → chỉ thấy sự kiện của mình.
2. **Fixture** (T-07-03, cả `online-order-fulfilment`) — kho fixture đặt
   `is_main_storage = true` (API từ chối cờ này ngoài chi nhánh chính, nhưng mọi
   chi nhánh provision đều có "Kho chính" — đặt bằng SQL như provisioning), vị trí
   đặt `is_default = true`. Hệ quả: `createDraftIn` tự gán `location_id` cho dòng
   nháp — **bỏ được `UPDATE invoice_items SET location_id` trong cả hai file e2e**,
   thay bằng assert `location_id = locationId` ngay sau approve. Cùng một sự thật
   với mục "rút lại" ở phần E2E script: approve() gán vị trí, chỉ fixture thiếu kho.

### Ca hạnh phúc — 11/11 assert

Đọc TRƯỚC → đặt đơn → phân → duyệt (vị trí đã gán) → checkout COD → huỷ đơn → đọc SAU:

| assert | giá trị đọc được |
| --- | --- |
| tồn sau checkout | 100 → **99** (consumer `stock-deduction`, poll) |
| `invoice_debts` sau checkout | `original = remaining = 1.030.000`, `open` |
| đơn sau huỷ | `CANCELLED`, có `cancel_reason` |
| hoá đơn sau huỷ | `status = cancelled`; `subtotal` / `amount_due` / `shipping_fee_amount` **không đổi** |
| điểm | `points_reversed = points_earned` (khách web không có thẻ, so trên hoá đơn — fallback ticket cho phép) |
| công nợ sau huỷ | `paid`, có `settled_at` |
| **tồn sau huỷ** | **99 → 100**, ≥ 1 bút toán `INVOICE_CANCEL` (consumer `stock-return`, poll) |

### Ca bị chặn — 9/9, có assert tồn không đổi

Hoá đơn RETURN đã tất toán trỏ về hoá đơn gốc → huỷ đơn bị từ chối ("phiếu đổi
trả"); đọc lại tồn: bằng đúng số ngay sau checkout; đơn và hoá đơn không đổi.

A-26: file này không tạo ràng buộc DB nào — mọi assert là số học đảo chiều,
không phải DB từ chối. Ghi rõ ở header của file.

---

## Bằng chứng ẢNH — đã bán được hàng từ đơn hàng (2026-09-22)

`evidence/screenshots/sales-flow/` — 13 ảnh + `summary.json` + `last-run.log`
(**33 PASS · 0 FAIL**), sinh bởi `evidence/scripts/e2e/ui_sales_evidence.py`. Mỗi
ảnh được assert bằng DOM là có đúng mã hoá đơn / phiếu thu / số tiền của lần chạy.

Điểm khác với hai script số: **đơn B được thu tiền trên màn hình pos-web thật** —
"HĐ lưu tạm" hiện nháp do duyệt đơn dựng ra (ảnh 08), giỏ khôi phục giữ nguyên
giảm 70.000 (ảnh 09 — chính là T-05-08 đang chạy), bấm **Thu tiền (F9)** → hoá đơn
`paid` 1.700.000 **cùng id** với nháp, `sales_orders.invoice_id` không đổi (ảnh 10).
Đơn C (web) thu qua `/mobile/cashier/drafts/:id/checkout`. Sau đó: hai phiếu thu
POS_SALE đã ghi sổ 2.910.000 (ảnh 03), tồn 100 → 95 trên báo cáo nhập-xuất-tồn
(ảnh 06 — tồn được đưa về 100 bằng phiếu điều chỉnh thật nên sổ khớp số dư), thẻ
khách +170 (ảnh 07), báo cáo ngày pos-web thu tiền mặt 2.910.000 (ảnh 13).

Phát hiện có sẵn, nhìn thấy ở ảnh 05: **Bảng kê hoá đơn trừ giảm dòng hai lần**
(`invoice-listing.aggregator.ts`: `total = subtotal − discountAmount − points`, với
`subtotal` đã trừ giảm dòng và `discountAmount` = Σ `line_discount`) → hoá đơn
1.700.000 hiện Tổng 1.630.000. Không do feature (T-05-05 chỉ thêm cột Kênh bán);
chưa sửa — cần một ticket của module báo cáo.

## T-01-08 — Dòng đơn đối tác nhận `itemCode` (2026-09-22)

Yêu cầu của Akenzy khi đọc `docs/partner-order-api.md`. `PartnerOrderLineDto` giờ là
`{ itemCode, quantity }`; `partnerLines()` tra `items` theo `code IN (…)` + tổ chức,
so khớp đúng từng ký tự (như Partner Catalog API); mã lạ → `ORDER_LINE_ITEM_UNKNOWN`
nêu **mã**; gửi `itemId` → 400 field lạ. Response giữ cả `itemId` lẫn `itemCode`.

| bằng chứng | kết quả |
| --- | --- |
| `sales-order.service.spec.ts` (+2 ca: mã lạ nêu mã; so khớp đúng ký tự + bỏ khoảng trắng) | 66/66 |
| Toàn bộ unit suite | 422 suites / 6005 tests xanh |
| e2e `partner-order` (+1 ca: mã lạ 400 kèm mã, `itemId` 400, không đơn) + `admin-dispatch` + `online-order-fulfilment` + `online-order-cancel` | 4 suites / 15 tests xanh |
| `run_flow.py` (+2 probe T-01-08) · `run_sales_flow.py` · `ui_sales_evidence.py` | 53/0 · 110/0 · 33/0 |
| OpenAPI | snapshot + `schema.ts` sinh lại từ instance :4188 (không phải :4000 — đó là erp3), `PartnerOrderLineDto.itemCode` |

## Toàn bộ Jest e2e (105 suite) — chạy 2026-09-22 sau T-07-04, đọc kết quả có phân loại

Chạy `OUTBOX_RELAY_DISABLED=1 pnpm --filter @erp/api test:e2e` (tuần tự, ~2,5 giờ).
Kết quả cuối ghi ở cuối mục này. Những suite đỏ nhìn thấy trong lúc chạy và
**nguồn gốc của từng cái** — kiểm bằng `git status`/`git show HEAD:` chứ không
bằng cảm giác:

| suite | triệu chứng | nguồn gốc |
| --- | --- | --- |
| `checkout-saga` (3 ca) | mong 5/19 bước, nhận 6/20 — thừa `clamp-points` | **Có sẵn ở HEAD**: `checkout-saga.controller.ts` (không sửa) đã nối `ClampPointsStep`, spec (không sửa) vẫn đếm 5/19. Ca AC-07 lệch thêm `cash_movements`/`journal_entries` +1 là **nhiễu chéo** — xem T-07-04, giới hạn còn lại. |
| `product-variants` | không biên dịch: `import * as request from 'supertest'` không gọi được | **Có sẵn ở HEAD**, file không sửa. |
| `mobile` | suite không chạy: `seed.branchId` đọc ở tầm `describe` (chưa có `beforeAll`) | **Có sẵn ở HEAD**, file không sửa. |
| `deposit-recon-lock` UAT-10 (2 ca) | checkout thẻ → 400 "Tài khoản thanh toán chưa liên kết quỹ tiền gửi" | **Không do feature**: spec, fixture, `account-resolver.service.ts` đều không sửa; diff của feature ở `checkout-invoice.service.ts` chỉ là phí/điểm (6 dòng). |
| `voucher-print-payload` | fixture `transfer_order_lines.line_no` | **Có sẵn** (đã ghi từ 09-21). |

Suite của feature này: `partner-order`, `admin-dispatch`, `online-order-fulfilment`,
`online-order-cancel` — xanh (mục T-07-03 và các mục UoW ở trên).

**Kết quả cuối:** _(đang chạy — điền khi xong)_

## Bộ E2E chạy lại được — `evidence/scripts/e2e/` (2026-09-22)

Toàn bộ luồng của feature dưới dạng **một script Python đánh vào stack local
thật** + SQL fixtures idempotent + teardown. Không phải Jest; đây là bộ để một
người khác bấm một lệnh và nhìn thấy 49 assert xanh bằng số đọc từ DB.

| | |
| --- | --- |
| Lần chạy gần nhất | **50 PASS · 0 FAIL · 2 NOTE**, exit 0 — `evidence/scripts/e2e/last-run.log` |
| Phủ | AC-01, 04, 06, 07, 08, 09, 11, 12, 16, 17, 19, 21, 22, 23, 24; A-05, A-24; ADR-03, 04, 06; T-05-01, T-05-07 |
| Cách chạy | `evidence/scripts/e2e/README.md` |

Bộ này xanh cả bước hoàn tồn 98 → 100 ngay từ 09-21 (script đánh vào dev API
ghi cùng DB, và DB dev có kho/kệ seed). Jest e2e chỉ xanh bước đó sau T-07-04 +
sửa fixture kho — xem mục T-07-03 ở trên cho hai nguyên nhân.

Ba phát hiện khi dựng bộ này, ghi trong README: `createFromPartner` chết 500
khi mã khách trùng (counter numbering lệch seed); consumer hardcode groupId
(đã sửa — T-07-04); và một phát hiện **đã rút lại** — "approve() không gán `location_id`"
là lỗi fixture của DB Jest e2e (không seed kho), không phải của approve():
`createDraftIn` resolve kệ showroom, cả hai script assert `location_id` có ngay
sau duyệt trên DB dev.

### Nửa còn lại — bán hàng TỪ đơn hàng, `run_sales_flow.py` (2026-09-22)

Người dùng chỉ ra đúng chỗ hổng: `run_flow.py` chỉ đi đường COD-rồi-huỷ, chưa
có tiền vào quỹ. `run_sales_flow.py` đi nốt phần đó, **theo đúng các lời gọi mà
pos-web thực hiện** khi thu ngân mở "HĐ lưu tạm" rồi bấm Thanh toán
(`POST /v2/invoices/drafts/search` → `PATCH /invoices/:id` → `POST …/checkout`),
không gán gì bằng SQL.

| | |
| --- | --- |
| Lần chạy gần nhất | **110 PASS · 0 FAIL · 5 NOTE**, exit 0 — `evidence/scripts/e2e/last-run.log` (cùng file, sau `run_flow.py` 51/0; teardown 0 dòng sót, quỹ về số cũ) |
| Đường đi | B1 đơn tư vấn viên có giảm tay + KM → lưu tạm → gửi → duyệt → POS nhận nháp → tiền mặt đủ → paid, tồn −3, thẻ +170, phiếu thu POS_SALE, quỹ +1.700.000 · B2 dùng điểm: đòi quá → 400 + rollback sạch; sửa điểm → duyệt → checkout → thẻ = cũ − dùng + tích · B3 dùng điểm hai lần → chốt chặn ở checkout · C đơn web trả một phần → `partial_debt` → thu vượt 400 → thu đủ qua `/cash-receipts/debt-collection` → công nợ paid, hoá đơn paid, quỹ đủ · E PATCH y như pos-web giữ giảm giá · D từ chối |
| Phủ thêm | AC-16 (đơn tư vấn viên: DRAFT/SENT, lưới), AC-17 (hoá đơn nháp đúng tổng — nay cả sau PATCH của POS), AC-19, AC-20; UOW-05 DoD "đơn mobile chạy y như trước" bằng số thật |

**Phát hiện và sửa — T-05-08.** Mục E đo được khách bị tính **dư 70.000**: approve()
ghi giảm dòng chỉ bằng số tiền (`lineDiscount`), pos-web chỉ round-trip
`lineDiscountType/Value`, PATCH tính lại giá gốc. Sửa ở approve(): ghi
`type=amount, value=manual+promo` (một chỗ, mọi client đọc cùng dạng). Spec
`sales-order.service.spec.ts` assert dạng mới (63/63); toàn bộ unit suite
**422 suites / 6003 tests xanh**; mục E xanh sau khi build lại dist.

Ba mô hình đã hiểu sai lúc viết assert lần đầu, ghi lại để người sau không vấp:
`invoices.subtotal` là Σ dòng **đã trừ giảm dòng** (giảm của đơn đi xuống
`invoice_items.line_discount`, `discount_amount` là giảm đầu phiếu);
`invoice_debts.original_amount` là **phần chưa trả** lúc checkout, không phải
`amount_due`; duyệt **không trừ thẻ** — chỉ giữ chỗ trên nháp, thẻ đổi lúc checkout
qua consumer (net = tích − dùng).
