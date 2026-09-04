---
id: UOW-02
slug: counterparty-filter-500
title: Lọc được cột "Đối tượng" trên Nhập kho, Xuất kho, Chuyển kho
demoable: true
duration: 1d
depends_on: []
requirements: [US-02]
verifies: [AC-06, AC-07, AC-08, AC-09, AC-10]
risk: low
status: done
rollback: revert code — một dòng SQL, không schema, không dữ liệu
---

# UOW-02 — Hết 500 ở bộ lọc "Đối tượng"

`counterparty-name.util.ts:40-41` so `users.organization_id` (**uuid**) với
`goods_receipts.organization_id` (**varchar**) mà không ép kiểu. Các nhánh `CASE` bị kiểm kiểu lúc
lập kế hoạch, nên câu lệnh chết trước khi đọc dòng nào — mọi ký tự gõ vào đều 500, kể cả khi không
hồ sơ nào có `counterparty_kind = 'employee'`.

Hàm dùng chung, nên **ba** màn hình hỏng y hệt (**A-04**): Nhập kho, Xuất kho, Chuyển kho, cộng một
chỗ thứ tư độc lập trong `TRANSPORTER_NAME_SUBQUERY`.

Lỗi lọt lưới vì cả hai spec hiện có đều mock QueryBuilder và chỉ assert `stringContaining` — lỗi
kiểu SQL vô hình với chúng. Vì thế UOW này bắt đầu bằng test chạm Postgres thật.

## Demo script

1. Mở "Nhập kho", gõ một ký tự vào bộ lọc cột "Đối tượng" → lưới lọc, không toast lỗi (AC-06).
2. Mở "Xuất kho", làm y hệt → 200 (AC-07).
3. Mở "Chuyển kho", gõ vào cột "Đối tượng" và cột người vận chuyển → 200 (AC-08).
4. Tìm một phiếu có đối tượng là nhân viên, gõ một phần tên → phiếu đó nằm trong kết quả, cột
   "Đối tượng" hiện đúng họ tên ghép (AC-09).

## In scope

- Ép kiểu trong `counterpartyNameSql` (ADR-04) và trong `TRANSPORTER_NAME_SUBQUERY`.
- Một e2e chạm Postgres thật phủ cả ba loại chứng từ.

## Not in scope

- Migration chuẩn hoá `organization_id` toàn schema — gốc thật, nhưng đụng mọi bảng ERP.
- Đổi DTO hay whitelist bộ lọc: đã bác bỏ ở **A-12**, trường vốn hợp lệ.
- Viết lại hai spec mock hiện có; chúng vẫn có giá trị ở tầng của chúng.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| `::text` làm mất index trên `users.organization_id` | Truy vấn con tương quan theo `u.id` (khoá chính); ADR-04 đã cân nhắc. Đo nếu lưới chậm đi. |
| Còn chỗ thứ năm dùng cùng mẫu mà chưa tìm ra | T-02-03 quét lại toàn repo tìm `organization_id` so sánh giữa `users` và bảng ERP |

## Definition of done

- [x] AC-06…AC-10 pass
- [x] E2E chạm Postgres thật đỏ trên mã chưa sửa, xanh sau khi sửa
- [x] Cả 4 chỗ dùng đều được sửa (**A-04**)
- [x] Comment tại chỗ sửa nêu rõ lý do ép kiểu, theo tiền lệ `search-deposit-recon-v2.handler.ts:148-155`
- [x] Demoed và accepted at gate G4 — **trên hồ sơ bằng chứng**, xem mục dưới

## Cơ sở chấp nhận G4 (Akenzy uỷ quyền 03/09/2026)

G4 được chấp nhận trên **hồ sơ bằng chứng**, không phải một buổi demo trực tiếp.

- E2E `goods-doc-party-filter.e2e-spec.ts` chạm Postgres thật: **đỏ 6/6** trên mã chưa sửa với
  nguyên văn `QueryFailedError: operator does not exist: uuid = character varying`, **xanh 6/6**
  sau khi sửa. Bằng chứng này mạnh hơn ảnh chụp cho một lỗi kiểu SQL.
- Phủ cả ba endpoint (Nhập kho / Xuất kho / Chuyển kho) cộng bộ lọc người vận chuyển, với fixture
  `counterparty_kind = 'employee'` — đúng nhánh CASE gây lỗi.
- Quét toàn repo tìm chỗ thứ năm: **không có**, kết quả âm tính đã ghi vào T-02-03.

**Chưa được chứng minh bằng mắt trên UI**: bước chụp màn hình đã bị gỡ vì ô lọc free-text không có
`aria-label` (`BaseDataTable.tsx:570-576`), chỉ chọn được bằng vị trí cột — selector như vậy sẽ đỏ
vì lý do không liên quan ngay lần đầu ai đó đổi thứ tự cột.
