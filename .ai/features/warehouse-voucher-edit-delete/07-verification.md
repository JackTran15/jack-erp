---
feature: warehouse-voucher-edit-delete
environments: [local-backoffice]
viewports: [desktop]
---

# Verification — Sửa và xoá phiếu nhập / phiếu xuất kho

Fixtures for every step below already exist in `erp_dev` (org Hồ Chí Minh /
`f1000000-0000-4000-8000-000000000001`, branch Hồ Chí Minh), created live through the same
`POST /goods-receipts`, `POST /inventory/goods-issues`, `POST /inventory/transfer-orders/direct-export`
and `POST /cash-payments/supplier-debt-payment` endpoints the UI calls — not hand-seeded rows.
Every fixture voucher carries a `AIDLC-VERIFY-*` marker in its Diễn giải/Ghi chú so a step can
re-select it by that text regardless of the auto-assigned document number:

| Marker | Voucher | Shape |
|---|---|---|
| `AIDLC-VERIFY-AC01` | IMP000012 | Khác receipt, no payment method, 1 line ABA2777-D-38 × 10 @ 100.000 |
| `AIDLC-VERIFY-AC15-BASE` | IMP000014 | Khác receipt, ABA2799-D-38 × 10 @ 100.000, tại vị trí đã bị rút xuống tồn 2 trước đó |
| `AIDLC-VERIFY-CREDIT` | IMP000013 | Ghi nợ NCC số 2, ABA2777-D-39 × 20 @ 500.000 = 10.000.000; đã trả 6.000.000 (PC000053) |
| `AIDLC-VERIFY-AC06` | IMP000016 | Thanh toán ngay (CASH), NCC số 2, ABA2777-N-44 × 10 @ 500.000 = 5.000.000 |
| `AIDLC-VERIFY-AC21` | IMP000017 | Thanh toán ngay (CASH), 300.000 — quỹ bị hạ tạm thời trước bước AC-21 |
| `AIDLC-VERIFY-AC12` | XK000004 | Xuất khác, ABA2777-N-44 × 5 @ 350.000; giá bình quân mặt hàng hiện là 500.000 |
| `AIDLC-VERIFY-AC13` | XK000008 | Xuất khác, A02-D-39 × 5 @ 350.000 (mặt hàng chưa từng có lịch sử sổ kho, tránh lệch giá bình quân do trùng mặt hàng với fixture khác) |
| `AIDLC-VERIFY-AC16` | LDC000002 / XK000006 | Lệnh điều chuyển HCM→Hà Nội, ABA2777-D-40 × 10, đã xuất, chưa nhập |
| (dữ liệu thật có sẵn) | LDC000001 / XK000002 / IMP000002 | Đã xuất ở HCM và đã nhập ở Hà Nội — dùng cho AC-17 |

`AIDLC-VERIFY-AC21` cần quỹ tiền mặt HCM tạm thời để `allow_negative = false` và số dư thấp hơn
mức tăng dự kiến — việc này được bật ngay trước khi chạy `verify.py` và trả lại nguyên trạng
ngay sau, xem `## Notes`.

Số phiếu ở cột "Voucher" trên đổi mỗi lần `verify.py` chạy lại (các bước Xóa tiêu huỷ voucher,
nên lần chạy sau tạo bản mới): các Interaction bên dưới luôn chọn theo **marker**, không theo số
phiếu, nên bảng này chỉ mang tính minh hoạ hình dạng dữ liệu tại thời điểm viết, không phải số
phiếu hiện hành.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Mở phiếu nhập đã ghi sổ ở chế độ sửa | `/inventory/purchase-orders` | `click tr:has-text("AIDLC-VERIFY-AC01") input[type="checkbox"]; click text="Sửa"; wait text="Lưu"` | AC-19 | text=ABA2777-D-38;text=A01.01 |
| S2 | Sửa số lượng, ghi chênh lệch vào sổ kho | `/inventory/purchase-orders` | `click tr:has-text("AIDLC-VERIFY-AC01") input[type="checkbox"]; click text="Sửa"; fill tr:has-text("ABA2777-D-38") input[type="number"] = 7; click text="Lưu"; wait [data-sonner-toast]` | AC-01 | text=700.000 |
| S3 | Sửa đơn giá, không đổi số lượng | `/inventory/purchase-orders` | `click tr:has-text("AIDLC-VERIFY-AC01") input[type="checkbox"]; click text="Sửa"; fill tr:has-text("ABA2777-D-38") input[type="text"] >> nth=3 = 120000; click text="Lưu"; wait [data-sonner-toast]` | AC-02 | text=840.000 |
| S4 | Thêm và xoá dòng hàng | `/inventory/purchase-orders` | `click tr:has-text("AIDLC-VERIFY-AC01") input[type="checkbox"]; click text="Sửa"; click button[aria-label="Xoá dòng"]; fill input[placeholder="Tìm mã hoặc tên"] = ABA2777-D-42; click text=ABA2777-D-42; fill tr:has-text("ABA2777-D-42") input[type="number"] = 5; click text="Lưu"; wait [data-sonner-toast]; click text="Lấy dữ liệu"` | AC-03 | text=ABA2777-D-42;no-text=ABA2777-D-38 |
| S5 | Sửa phần không chạm sổ hiện ngay trên danh sách | `/inventory/purchase-orders` | `click tr:has-text("AIDLC-VERIFY-AC01") input[type="checkbox"]; click text="Sửa"; fill input:right-of(:text("Diễn giải")) = AIDLC-VERIFY-AC04-DONE; click text="Lưu"; wait [data-sonner-toast]` | AC-04 | text=AIDLC-VERIFY-AC04-DONE |
| S6 | Sửa tiếp lần hai vẫn ghi đúng dữ liệu mới nhất | `/inventory/purchase-orders` | `click tr:has-text("AIDLC-VERIFY-AC04-DONE") input[type="checkbox"]; click text="Sửa"; fill input:right-of(:text("Diễn giải")) = AIDLC-VERIFY-AC05-DONE; click text="Lưu"; wait [data-sonner-toast]` | AC-05 | text=AIDLC-VERIFY-AC05-DONE |
| S7 | Không chặn tồn âm khi sửa phiếu nhập | `/inventory/purchase-orders` | `click tr:has-text("AIDLC-VERIFY-AC15-BASE") input[type="checkbox"]; click text="Sửa"; fill tr:has-text("ABA2799-D-38") input[type="number"] = 5; click text="Lưu"; wait [data-sonner-toast]` | AC-15 | text=Đã cập nhật |
| S8 | Sửa phiếu nhập công nợ lên cao hơn | `/purchases/imports` | `click tr:has-text("AIDLC-VERIFY-CREDIT") input[type="checkbox"]; click text="Sửa"; fill tr:has-text("ABA2777-D-39") input[type="number"] = 24; click text="Lưu"; wait [data-sonner-toast]` | AC-07 | text=12.000.000 |
| S9 | Sửa phiếu công nợ xuống thấp hơn số đã trả | `/purchases/imports` | `click tr:has-text("AIDLC-VERIFY-CREDIT") input[type="checkbox"]; click text="Sửa"; fill tr:has-text("ABA2777-D-39") input[type="number"] = 8; click text="Lưu"; wait [data-sonner-toast]` | AC-08 | text=4.000.000 |
| S10 | Xoá phiếu nhập công nợ | `/purchases/imports` | `click tr:has-text("AIDLC-VERIFY-CREDIT") input[type="checkbox"]; click text="Xóa"; click text="Xóa phiếu"; click text="Lấy dữ liệu"; click text="Lấy dữ liệu"` | AC-10 | no-text=AIDLC-VERIFY-CREDIT |
| S11 | Sửa phiếu nhập tiền mặt, quỹ tăng lại | `/purchases/imports` | `click tr:has-text("AIDLC-VERIFY-AC06") input[type="checkbox"]; click text="Sửa"; fill tr:has-text("ABA2777-N-44") input[type="number"] = 6; click text="Lưu"; wait [data-sonner-toast]` | AC-06 | text=3.000.000 |
| S12 | Xoá phiếu nhập tiền mặt, quỹ nhận lại đủ | `/purchases/imports` | `click tr:has-text("AIDLC-VERIFY-AC06") input[type="checkbox"]; click text="Xóa"; click text="Xóa phiếu"; click text="Lấy dữ liệu"; click text="Lấy dữ liệu"` | AC-09 | no-text=AIDLC-VERIFY-AC06 |
| S13 | Xoá hai lần chỉ có một lần tác dụng | `/purchases/imports` | `click text="Lấy dữ liệu"` | AC-11 | no-text=AIDLC-VERIFY-AC06 |
| S14 | Báo lỗi rõ ràng khi quỹ không đủ tiền | `/purchases/imports` | `click tr:has-text("AIDLC-VERIFY-AC21") input[type="checkbox"]; click text="Sửa"; fill tr:has-text("ABA2777-N-43") input[type="number"] = 100; click text="Lưu"` | AC-21 | text=Quỹ tiền mặt không đủ |
| S15 | Sửa tăng số lượng xuất dùng giá bình quân mới | `/inventory/goods-issues` | `click tr:has-text("AIDLC-VERIFY-AC12") input[type="checkbox"]; click text="Sửa"; fill tr:has-text("ABA2777-N-44") input[type="number"] = 8; click text="Lưu"; wait [data-sonner-toast]` | AC-12,AC-20 | text=406.250 |
| S16 | Sửa giảm số lượng xuất giữ đúng giá đã ghi | `/inventory/goods-issues` | `click tr:has-text("AIDLC-VERIFY-AC13") input[type="checkbox"]; click text="Sửa"; fill tr:has-text("A02-TEST") input[type="number"] = 2; click text="Lưu"; wait [data-sonner-toast]` | AC-13 | text=700.000 |
| S17 | Xoá phiếu xuất đã ghi sổ | `/inventory/goods-issues` | `click tr:has-text("AIDLC-VERIFY-AC13") input[type="checkbox"]; click text="Xóa"; click text="Xóa phiếu"; click text="Lấy dữ liệu"; click text="Lấy dữ liệu"` | AC-14 | no-text=AIDLC-VERIFY-AC13 |
| S18 | Mở được form sửa trên màn hình Xuất kho | `/inventory/goods-issues` | `click tr:has-text("AIDLC-VERIFY-AC12") input[type="checkbox"]; click text="Sửa"; wait text="Lưu"` | AC-19 | text=ABA2777-N-44 |
| S19 | Chi nhánh đích chưa nhập vẫn cộng lại đúng | `/inventory/goods-issues` | `click tr:has-text("AIDLC-VERIFY-AC16") input[type="checkbox"]; click text="Sửa"; fill tr:has-text("ABA2777-D-40") input[type="number"] = 6; click text="Lưu"; wait [data-sonner-toast]` | AC-16 | text=2.100.000 |
| S20 | Chi nhánh đích đã nhập vẫn khớp hai bên | `/inventory/goods-issues` | `fill input[type="date"] = 2026-01-01; click text="Lấy dữ liệu"; click tr:has-text("XK000002") input[type="checkbox"]; click text="Sửa"; fill tr:has-text("ABA2777-D-38") input[type="number"] = 1; click text="Lưu"; wait [data-sonner-toast]` | AC-17 | text=Đã cập nhật |
| S21 | Xoá chân phiếu điều chuyển huỷ cả lệnh | `/inventory/goods-issues` | `click tr:has-text("AIDLC-VERIFY-AC16") input[type="checkbox"]; click text="Xóa"; click text="Xóa phiếu"; click text="Lấy dữ liệu"; click text="Lấy dữ liệu"` | AC-18 | no-text=AIDLC-VERIFY-AC16 |

## Not verified here

None of the 21 acceptance criteria are skipped — every one has a step above. Two steps are
deliberately narrower than their AC's full Given/When/Then, documented in `## Notes`:

- **AC-05** and **AC-11** exercise the *outcome* a UI session can trigger sequentially (an edit
  correctly lands on top of the previous one; a second delete attempt on an already-cancelled
  row has nothing left to affect), not a genuine two-request race. The runner drives one
  Playwright page through one action at a time — it cannot dispatch two concurrent HTTP
  requests from a single browser step, so the literal race is out of reach for this tool. The
  actual concurrency guarantee (`SELECT … FOR UPDATE` + revision check, rejecting the loser
  with 409) is proven by two real, already-green unit tests instead:
  `goods-receipt.service.spec.ts:348` *"rejects a second concurrent cancel once the first has
  revised the row"* and `:408` *"...and refunds the fund exactly once"*.
- **AC-18**'s "hành vi này giống hệt luồng huỷ hiện có, không sinh thêm chứng từ nào" half is a
  DB-level claim (no extra `journal_entries`/`stock_ledger_entries` row) that a screenshot
  cannot show either way — it's covered by `pnpm --filter @erp/api audit:voucher-invariants`,
  which the AI-DLC ticket notes record as clean on this exact data.
- **AC-17**'s Hà Nội-side half (sổ kho chi nhánh B có chênh lệch −4 trên chính phiếu nhập của
  TO-A) is not captured as a second screenshot: switching the active branch mid-run add a login
  recipe's worth of new interactions (`button[aria-haspopup="menu"]` also matches the column-filter
  comboboxes on this same list page, and disambiguating it reliably needs more than the runner's
  four-verb grammar reaches for cleanly). S20 verifies the HCM-side edit lands (`AC-17`'s literal
  "When" action); the cross-branch propagation onto `IMP000002` is confirmed instead by
  `docker exec erp-postgres psql` against `erp_dev` right after this run (see the session record)
  and by `TransferOrderService.applyLegRevision`'s own tests
  (`transfer-order.service.spec.ts`, *"two-branch synchronization through a full lifecycle
  (T-05-03)"*).

## Notes

- Login and the Hồ Chí Minh branch switch are handled by `auth.post_login` in `.ai/aidlc.yaml`;
  every step's `Path` therefore lands already scoped to org `f1000000-...-0001` / branch HCM.
- **S14 (AC-21) needs a one-time, reversible fixture mutation** made *outside* the scripted run:
  ```sql
  -- before verify.py --write:
  UPDATE cash_accounts SET balance = 250000, allow_negative = false
    WHERE id = 'c387b670-b2a9-4a87-8201-425b3dd4a147';
  -- after the run: restore balance to (250000 + net delta the run itself produced) and
  -- allow_negative = true.
  ```
  Both real cash accounts in `erp_dev` ship with `allow_negative = true`, and no screen in
  either frontend exposes that toggle — without shrinking the fund first, AC-21's guard is dead
  code from the UI's reach and the step cannot fail the way the AC describes. `S11`/`S12` land on
  a *different* voucher (`AIDLC-VERIFY-AC06`) and only ever increase the fund, so they're safe to
  run in the same window.
- S13's assertion is deliberately weak (`no-text` after a page reload, not a captured 409) for
  the same single-browser-page reason as AC-05 above — see `## Not verified here`.
- Money assertions assume `vi-VN` grouping (`.` thousands separator, no decimals) — matches every
  screen this feature touches.
