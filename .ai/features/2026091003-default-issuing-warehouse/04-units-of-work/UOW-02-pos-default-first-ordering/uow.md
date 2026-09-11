---
id: UOW-02
slug: pos-default-first-ordering
title: POS Kho tạm mở ra là kho xuất mặc định, cả hai tab
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-02]
verifies: [AC-07, AC-08, AC-09]
risk: low
status: todo
rollback: revert hai file pos-web; không có thay đổi server, không có migration
---

# UOW-02 — POS Kho tạm mở ra là kho xuất mặc định, cả hai tab

Toàn bộ thay đổi nằm ở pos-web. Server không đụng gì: cờ đã có sẵn trong payload vì
`listStorages` trả nguyên thực thể (A-07), và thứ tự của endpoint cố tình **không** đổi vì
18+ màn backoffice dùng chung nó (ADR-02).

## Demo script

1. Ở backoffice, đặt kho `A2` (không phải kho tạo gần nhất) làm kho xuất mặc định của chi nhánh.
2. Đăng nhập POS, chọn đúng chi nhánh đó.
3. Mở `/fast-stock-transfer` ở tab **"Xuất đi"**.
4. Ô chọn kho lưu trữ đã điền sẵn `A2`, không phải kho tạo gần nhất.
5. Mở dropdown → `A2` là mục đầu tiên; các kho còn lại vẫn có đủ trong danh sách.
6. Chuyển sang tab **"Trả lại"** → `A2` vẫn đứng đầu và vẫn được chọn sẵn.
7. Ở backoffice đổi kho xuất mặc định sang `A3`, chờ quá 30 giây (staleTime) hoặc tải lại
   POS → `A3` lên đầu.

## In scope

- Nới `InventoryStorageOption` để mang `isDefaultIssuing`.
- Sắp danh sách kho ngay sau bước lọc `isMainStorage` đã có.
- ~~Unit test ghim `pickDefaultStorageId`~~ — huỷ khi mở lại G2 (pos-web không có trình chạy test); AC-08 kiểm bằng demo.

## Not in scope

- Đổi `ORDER BY` của `GET /inventory/storages` (ADR-02).
- Viết lại `pickDefaultStorageId` (ADR-05).
- Phía showroom — UOW-03.

## Risks

| Risk | Mitigation |
| --- | --- |
| Tính đúng đắn dựa vào nhánh `isMainStorage` trong `pickDefaultStorageId` không bao giờ chạy (ADR-05) | **Không còn biện pháp tự động** (ADR-05, bổ sung G2): pos-web không chạy được test. Chỉ demo AC-08 bắt được; rủi ro hồi quy về sau được chấp nhận |
| `staleTime: 30_000` khiến POS chậm thấy thay đổi | Chấp nhận, ghi rõ ở § Cache của thiết kế; demo script có bước chờ |

## Definition of done

- [ ] AC-07, AC-08, AC-09 pass
- [ ] Cả hai tab cho cùng thứ tự — chứng minh bằng demo trên POS thật ở cả hai tab (pos-web không có trình chạy test)
- [ ] `GET /inventory/storages` không có thay đổi nào phía server
- [ ] `tsc --noEmit` của `apps/pos-web` sạch (script `test` của pos-web chỉ là `echo test`, không chứng minh gì)
- [ ] Demo script chạy được đầu-cuối và được nghiệm thu ở G4
