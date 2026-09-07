---
feature: 2026090401-untracked-location-hidden
environments: [local-backoffice-session]
viewports: [desktop]
---

# Verification — Ẩn vị trí đã ngừng theo dõi

Desktop-only: cả hai app là màn hình quầy / back-office, không có layout mobile
(`.ai/aidlc.yaml` đã ghi lý do).

**Tiền điều kiện bắt buộc (A-10).** API `:4000` trên máy này chạy bản `dist/` **cũ** — đã xác minh
04/09/2026: `GET :4000/docs-json` **không** có tham số `isTracked`. Verify vào stack đó sẽ cho
**đỏ giả**: FE gửi `isTracked`, `forbidNonWhitelisted` trả 400, và triệu chứng trông hệt như tính
năng hỏng. Trước khi chụp bất kỳ ảnh nào:

```bash
cd apps/api && pnpm build && PORT=4100 node dist/main.js
cd apps/backoffice-web && VITE_API_BASE_URL=http://localhost:4100 \
  ./node_modules/.bin/vite --port 3010 --strictPort
```

rồi xác nhận `curl -s :4100/docs-json | grep isTracked` có kết quả. Đây đúng cái bẫy đã dính
31/08/2026, được ghi lại trong `.ai/aidlc.yaml`.

**Vì sao bảng này gánh nhiều hơn bình thường:** `@erp/backoffice-web` không có bộ chạy test
(`"test": "echo test"`, không có vitest). Với hai ticket frontend (T-02-03, T-03-01) đây **là** lưới
an toàn duy nhất, không phải phần bổ sung.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Trang "Vị trí hàng hoá" mở được và có cột "Xếp hàng hoá" | `/inventory/item-locations` | — | AC-01 | `text=Xếp hàng hoá` |
| S2 | Bộ lọc cột "Xếp hàng hoá" vẫn cho chọn "Chưa xếp" | `/inventory/item-locations` | — | AC-03 | `count option:has-text("Chưa xếp") = 1` |
| S3 | Bộ lọc cột "Xếp hàng hoá" vẫn cho chọn "Đã xếp" | `/inventory/item-locations` | — | AC-03 | `count option:has-text("Đã xếp") = 1` |
| S4 | Chế độ chung của "Chi tiết vị trí" giữ nguyên bộ lọc trạng thái | `/inventory/item-location-details` | — | AC-13 | `count option:has-text("Ngừng theo dõi") = 1` |
| S5 | Cột "Trạng thái" ở "Chi tiết vị trí" lọc được (trước đây `filterKind: none`) | `/inventory/item-location-details` | — | AC-12 | `count option:has-text("Đang theo dõi") = 1` |

## Not verified here

Bảng trên chỉ chứa những gì **quan sát được** bằng ≤3 thao tác trên một trang. Phần còn lại cố ý để
ngoài, kèm thứ đang phủ nó — nói rõ còn hơn để người đọc sau tưởng ảnh chụp bị thiếu:

- **AC-01, AC-02, AC-03 ở mức số liệu.** S1–S3 chỉ chứng minh cột và hai lựa chọn bộ lọc tồn tại.
  Bằng chứng thật là e2e chạm Postgres thật (`untracked-location-visibility.e2e-spec.ts`), nơi đếm
  được `hasItems` của từng vị trí và kiểm `placed.total + empty.total === all.total`. **Mạnh hơn
  ảnh chụp** cho lớp lỗi này: ảnh không phân biệt được `NOT EXISTS(tracked)` với
  `EXISTS(untracked)`, còn fixture có vị trí mang cả hai loại dòng thì phân biệt được.
- **AC-06 → AC-10, AC-14 (hộp thoại chi tiết).** Hộp thoại mở bằng cách bấm vào một dòng vị trí cụ
  thể, nên selector phụ thuộc dữ liệu của từng máy — một bước theo chỉ số dòng sẽ đỏ khi dữ liệu
  đổi, và đỏ vì lý do không liên quan tới lỗi. Phủ bằng e2e ở tầng API (`isTracked=true/false/bỏ
  trống`, phân trang 60/40, nhánh `below-min`).
- **AC-04, AC-15 (khứ hồi và dữ liệu còn nguyên).** Phủ bằng e2e: bật lại theo dõi rồi kiểm dòng
  quay lại **kèm `minQty`/`maxQty` đã đặt trước khi ngừng**. Đây là phần cốt lõi của lời hứa
  "ẩn đi mà không mất gì" (A-04), và một ảnh chụp không chứng minh được ngưỡng còn nguyên.
- **AC-11 (chế độ xem một vị trí).** Cần một `locationId` thật trên query string
  (`/inventory/item-location-details?locationId=<uuid>`), khác nhau trên từng máy. Kiểm tay trong
  T-03-02, ghi kết quả vào ticket.
- **"Không có migration" (AC-15).** Kiểm bằng `git status --porcelain | grep database/migrations`,
  không phải bằng trình duyệt.
