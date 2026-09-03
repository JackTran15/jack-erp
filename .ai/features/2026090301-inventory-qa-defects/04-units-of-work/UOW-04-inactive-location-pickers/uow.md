---
id: UOW-04
slug: inactive-location-pickers
title: Vị trí đã ngừng biến mất khỏi mọi ô chọn và mọi auto-fill
demoable: true
duration: 2d
depends_on: [UOW-03]
requirements: [US-04]
verifies: [AC-16, AC-17, AC-18, AC-19, AC-20, AC-21, AC-22, AC-23]
risk: high
status: done
rollback: revert code — bộ lọc mới là tuỳ chọn, caller cũ không đổi hành vi; không schema, không dữ liệu
---

# UOW-04 — Chỉ chào vị trí dùng được

Lát rủi ro nhất, vì nó dễ **ẩn nhầm**. Hai cột khác nhau mang hai nghĩa khác nhau (xem
`03-logical-design.md`, mục Domain model): `locations.is_active` là cả cái kệ bị vô hiệu hoá;
`stock_balances.is_tracked` là riêng cặp (mặt hàng × kệ) bị dừng. Lỗi QA chụp được (E03.01) là cột
**thứ hai** — E03.01 vẫn `is_active = true`. **A-02**: siết cả hai, ở mọi ô chọn và mọi auto-fill.

Hai lỗi độc lập cùng cho ra một triệu chứng:

- *Dropdown* chào cả hai kệ, vì `getBalances` không lọc `loc.is_active` và chỉ lọc `is_tracked` khi
  caller yêu cầu — mà picker In tem mã không yêu cầu (`item-stock-locations.ts:52-57`).
- *Auto-fill* chọn E03.01, vì nhánh (a) của bộ giải vị trí đọc con trỏ `item_storage_locations` cũ
  mà không kiểm `is_tracked` (`resolve-item-locations.handler.ts:102-115`), nên nhánh (b) — vốn sẽ
  chọn A07.02 theo tồn cao nhất — không bao giờ chạy tới.

Ranh giới quan trọng nhất của lát này là những chỗ **phải giữ nguyên**: trang quản trị phải còn
thấy vị trí đã ngừng để bật lại được, và Chuyển kho tạm trên POS cố ý cần thấy chúng để dọn hàng.

## Demo script

1. Mở In tem mã, thêm `MY535-28-D-35` → ô "Vị trí" tự điền **A07.02**, không phải E03.01 (AC-18).
2. Mở dropdown "Vị trí" của dòng đó → chỉ có A07.02; E03.01 biến mất (AC-16).
3. Đặt một vị trí khác sang "Ngưng hoạt động" ở trang Vị trí hàng hóa, quay lại → nó cũng biến mất
   khỏi dropdown (AC-17).
4. Lấy một mặt hàng đã gán kệ nhưng chưa từng nhận hàng → vẫn tự điền đúng kệ đã gán (AC-19).
5. Mở một form CRUD chung có trường vị trí, gõ tìm → chỉ vị trí đang hoạt động (AC-20).
6. Thêm mặt hàng vào phiếu kiểm kê → không tự điền kệ đã ngừng (AC-21).
7. Mở trang "Vị trí hàng hóa" và "Chi tiết vị trí" với bộ lọc "Tất cả" → vẫn thấy đủ (AC-22).
8. Mở POS → Chuyển kho tạm → ô chọn Vị trí vẫn thấy chi tiết đã ngừng theo dõi (AC-23).

## In scope

- Bộ lọc tuỳ chọn `locationIsActive` + trường `location.isActive` trong DTO của `getBalances` (ADR-02).
- Guard "chưa có balance HOẶC đang theo dõi" + thứ tự tất định ở nhánh (a) (ADR-03).
- Ba chỗ đọc phía frontend: picker In tem mã, `CrudFormDialog`, auto-fill Kiểm kê.

## Not in scope

- **Xoá con trỏ `item_storage_locations` khi Ngừng theo dõi, và migration dọn con trỏ cũ** (**A-05**,
  Akenzy chốt 03/09). Nợ được ghi nhận: mọi chỗ đọc viết sau này phải tự nhớ guard.
- Trang quản trị "Vị trí hàng hóa" và bộ lọc "Tất cả" ở "Chi tiết vị trí" — phải giữ nguyên.
- Ngoại lệ `includeUntracked=true` ở Chuyển kho tạm POS (**A-10**) — giữ nguyên.
- Chặn **ghi** vào vị trí đã ngừng (ví dụ `resolve-branch-item-locations.ts` ở đường POS). Là lỗ thật
  nhưng là đường ghi, không phải "ô chọn / auto-fill" mà QA báo. Ghi nhận, để đợt sau.
- Chứng từ đã lưu vẫn hiện vị trí đã ngừng của nó.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Lọc vô điều kiện ở `getBalances` làm hỏng trang quản trị | ADR-02: bộ lọc là **tuỳ chọn**, mặc định giữ nguyên. AC-22 và T-04-06 canh ca này |
| Dùng inner join `is_tracked = true` làm mất ca "đã gán nhưng chưa nhận hàng" | **A-06** / ADR-03: dùng `NOT EXISTS`. AC-19 và test của T-04-02 canh ca này |
| Lọc theo `quantity > 0` thay vì `is_tracked` sẽ ẩn nhầm kệ đang theo dõi mà tạm hết hàng | **A-13** đã bác bỏ cách hiểu này; test phải có ca tồn 0 nhưng vẫn theo dõi |
| Khoá cache `["item-stock-balances", itemId, branchId]` không mang tham số mới → hai màn đọc nhầm của nhau | T-04-03 sửa khoá cache cùng lúc với tham số |

## Definition of done

- [x] AC-16…AC-23 pass
- [x] Caller cũ của `GET /inventory/stock/balances` không đổi hành vi khi không truyền tham số mới
- [x] Có test cho ca "đã gán kệ nhưng chưa từng nhận hàng" (AC-19)
- [x] Có test cho ca "đang theo dõi nhưng tồn 0" — vẫn phải hiện
- [x] Trang quản trị và POS Chuyển kho tạm được chứng minh là **không** đổi (T-04-06)
- [x] Không có migration nào trong lát này
- [x] Demoed và accepted at gate G4 — **trên hồ sơ bằng chứng**, xem mục dưới

## Cơ sở chấp nhận G4 (Akenzy uỷ quyền 03/09/2026)

G4 được chấp nhận trên **hồ sơ bằng chứng**, không phải một buổi demo trực tiếp.

- Unit test: `resolve-item-locations.handler.spec.ts` **8/8** (gồm ca "đã gán kệ nhưng chưa từng
  nhận hàng" mà `NOT EXISTS` cố ý giữ lại — AC-19), `stock-take.service.spec.ts` **30/30**,
  `stock-ledger.service.spec.ts` phủ `locationIsActive` cả hai chiều.
- Ảnh chụp **S6 / S7** chứng minh phần **không được phép đổi**: trang "Chi tiết vị trí" vẫn cho
  chọn "Ngừng theo dõi", và trang "Vị trí hàng hóa" vẫn liệt kê một vị trí đã ngừng hoạt động.
- AC-23 (POS Chuyển kho tạm): ảnh `evidence/local-pos-session/desktop/AC23.png` cho thấy màn hình
  vẫn chạy sau toàn bộ thay đổi; phần "vẫn chào chi tiết đã ngừng theo dõi" dựa trên truy mã
  (`use-fast-stock-transfer-product-picker.ts:57,76` vẫn truyền `includeUntracked=true`).

**Chưa được chứng minh bằng mắt trên UI**: auto-fill chọn `A07.02` thay vì `E03.01` cho
`MY535-28-D-35`. Mặt hàng đó chỉ có trên production; tổ chức demo không có hình dữ liệu tương đương.
Phủ bằng unit test thay thế.
