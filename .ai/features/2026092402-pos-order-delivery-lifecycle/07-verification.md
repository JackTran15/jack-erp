---
feature: pos-order-delivery-lifecycle
environments: [local-pos]
viewports: [desktop]
run_by: Claude (phiên 2026-09-24/25), headless qua `capture-pos-evidence.py` + `seed-demo.py`
database: erp_dev_3008 (API :4000 từ checkout erp2, POS :3001, backoffice :3000)
---

# Kiểm chứng — Đơn hàng + Đơn hàng Online trên POS

## Cách chạy

```
B=20000000-0000-4000-8000-000000000001   # Main Branch (đang có ca ACTIVE_SALES)
PY=~/.venvs/aidlc-verify/bin/python; S=.ai/features/2026092402-pos-order-delivery-lifecycle
$PY $S/capture-pos-evidence.py --online                       # UOW-01 (chi nhánh LOCAL_POS_BRANCH_ID)
STOCK_ORDER=DEMO0924-R ORDER_DAY=2026-09-24 $PY $S/capture-pos-evidence.py --stockshort  # UOW-01 AC-05; đặt/gỡ stock_short bằng SQL trước/sau
ORDER_DAY=2026-09-24 POS_BRANCH_ID=$B $PY $S/capture-pos-evidence.py --process      # UOW-02, GHI DB
$PY $S/capture-pos-evidence.py --partners                     # UOW-03
POS_BRANCH_ID=$B $PY $S/capture-pos-evidence.py --orders      # UOW-04
POS_BRANCH_ID=$B $PY $S/capture-pos-evidence.py --opendraft   # UOW-04
POS_BRANCH_ID=$B PAID_ORDER=… DRAFT_ORDER=… $PY $S/capture-pos-evidence.py --deliver  # UOW-05, GHI DB
```

Mọi bước assert trên DOM và/hoặc đối chiếu API; ảnh sai vẫn exit 1. Dữ liệu ghi
(Akenzy cho phép 2026-09-25 "Mở ca + thanh toán trên local"): 2 đơn web của Main
Branch được nhận xử lý, thanh toán tiền mặt, một đơn giao → Thất bại → Chuyển hoàn
(hoá đơn huỷ), một đơn giao → Hoàn thành; tạo đối tác `GHN — Giao Hàng Nhanh`.

Ảnh ở `evidence/local-pos/desktop/` và `evidence/local-backoffice/desktop/`
(gitignored). Unit spec: `pnpm --filter @erp/api test` — 444/444 suites, 6400 pass
(2026-09-25).

## Steps

Luồng end-to-end chạy bằng `aidlc-verify <feature> --write`, chỉ đọc: mỗi bước dừng ở
một trạng thái vòng đời mà các lần `capture-pos-evidence.py` (ghi DB) đã để lại trên
`erp_dev_3008`. Đăng nhập vào `${LOCAL_POS_BRANCH_ID}` (Cần Thơ, đơn SENT); S4 đổi sang
Main Branch qua ô chọn chi nhánh ở header — các bước sau dùng chung trang nên giữ chi nhánh.

Hai ràng buộc của bộ chạy: `fill` tách selector ở dấu `=` đầu tiên nên ô ngày/ô lọc OCM
dùng vị trí (`:nth-match(input, 1)`, `:nth-match(thead input, 2)`); lưới giữ dữ liệu cũ khi
đổi tab (`keepPreviousData`) nên mỗi bước tab chờ đúng tổng "1-N/N kết quả" trước khi assert.
Phiên POS: runner (ruleset 7) không điền ô Mã tổ chức, nên `.ai/.auth/local-pos.json` được
tạo trước mỗi lần chạy bằng `login()` của `capture-pos-evidence.py` (refresh token dùng một lần).

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Đơn hàng online: sidebar chỉ kênh active, đủ cột, mặc định Chưa xử lý | `/pos/online-orders` | — | AC-01, AC-02, AC-03 | `text=Website công ty; text=Zalo OA; text=Mã đơn hàng (OCM); text=Thông tin giao hàng; text=Nhãn; text=Chưa xử lý; text=Nhận xử lý` |
| S2 | Ngày 24/09 ở Cần Thơ: chỉ đơn của chi nhánh này | `/pos/online-orders` | `fill :nth-match(input, 1) = 2026-09-24; wait text=1-5/5 kết quả` | AC-02, AC-03 | `text=DEMO0924-Q; text=E2E0924-134015-O5; no-text=DEMO0924-Y; no-text=DEMO0924B-U1; text=1-5/5 kết quả` |
| S3 | Lọc cột Mã đơn hàng (OCM) thu còn một dòng | `/pos/online-orders` | `fill :nth-match(input, 1) = 2026-09-24; fill :nth-match(thead input, 2) = 0924-R; wait text=1-1/1 kết quả` | AC-04 | `count tbody tr = 1; text=DEMO0924-R` |
| S4 | Đổi sang Main Branch → lưới Đơn hàng chỉ đơn Main Branch, đủ 10 tab | `/pos/orders` | `click [aria-label="Chi nhánh"]; click [role="option"]:has-text("Main Branch"); wait [aria-label="Chi nhánh"]:has-text("Main Branch")` | AC-12, AC-15, AC-16 | `text=E2E0924-132919-O1; no-text=DEMO0924-R; count [role="tab"] = 10; text=Mã vận đơn; text=Phí GH trả ĐT` |
| S5 | Nút ngoài phạm vi bị khoá | `/pos/orders` | — | AC-17 | `count button:disabled:text-is("Gửi đơn hàng") = 1; count button:disabled:text-is("Thu COD") = 1; count button:disabled:text-is("Gắn nhãn") = 1; count button:disabled:text-is("In phiếu GH") = 1` |
| S6 | Tab Chờ giao/lấy hàng: đơn đã nhận xử lý, chưa giao | `/pos/orders` | `click [role="tab"]:text-is("Chờ giao/lấy hàng"); wait text=1-5/5 kết quả` | AC-06, AC-12 | `text=E2E0924-132919-O2; text=E2E-150307-UI; no-text=E2E0924-132919-O1; no-text=E2E0924-134015-O1` |
| S7 | Hộp Giao hàng: chọn được đối tác active (không bấm Lưu) | `/pos/orders` | `click tbody tr:has-text("E2E-150307-UI") label:has(input[type="checkbox"]); click button:text-is("Giao hàng"); click [aria-label="ĐT giao hàng"]; click [role="option"]:has-text("Giao Hàng Nhanh")` | AC-11, AC-18 | `count [aria-label="ĐT giao hàng"]:has-text("Giao Hàng Nhanh") = 1; text=1 đơn:; text=Mã vận đơn; text=Phí GH trả ĐT` |
| S8 | Tab Chưa thanh toán/Lưu tạm: hoá đơn nháp, không có đơn đã trả | `/pos/orders` | `click [role="tab"]:text-is("Chưa thanh toán/Lưu tạm"); wait text=1-3/3 kết quả` | AC-13 | `text=E2E0924-132919-O2; text=HIS0924-140721-H1; no-text=E2E-150307-UI` |
| S9 | Tab Đã thanh toán: ngược lại | `/pos/orders` | `click [role="tab"]:text-is("Đã thanh toán"); wait text=1-3/3 kết quả` | AC-13 | `text=E2E-150307-UI; no-text=HIS0924-140721-H1` |
| S10 | Tab Đã chuyển hoàn: đơn giao thất bại, GHN / VD123 | `/pos/orders` | `click [role="tab"]:text-is("Đã chuyển hoàn"); wait text=1-1/1 kết quả` | AC-15, AC-21 | `count tbody tr = 1; text=E2E0924-134015-O1; text=VD123; text=Giao Hàng Nhanh` |
| S11 | Tab Hoàn thành: đơn giao xong | `/pos/orders` | `click [role="tab"]:text-is("Hoàn thành"); wait text=1-1/1 kết quả` | AC-22 | `count tbody tr = 1; text=E2E0924-132919-O1` |

## Not verified here

AC-07, AC-08, AC-09, AC-19, AC-20 ghi DB hoặc cần tick + bấm lỗi từng đơn — chụp bằng
`capture-pos-evidence.py --process/--deliver` (bảng dưới). AC-10 là trang backoffice
(`--partners`); AC-14, AC-26, AC-28 chỉ spec/e2e; AC-27 (lịch sử) chụp trong `--deliver`.
AC-05 cần đặt tạm `stock_short` — `--stockshort`.

## Bằng chứng theo AC

| AC | Bằng chứng | Kết quả |
|---|---|---|
| AC-01 | `--online`: sidebar = kênh active (Website công ty, Zalo OA); `mobile-sales-channel.controller.spec` loại kênh inactive/tổ chức khác | ✅ |
| AC-02 | `--online`: 10 cột, lưới 5 đơn; `search-branch-sales-orders.handler.spec` (khác kênh/chi nhánh/DRAFT bị loại) | ✅ |
| AC-03 | handler spec: trạng thái, "Hôm nay" theo giờ VN (biên 23:30/00:30), DRAFT luôn loại; `--online` mặc định "Chưa xử lý" | ✅ |
| AC-04 | handler spec: toán tử `*`, `≤`, tổng phân trang | ✅ (UI gõ lọc chưa chụp) |
| AC-05 | handler spec: lọc + trả `stockShort`; `--stockshort` (2026-09-27): đặt tạm `stock_short=true` cho DEMO0924-R (chi nhánh Cần Thơ) → đúng dòng đó hiện "Thiếu hàng", không dòng nào khác; đã gỡ cờ sau khi chụp | ✅ `AC-05-stock-short.png` |
| AC-06 | `--process`: 2 đơn → PROCESSED, AWAITING_PICKUP, hoá đơn nháp, phí GH 30.000; service spec (event CONFIRM + PROCESS) | ✅ |
| AC-07 | `--process`: toast "1/2 đơn đã nhận xử lý — E2E0924-132919-O1: Đơn không còn ở trạng thái chưa xử lý" | ✅ `AC-07-process-toast.png` |
| AC-08 | `--process` (chi nhánh không ca): toast "0/1 … Chi nhánh chưa mở ca", đơn giữ nguyên | ✅ `AC-06-process-toast.png` |
| AC-09 | `--process`: nút disabled khi chưa tick, bật khi tick đơn SENT | ✅ `AC-09-ticked.png` |
| AC-10 | `--partners`: mục sidebar + trang CRUD; `delivery-partner-crud.service.spec` (trùng mã 409); tạo GHN qua API 201 | ✅ `AC-10-delivery-partners.png` |
| AC-11 | spec controller: chỉ đối tác active; dialog Giao hàng liệt kê GHN | ✅ |
| AC-12 | `--orders`: 10 tab, tổng UI = tổng API từng tab | ✅ `AC-12-tab-*.png` |
| AC-13 | `--orders`: Đã thanh toán 2 + Chưa thanh toán 5 = Tất cả 7; `--opendraft`: dòng nháp mở vào tab checkout | ✅ `AC-13-open-draft.png` |
| AC-14 | handler spec: Ngày GH / 7 ngày gần đây theo giờ VN, nhãn | ✅ (UI đổi loại ngày chưa chụp) |
| AC-15 | `--orders`: 24 cột; `--deliver`: lưới hiện GHN / VD123 / 20.000 | ✅ `AC-18-in-transit.png` |
| AC-16 | handler spec: predicate org + chi nhánh ở mọi tab | ✅ |
| AC-17 | `--orders`: 5 nút ngoài phạm vi disabled | ✅ |
| AC-18 | `--deliver`: GHN, VD123, 20.000, "2kg", Ngày GH set; đơn thứ hai bỏ trống → partner/phí NULL | ✅ `AC-18-deliver-dialog.png` |
| AC-19 | `--deliver`: hoá đơn nháp → "0/1 … Hoá đơn chưa hoàn tất", đơn giữ AWAITING_PICKUP | ✅ `AC-19-not-finalized.png` |
| AC-20 | `--deliver`: menu chỉ Chờ thu COD / Thất bại / Hoàn thành; service spec chuyển sai → 409 | ✅ |
| AC-21 | `--deliver`: Thất bại → Đã chuyển hoàn, Lưu khoá tới khi xác nhận, đơn CANCELLED + RETURNED, hoá đơn `cancelled` | ✅ `AC-21-*.png` — đảo tồn chạy async qua `invoice.cancelled`, không đối chiếu sổ kho ở đây |
| AC-22 | `--deliver`: đơn hết nợ → Hoàn thành; service spec DEBT_OUTSTANDING | ✅ `AC-22-completed.png` |
| AC-26 | service spec: metadata `pos.sales-order.deliver` + PermissionGuard thật từ chối 403 | ✅ chỉ spec (UI ẩn nút chưa chụp với user thiếu quyền) |
| AC-27 | `--deliver`: lịch sử = Nhận đơn → Phân đơn → Chi nhánh duyệt → Thu ngân xử lý → Giao hàng → "Cập nhật giao hàng: Đang giao hàng → Hoàn thành" | ✅ |
| AC-28 | service spec (3 case) + e2e `online-order-fulfilment` 3/3 | ✅ |

## Phát hiện ngoài phạm vi

- **Màn Thu tiền POS bỏ qua phí GH trên hoá đơn nháp** (có từ feature
  2026092001): mở hoá đơn nháp của đơn web → "Tổng tiền"/"Còn phải thu" = 590.000
  (chỉ tiền hàng) nhưng ô Tiền mặt điền sẵn 620.000 (`amount_due` gồm 30.000 phí)
  → màn báo "Trả lại khách 30.000". Server tính đúng 620.000. Xem `AC-13-open-draft.png`.
