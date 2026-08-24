---
feature: overstock-warning-edit-credit
---

# Requirements — Cảnh báo "xuất quá số lượng tồn" khi **sửa** phiếu đã ghi sổ

## Bối cảnh

Sửa một phiếu đã ghi sổ không phải là ghi lại từ đầu: phiếu xuất kho chỉ ghi phần chênh lệch
(`computeVoucherDelta`), phiếu chuyển kho đảo bút cũ rồi ghi bút mới. Dòng giữ nguyên số lượng ⇒
tồn sau khi lưu **không đổi**.

Vòng kiểm cảnh báo ở frontend lại so **toàn bộ** số lượng dòng với tồn **hiện tại** — cái tồn mà
chính phiếu đó đã trừ. Hệ quả: mở một phiếu đã xuất hết tồn ra bấm Lưu, dù không đụng gì, vẫn bị
cảnh báo "Xác nhận xuất quá số lượng tồn" với Số tồn = 0.

## Acceptance criteria

- **AC-01** — Sửa phiếu **xuất kho** đã ghi sổ mà không đổi số lượng dòng nào thì không hiện cảnh
  báo "Xác nhận xuất quá số lượng tồn"; phiếu lưu thẳng.
- **AC-02** — Cảnh báo vẫn hiện khi số lượng mới vượt **tồn hiệu dụng** (tồn hiện tại cộng phần
  chính phiếu cũ sẽ trả lại khi bút cũ bị đảo), và cột "Số tồn" hiện đúng tồn hiệu dụng đó — không
  phải tồn hiện tại.
- **AC-03** — Hai điều trên đúng y hệt với phiếu **chuyển kho**, vốn dùng chung vòng kiểm.
