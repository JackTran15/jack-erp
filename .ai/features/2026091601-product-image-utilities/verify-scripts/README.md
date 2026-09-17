# Kịch bản Playwright cho phần runner không làm được (chọn file, đếm request)

Chạy từ gốc repo, API dev ở `:4000` trên `erp_dev`, backoffice ở `:3000`, và **mỗi lần chạy phải
dựng lại phiên** (refresh token dùng một lần):

```bash
set -a && source apps/api/.env && set +a          # verify-t0203*.py cần DB_PASS cho psql
~/.venvs/aidlc-verify/bin/python .ai/capture-session.py
~/.venvs/aidlc-verify/bin/python .ai/features/2026091601-product-image-utilities/verify-scripts/verify-t0104.py
```

| Script | Ticket | Chứng minh | Ghi dữ liệu |
|---|---|---|---|
| `verify-t0104.py` | T-01-04 | cổng giới hạn (0 request), tải 2 ảnh cho C, thay bằng 5 (đồng thời ≤ 3), reset C qua form Sửa | C về 0 ảnh khi xong |
| `verify-t0202.py` | T-02-02 | phân loại 6 file, Đổi ảnh, bỏ thẻ, trùng STT, 200 file | không |
| `verify-t0203.py` | T-02-03 | AC-13 (A/B nhận bộ mới), AC-14 (seed 100 dòng UPLOADED rồi xoá), AC-17 (rời trang) | **A và B nhận ảnh mới**, C về 0 |
| `verify-t0203b.py` | T-02-03 | chặn 1 POST storage ⇒ A không được gắn | không (A giữ nguyên) |
| `verify-t0205.py <label>` | T-02-05 | 6 mã một file ⇒ đỉnh upload đang bay 3 (runner cũ: 1); A ×3 + 2 mã lẻ ⇒ `set-images` của A đúng thứ tự, sau complete; rời trang khi đang chạy | **A nhận bộ 3 ảnh mới**, 6 mã ABA* về 0 (đánh DELETED các dòng vừa gắn) |

Kết quả từng lần chạy đã ghi vào mục *Done when* của ticket; ảnh chụp ở `../evidence/manual/`.
Các dòng `media_objects` UPLOADED mồ côi do script để lại được `MediaCleanupJob` dọn hằng ngày.
Mỗi lượt `verify-t0205.py` để lại ≈ 17 dòng không ATTACHED (UPLOADED của S2 + DELETED do reset) tính vào
hạn mức 100/24h của tài khoản; chạy vài lượt liền là chạm 429 — lùi `created_at` của các dòng đó 2 ngày
để trả lại hạn mức (job dọn theo status, không theo ngày).
