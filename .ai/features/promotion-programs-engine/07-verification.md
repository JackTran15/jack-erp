---
feature: promotion-programs-engine
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Chương trình khuyến mại (Backoffice)

Slice under test: **Giảm giá hoá đơn** (`INVOICE_DISCOUNT`) — the catalogue screen and the
create/edit form for that one promotion type. The other four types are exercised by
`promotion-resolver.spec.ts` and are not re-screenshotted here.

Fixtures assumed present (created via `POST /v2/promotions`, see `## Notes`):
`TEST GG Hóa đơn 10% chưa KM` and `TEST GG Hàng hóa 20% VI580`.

## Steps

| ID | Step | Path | Interaction | Verifies |
|---|---|---|---|---|
| S1 | Danh sách CTKM mở ra không bị lọc theo trạng thái, hai CTKM fixture đều hiện | `/promotions/programs` | — | AC-10 |
| S2 | Form Thêm mới hình thức Giảm giá hóa đơn hiện phạm vi + mức giảm | `/promotions/programs/new?type=INVOICE_DISCOUNT` | — | AC-27 |
| S3 | Danh sách CTKM lọc được theo hình thức Giảm giá hóa đơn | `/promotions/programs` | `scroll table` | AC-23 |
| S4 | Tab Điều kiện áp dụng giữ nguyên "Tự động áp dụng" người dùng đã chọn | `/promotions/programs/new?type=INVOICE_DISCOUNT` | `click text=Điều kiện áp dụng` | AC-11 |
| S5 | Danh sách thẻ voucher mở được và hiện đủ cột | `/promotions/vouchers` | — | AC-24 |
| S6 | Form Giảm giá hóa đơn: chọn "Nhóm khách hàng" mở multi-select nhóm | `/promotions/programs/new?type=INVOICE_DISCOUNT` | `click text=Tất cả khách hàng` | AC-21 |

## Not verified here

- **Sổ quỹ tiền mặt (`/treasury/cash/ledger`) — không chụp được, đã thử 2 lần.** Backoffice
  đăng nhập vào **Chi nhánh kiểm thử** (khác POS, `verify:` không có chỗ ghim chi nhánh cho
  môi trường BO), còn dữ liệu thử nằm ở **HCM**; thêm bước bấm đổi chi nhánh cũng không đổi
  được, và màn hình đứng ở "Đang tải…" với tổng 0. Bước vẫn *pass* vì `wait` khớp nhãn tĩnh
  "Số dư cuối kỳ" ở chân trang — đúng kiểu bằng chứng giả mà gói này sinh ra để chặn, nên đã
  **gỡ bỏ** thay vì giữ lại.
  Số liệu sổ quỹ đã được đối chiếu ở tầng API thay cho ảnh, qua
  `POST /v2/cash-ledger/search` ngày 13/08/2026:
  `đầu kỳ 21.000.000 + thu 6.497.000 − chi 3.970.000 = cuối kỳ 23.527.000` — **khớp tuyệt đối**
  với `cash_movements`.

- **AC-02** — chặn lưu khi bỏ trống Tên chương trình. Đây là **đường đi âm**: bằng chứng đúng
  của nó *là* một toast lỗi, mà `failure_signals` trong `.ai/aidlc.yaml` lại coi mọi toast lỗi
  là bước hỏng — runner không có khái niệm "mong đợi tín hiệu lỗi này". Đã xác minh trực tiếp
  ở tầng API thay vì bằng ảnh: `POST /v2/promotions` thiếu `name` trả **400**
  `["name should not be empty", "name must be a string"]`. Ảnh S2 cho thấy dấu `*` bắt buộc
  trên trường này.
- **AC-15, AC-17, AC-18, AC-19, AC-20** — round-trip của cả 5 hình thức, nhân bản, xoá mềm,
  cách ly tổ chức và idempotency: đã có `promotion-resolver.spec.ts` +
  `apps/api/test/e2e/promotion-evaluate-pos.e2e-spec.ts` phủ. Chụp màn hình không chứng minh
  thêm được gì cho các mục này.
- **AC-01, AC-03…AC-09, AC-12, AC-13, AC-22, AC-25, AC-26, AC-29** — thuộc engine tính toán,
  không có bề mặt UI. Đã đối chiếu bằng số thật qua `POST /v2/promotions/evaluate`
  (xem `## Notes`), không phải bằng ảnh chụp.
- **AC-16** — khoá đổi hình thức khi Sửa: cần một CTKM đã lưu và một thao tác nhiều bước;
  để lại cho lần mở rộng sau, `PROMOTION_TYPE_IMMUTABLE` hiện đã có unit test.
- **AC-21, AC-23, AC-28, AC-30, AC-31, AC-32** — ngoài lát cắt "Giảm giá hoá đơn".

## Notes

- Chạy bằng tài khoản `admin@erp.local` (vai trò Quản trị hệ thống). Vai trò này **phải** có
  `promotion.read` / `promotion.write`; sau khi rebase nhánh này lên `main` cần chạy
  `pnpm seed:sync-admin-permissions` một lần, nếu không menu Khuyến mãi 403.
- Số học của lát cắt đã được chốt bằng `POST /v2/promotions/evaluate` với giỏ
  `DD850` (850.000, chưa KM) + `VI580` (580.000, đang giảm 20%):

  | Phạm vi CTKM hoá đơn | Tiền giảm hoá đơn | Tổng giảm | Còn phải thu |
  | --- | ---: | ---: | ---: |
  | `NON_PROMO_ONLY` | 85.000 (10% của 850.000) | 201.000 | 1.229.000 |
  | `ALL_ITEMS` | 143.000 (10% của 1.430.000) | 259.000 | 1.171.000 |

  Cơ sở tính là **giá gộp** (`quantity × unitPrice`), không trừ khuyến mại dòng đã áp —
  xem `discount-math.ts:lineTotal`.
