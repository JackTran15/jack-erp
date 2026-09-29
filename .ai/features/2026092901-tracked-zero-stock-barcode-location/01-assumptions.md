---
feature: tracked-zero-stock-barcode-location
blocking_open: 0
---

# Assumption register

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
|----|-----------|-----------|----------|----------------------|--------|-----------|
| A-01 | Bỏ `quantity > 0` ở bước (b) cho mọi consumer, kể cả mobile (dòng không mang bin sẽ nhận vị trí đang theo dõi tồn <= 0 thay vì vị trí mặc định của kho) | high | yes | mobile chọn bin khác trước đây | resolved | Akenzy chọn "Change for all" (2026-09-29) |
| A-02 | Vị trí trong báo lỗi nằm trong kho nhập mặc định của chi nhánh — không cần mở rộng tìm sang kho khác | high | yes | fix không chữa được case QA | resolved | Akenzy trả lời "In the default storage" (2026-09-29) |
| A-03 | Khi có nhiều vị trí đang theo dõi, ưu tiên tồn lớn nhất (giữ `quantity DESC`), hoà thì `loc.code ASC` cho ổn định | medium | no | chọn vị trí khác mong đợi khi nhiều vị trí 0 | resolved | Suy từ hành vi hiện tại; tie-break mới để kết quả xác định |
