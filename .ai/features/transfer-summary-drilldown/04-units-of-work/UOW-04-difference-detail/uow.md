---
id: UOW-04
slug: difference-detail
title: Bấm chênh lệch mở danh sách phiếu chưa ai xác nhận nhận, kèm bằng chứng
demoable: true
duration: 2d
depends_on: [UOW-03]
requirements: [US-03, US-04]
verifies: [AC-04, AC-05, AC-11, AC-14, AC-15, AC-16]
risk: low
status: todo
rollback: gỡ entry `diffQty` khỏi `DRILL_DOWNS` — ô về text thường; L1 và L2 vẫn chạy.
---

# UOW-04 — Chi tiết chênh lệch điều chuyển (L3) + bằng chứng

UoW đóng feature: tầng cuối cùng, và là nơi toàn bộ chuỗi được chụp lại thành bằng chứng.

## Demo script

1. Từ dialog L1 của HCM, click ô "Số lượng" dải **Chênh lệch thực nhận** trên dòng DN
2. Dialog "CHI TIẾT CHÊNH LỆCH ĐIỀU CHUYỂN" mở, phụ đề "Cửa hàng xuất HCM · Cửa hàng nhập DN"
3. Mọi dòng là phiếu xuất; cột "Tham chiếu" **rỗng ở mọi dòng** — đó chính là ý nghĩa của dialog
4. Σ cột "Số lượng" bằng trị tuyệt đối của ô vừa click
5. Danh sách gồm cả TO-3 (có lệnh điều chuyển, chưa ai nhận) lẫn GI-tay (lập tay, không bao giờ
   ghép được) — AC-04
6. ST-1 (điều chuyển legacy) **không** có mặt — AC-05
7. Chạy `verify.py … --write`; mở `08-evidence.md` và contact sheet

## In scope

- Khoá `inventory-transfer-difference-detail` + nhãn
- `TransferDifferenceDetailReport` trên `TransferDetailService` với `leg='unmatched'`
- Resolver `diffQty` trên L1
- `07-verification.md` + lượt chạy ai-dlc-verify sinh `08-evidence.md`

## Not in scope

- Ô "Chênh lệch thực nhận" của **báo cáo cha** — xem 00-intent "Out of scope"
- Bằng chứng trên staging: không có phiếu kho nào nên lưới rỗng (D5)

## Risks

| Risk | Mitigation |
|---|---|
| Σ L3 không bằng \|diffQty\| ⇒ dialog mâu thuẫn với ô mở ra nó | Đúng theo cấu trúc: `unmatched` là phần bù của `received` trong cùng tập `out`. T-04-02 ghim bằng spec |
| Bước verify chụp lưới rỗng và vẫn xanh | Mọi bước đặt kỳ tường minh rồi bấm "Lấy dữ liệu", và `Assert` bám vào nội dung ô chứ không chỉ tiêu đề |
| Dev server chưa bật ⇒ toàn bộ bước đỏ với `ERR_CONNECTION_REFUSED` | T-04-04 bật `make dev-api` + `make dev-backoffice` trước, và chạy `--doctor` để xác nhận |
| Mã AC dạng `AC-BCK-06` bị runner bỏ qua | Toàn bộ AC dùng dạng `AC-\d+`; ánh xạ về phụ lục ghi ở phần văn xuôi |

## Definition of done

- [x] AC-11/AC-14/AC-15/AC-16 pass (S10/S4/S11-S12/S1); AC-04 và AC-05 khai ở `## Not verified here` — dữ liệu thật có 0 trường hợp mỗi loại
- [x] jest `@erp/api` **3551/3554** — `auth.service.spec.ts` 2 lỗi có sẵn ở HEAD (đã xác nhận bằng cách checkout lại file của feature này rồi chạy riêng spec đó), không liên quan, `pnpm --filter @erp/api build` xanh
- [x] `@erp/backoffice-web build` OK
- [x] `evidence_check.py` PASS, sha `e889e937` khớp HEAD
- [x] Demo script chạy được đầu-cuối trên dữ liệu thật; bằng chứng ảnh ở `evidence/local-backoffice/desktop/`

## Verification evidence

- [x] `verify.py … --write` **12/12 xanh** trên `local-backoffice` (môi trường `required` duy nhất khai trong 07-verification.md)
- [x] `evidence_check.py` PASS: 12/12 AC có bằng chứng, 3 AC khai ngoài phạm vi ảnh chụp
- [x] `08-evidence.md` sinh lại, sha `bd91b0c6` khớp HEAD
