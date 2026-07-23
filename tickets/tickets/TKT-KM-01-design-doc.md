# TKT-KM-01 Tài liệu thiết kế: use case + ERD + sequence

## Epic

[EPIC-22072026 Khuyến mại — schema chuẩn hóa, domain engine & evaluate API](../epics/EPIC-22072026-promotion-programs-engine.md)

## Summary

REQ-KM-001 (`docs/promotions/25-promotion-req.md`) là **tài liệu yêu cầu** — nó mô tả *cái gì*, để ngỏ 14 mục `[Q]` và mô hình dữ liệu mục 8 là "suy ra từ UI, cần review". Ticket này viết **tài liệu thiết kế** — *làm thế nào* — chốt toàn bộ mục `[Q]`, khóa mô hình dữ liệu thật, và là nguồn tham chiếu cho 15 ticket còn lại. Không có code.

## Deliverables

- `docs/26-promotion-design.md` (mới) — đánh số nối tiếp `25-promotion-req.md`, cùng thư mục `docs/`.

Cấu trúc bắt buộc:

1. **Bối cảnh & phạm vi** — trỏ ngược về REQ-KM-001 và khảo sát MISA; nêu rõ FE đã dựng khung trên mock, BE là stub (kèm file:line dẫn chứng).
2. **Use case** — sơ đồ + đặc tả cho từng ca:
   - UC-01 Marketing tạo CTKM (5 nhánh theo hình thức)
   - UC-02 Marketing sửa / nhân bản / ngừng theo dõi / xóa CTKM
   - UC-03 Marketing tra cứu danh sách CTKM (lọc kỳ, lọc cột, phân trang)
   - UC-04 Client tính khuyến mại cho một giỏ hàng (`evaluate`)
   - UC-05 Marketing phát hành / quản lý thẻ voucher
   - Mỗi UC: actor · tiền điều kiện · luồng chính · luồng thay thế · hậu điều kiện · quyền yêu cầu.
3. **ERD** — mermaid `erDiagram` đầy đủ 7 bảng mới + quan hệ tham chiếu (không FK) tới `items` / `products` / `inventory_item_categories` / `customer_groups` / `membership_card_types`. Kèm bảng cột chi tiết cho từng bảng (tên cột, kiểu, nullable, ý nghĩa).
4. **Sequence diagram** — tối thiểu 3: tạo CTKM (CommandBus), evaluate (QueryBus), nhân bản.
5. **Kiến trúc phân lớp** — cây thư mục `modules/promotion/`, quy tắc phụ thuộc (domain không import `@nestjs/*` / `typeorm`), danh sách port + symbol token.
6. **Thuật toán engine** — mô tả `PromotionResolver` bằng pseudo-code: lọc eligibility → sắp `priority ASC, createdAt ASC` → duyệt & chiếm tài nguyên → gọi strategy → `roundVnd`. Mô tả riêng từng strategy trong 5 strategy.
7. **Bảng truy vết** — FR-001…FR-051 và BR-001…BR-006 của REQ → ánh xạ sang bảng/cột/ticket nào hiện thực. Mọi mục `[Q]` trong REQ phải có một dòng quyết định ở đây.
8. **Ma trận tính năng theo hình thức** — cập nhật lại Phụ lục A của REQ theo thiết kế thật (cột nào của bảng nào được dùng ở hình thức nào).
9. **Ngoài phạm vi** — POS checkout, Excel import/export, báo cáo hiệu quả; kèm ghi chú kỹ thuật đã xác minh cho epic POS kế tiếp.

## Acceptance Criteria

- [ ] Mọi mục `[Q]` trong `docs/promotions/25-promotion-req.md` có một dòng quyết định tương ứng trong bảng truy vết — không còn câu hỏi treo.
- [ ] ERD trong doc khớp **chính xác** với migration của TKT-KM-02 (tên bảng, tên cột, kiểu, nullable). Doc và migration lệch nhau = ticket chưa xong.
- [ ] Use case UC-01 liệt kê đủ 5 nhánh hình thức, mỗi nhánh nêu rõ bảng con nào được ghi.
- [ ] Bảng truy vết có cột "Ticket" trỏ tới TKT-KM-NN cụ thể cho mỗi FR/BR trong phạm vi.
- [ ] Mọi sơ đồ mermaid render được (kiểm tra bằng preview markdown, không chỉ đọc text).

## Definition of Done

- [ ] `docs/26-promotion-design.md` tồn tại, mọi liên kết tương đối trỏ đúng file.
- [ ] Thuật ngữ dùng nhất quán với bảng ánh xạ trong epic (Hàng hóa = `ProductEntity`, Mẫu mã/SKU = `ItemEntity.code`, Nhóm hàng hóa = `ItemCategoryEntity`).
- [ ] Không có TODO/FIXME ngoài mục "Ngoài phạm vi".
- [ ] Đã đọc lại đối chiếu với `docs/promotions/promotion-misa-eshop-survey.md` — mọi hành vi mô tả là *chủ ý khác MISA* phải được đánh dấu rõ (hiện có 2: FR-004 chip bộ lọc, FR-023 không tự bỏ tick auto-apply).

## Tech Approach

Doc là văn xuôi tiếng Việt (khớp các doc khác trong `docs/`), nhưng **mọi định danh kỹ thuật giữ tiếng Anh**: tên bảng, tên cột, giá trị enum, tên class/method. Đây là ranh giới đã có trong repo — `docs/24-debt-reports-spec.md` là mẫu để bám theo về giọng văn và mật độ chi tiết.

Bảng truy vết dùng dạng:

| FR/BR | Yêu cầu | Thiết kế | Bảng/cột | Ticket |
| ----- | ------- | -------- | -------- | ------ |
| FR-022 | Giờ kết thúc < giờ bắt đầu | Hỗ trợ ca qua đêm | `promotion_programs.start_time` / `end_time` | KM-04, KM-05 |

## Testing Strategy

Không có test tự động. Kiểm tra bằng review: đọc chéo doc ↔ REQ ↔ epic, xác nhận không mục nào bị bỏ sót và ERD khớp migration dự kiến.

## Dependencies

- Depends on: —
- Blocks: TKT-KM-02 (migration phải khớp ERD trong doc)
