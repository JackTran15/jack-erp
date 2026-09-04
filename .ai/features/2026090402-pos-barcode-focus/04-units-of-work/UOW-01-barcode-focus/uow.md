---
id: UOW-01
slug: barcode-focus
title: Ô quét mã vạch tự động giữ/lấy lại keyboard focus
demoable: true
duration: 1d
depends_on: []
requirements: [US-01, US-02]
verifies: [AC-01, AC-02, AC-03, AC-04]
risk: low
status: todo
rollback: revert 2 file diffs (CheckoutPage.tsx, use-checkout-actions.ts) — không có migration, không có feature flag cần thiết vì thay đổi hành vi thuần UI, không đổi contract
---

# UOW-01 — Ô quét mã vạch tự động giữ/lấy lại keyboard focus

## Demo script

1. Đăng nhập POS, chọn chi nhánh → vào màn hình bán hàng.
2. Không click chuột, gõ trực tiếp một mã vạch → xác nhận sản phẩm được thêm vào giỏ (chứng minh ô quét đã có focus, AC-01).
3. Điều hướng sang "Danh sách hoá đơn", rồi quay lại màn hình bán hàng → gõ mã vạch ngay, không click (AC-02).
4. Thêm một sản phẩm, hoàn tất thanh toán (F9) → quan sát `document.activeElement` ngay sau khi giỏ hàng reset, trước khi hộp thoại in xuất hiện (AC-03).
5. Đóng hộp thoại in của trình duyệt (in hoặc huỷ) → gõ mã vạch tiếp theo ngay, không click (AC-04).

## In scope

- Auto-focus ô quét khi `CheckoutPage` mount (mọi lần, không chỉ lần đầu).
- Refocus ô quét ngay sau khi giao dịch ghi nhận (trước khi in).
- Refocus ô quét lần nữa sau khi `printReceiptIfNeeded` resolve (dù in thành công, lỗi, hay huỷ).

## Not in scope

- Hành vi focus của các dialog khác trong checkout (không đổi).
- Cơ chế in hoá đơn (`BrowserWindowInvoicePrinter`).
- Focus trên `PosLoginPage` / `BranchSelectPage`.

## Risks

| Risk | Mitigation |
| ---- | ---------- |
| Refocus có thể cướp focus của ô khác nếu user đang thao tác giữa lúc giao dịch trước vẫn xử lý bất đồng bộ | `finalizeCheckoutAndPrint` là hàm tuần tự, `await` trước mỗi bước — không có race với thao tác người dùng khác trong cùng hàm này |

## Definition of done

- [x] AC-01..04 pass — CHƯA kiểm chứng bằng trình duyệt thật (lý do: đăng nhập
  POS đòi mật khẩu tôi không được phép tự nhập; DSL của `ai-dlc-verify` không
  diễn đạt được "phần tử đang giữ keyboard focus"). Đã xác nhận đúng bằng đọc
  code (2 lệnh gọi mới dùng đúng cơ chế `productSearchFocusSeq` đã chạy đúng ở
  4 nơi khác trong cùng codebase) + build không lỗi type. Tick theo yêu cầu
  trực tiếp của Akenzy ("cứ pass G4 luôn — tin vào code+test đã làm", 2026-09-04)
  — KHÔNG phải một tuyên bố rằng demo trình duyệt đã thực sự chạy.
- [x] Không có test nào trong `apps/pos-web` bị đỏ thêm (vitest chạy qua `npx vitest run`) —
  3 test đỏ trong `api-axios.test.ts` đã đỏ sẵn trên `main` (xác nhận bằng `git stash`), không liên quan
- [x] Demoed và accepted tại gate G4 — KHÔNG có demo trình duyệt thật; Akenzy chủ động
  yêu cầu pass G4 dựa trên code review + build/test xanh, không chờ demo thủ công
  (xem ghi chú ở dòng AC-01..04 phía trên)
