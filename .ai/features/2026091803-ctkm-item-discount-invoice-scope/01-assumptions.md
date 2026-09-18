---
feature: ctkm-item-discount-invoice-scope
blocking_open: 0
---

# Assumption register

Hai vòng hỏi trong phiên 2026-09-18. Vòng hai xuất hiện vì vòng một tôi đưa ra một
tiền đề **sai** ("mọi CTKM hóa đơn đã lưu đều là `ALL_ITEMS`") — số đếm thật trên DB
bác bỏ nó, và câu trả lời đổi theo. A-01 và A-03 dưới đây là bản sau khi sửa.

| ID | Assumption | Confidence | Blocking | Blast radius if wrong | Status | Resolution |
| --- | --- | --- | --- | --- | --- | --- |
| A-01 | Phạm vi áp dụng quay lại là **radio 2 lựa chọn**, mặc định `NON_PROMO_ONLY` — không phải bất biến ép cứng | high | yes | Toàn bộ UOW-02: có radio thì cần state, validate, round-trip và test; ép cứng thì không | confirmed | Akenzy chốt 2026-09-18 vòng 2 — "Đảo lại nhưng dạng radio". Thay cho lựa chọn "bất biến" ở vòng 1, sau khi có số đếm DB |
| A-02 | "Hàng đã được giảm rồi" **bao gồm** giảm giá tay của thu ngân (`manualLineDiscount > 0`), không chỉ hàng bị CTKM chiếm | high | yes | `InvoiceDiscountStrategy` + `CartState`; chạm POS, checkout saga và `modules/mobile` cùng lúc | confirmed | Akenzy chốt 2026-09-18 — "Tính cả giảm tay" |
| A-03 | Không backfill CTKM đã lưu; không đảo mặc định của `NULL`/`undefined` trong engine | high | yes | Nếu sai: cần migration `UPDATE` + kiểm lại mọi CTKM đang chạy | confirmed | Akenzy chốt 2026-09-18 vòng 2 — "Không backfill, nhưng cảnh báo trên UI" |
| A-04 | Chỉ mở lại **Giảm giá hàng hóa**; ba hình thức còn lại vẫn ẩn | high | yes | Số AC và số UoW nhân lên nếu mở đủ 5 | confirmed | Akenzy chốt 2026-09-18 — "Chỉ Giảm giá hàng hóa" |
| A-05 | Một dòng vừa bị chiếm vừa giảm tay chỉ bị loại **một lần** — hai điều kiện là phép **hợp**, không trừ hai lần | high | no | Sai thì cơ sở tính vẫn đúng tập dòng, chỉ thừa lý luận | confirmed | Suy ra từ A-02 + A-01; kiểm bằng AC-14 |
| A-06 | `manualLineDiscount` là số tiền **tuyệt đối trên cả dòng** (VNĐ), không phải phần trăm | high | no | Ngưỡng "> 0" đúng với cả hai cách hiểu | confirmed | `discount-math.ts` — `quantity * unitPrice - (manualLineDiscount ?? 0)`; `evaluate-promotion.step.ts` gán `Number(item.lineDiscount)` |
| A-07 | Ngưỡng loại trừ là `manualLineDiscount > 0`; `0`/`undefined`/`null` đều là **chưa giảm** | medium | no | Một dòng giảm tay 0đ bị loại nhầm → giảm ít hơn chút; AC-13 bắt được | confirmed | `evaluate-promotion.step.ts` dùng `\|\| undefined`, nên 0 không xuống tới engine |
| A-08 | Sửa CTKM cũ: radio hiện **đúng giá trị đang lưu**, người dùng đổi thì mới đổi — không âm thầm ghi đè | high | no | Nếu radio mặc định đè lên giá trị đã lưu, một CTKM `ALL_ITEMS` sẽ lặng lẽ thành `NON_PROMO_ONLY` khi ai đó chỉ sửa tên | confirmed | Hệ quả trực tiếp của A-01 dạng radio + `applyScopeFromApi` đã có sẵn; kiểm bằng AC-17 |
| A-09 | Không chương trình nào khác đọc `invoice_scope` ngoài `InvoiceDiscountStrategy` | high | no | Một chỗ đọc bị bỏ sót sẽ lệch nghĩa | confirmed | `grep -rn "invoiceScope" apps/api/src` — chỉ entity, mapper, DTO, domain model và đúng một nơi dùng |
| A-10 | Bộ e2e chạy trên DB `erp_test` riêng, tự tạo và tự migrate, nên test `SELECT` thẳng vào bảng mà không bẩn dữ liệu dev | high | no | Sai thì đổi cách kiểm chứng, không đổi phạm vi code | confirmed | `apps/api/test/e2e/setup/global-setup.ts` + `CLAUDE.md` |
| A-14 | Cảnh báo UI cho CTKM đang ở `ALL_ITEMS` là **văn bản giải thích cạnh radio**, không phải dialog chặn hay toast | medium | no | Nếu bạn muốn cảnh báo mạnh hơn (chặn lưu / xác nhận), đây là một component nhỏ đổi riêng, không lan ra chỗ khác | confirmed | Đúng như giả định: AC-23 (Akenzy pass G1) chốt "cạnh radio hiện dòng giải thích … không chặn việc lưu"; đã ship trong `ApplyScopePromotionSection.tsx` (T-02-03) và chụp ở `07-verification.md` AC-23 — `KM000012` lưu được trong lúc cảnh báo đang hiện. Muốn mạnh hơn thì là feature riêng |
| A-15 | Sửa `promotion.mapper.spec.ts` (test đang khẳng định hành vi `ALL_ITEMS`) là **có chủ ý**, không phải sửa test cho xanh | high | no | Nếu nhầm, ta đang gỡ chính cái lưới an toàn của tháng 8 mà không ai biết | confirmed | Akenzy chốt đảo ADR-01 vòng 2; test được liệt kê trong cả `tests:` lẫn `touches:` của T-02-02 để không bị đóng băng |
| A-17 | Không wire test runner cho `backoffice-web` trong feature này; các AC thuộc giao diện được chứng minh bằng **kiểm thử trình duyệt** (`ai-dlc-verify`) chứ không phải unit test | high | no | Nếu bạn muốn có vitest thật, đó là một feature riêng: cả `apps/backoffice-web` lẫn `apps/pos-web` hiện đều `"test": "echo test"`, nên **mọi** `*.spec.ts`/`*.test.ts` phía web chưa từng chạy | confirmed | Đúng như giả định: UOW-03 (Akenzy pass G3) ghi wire runner là "Not in scope"; AC-01/02/22/23 và bước POS chứng minh bằng ảnh trong `07-verification.md` (backoffice chụp tay qua Chrome, POS headless qua `capture-pos-evidence.py`). Nợ kỹ thuật ghi trong `PR-DRAFT.md` |

## Rejected assumptions

| ID | What we assumed | What is actually true | Consequence |
| --- | --- | --- | --- |
| A-11 | Engine chưa hỗ trợ BR-002, phải viết mới | Engine **đã** đúng: `PromotionResolver` chạy pha chiếm dòng trước pha hóa đơn, `InvoiceDiscountStrategy` đã có nhánh `unclaimedLines` | UOW-02 co lại: sửa đường ghi + mở rộng nhánh sẵn có cho giảm-tay, không viết lại engine. Bỏ hẳn một UoW "engine BR-002" đã định |
| A-12 | "Giảm giá hàng hóa" chưa có form, phải dựng | `PromotionProductDiscount`, `GoodsDiscountPromotionSection`, `GoodsDiscountGrid` đã đủ và đã nối vào registry | UOW-01 từ "dựng form" thành "mở lối vào + chứng minh round-trip sau 5 tuần tắt đèn" — 1 dòng code, phần còn lại là test |
| A-13 | `ApplyScopePromotionSection` là radio đang lưu sai giá trị (một bug) | Nó **từng** là radio; `promotion-scope-points-toggle` ADR-01 (2026-08-17, accepted) cố ý gỡ bỏ và ép `ALL_ITEMS`, có test khẳng định | Đây không phải sửa bug mà là **đảo một quyết định đã ship**. Bắt buộc: ADR-01 của feature này ghi rõ supersede, và A-15 thừa nhận việc sửa test là chủ ý |
| A-16 | Mọi CTKM hóa đơn đã lưu đều là `ALL_ITEMS` (tiền đề tôi đưa ra ở vòng hỏi 1) | Đếm thật 2026-09-18: `erp_dev` 6 `NON_PROMO_ONLY` / 1 `ALL_ITEMS`; `erp_dev_3008` 1 / 1. Phần lớn **đã** đúng ý muốn hôm nay | Vòng hỏi 1 dựa trên tiền đề sai nên phải hỏi lại; A-01 đổi từ "bất biến" sang "radio", A-03 thêm vế cảnh báo UI. Quy mô "dữ liệu cần sửa" từ *toàn bộ* xuống *1 dòng mỗi DB* |
| A-18 | `promotion.mapper.spec.ts` là lưới an toàn đang giữ hành vi `ALL_ITEMS` | Nó là **mã nguồn chết**: `apps/backoffice-web/package.json` khai `"test": "echo test"`, không có vitest/jest config nào. Test đó chưa từng chạy lần nào | Vẫn sửa nó (để nguồn không khẳng định ngược với hành vi đã ship), nhưng **không** được tính là bằng chứng. Bằng chứng cho AC-15/AC-17 chuyển sang e2e phía API đọc thẳng DB, và AC-22/AC-23 sang ảnh chụp trình duyệt |
