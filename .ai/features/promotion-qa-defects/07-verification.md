---
feature: promotion-qa-defects
environments: [local-pos]
viewports: [desktop]
---

# Verification — Sửa 10 lỗi QA (khuyến mại / điểm / báo cáo)

Chỉ khai báo `local-pos`. Một bảng Steps chạy trên **mọi** environment mà feature khai báo, nên
đường dẫn POS và đường dẫn backoffice không được nằm chung một bảng — xem `## Not verified here`
cho phần backoffice.

Desktop-only: cả hai app là màn hình quầy / back-office, không có layout mobile. Thêm viewport
mobile chỉ đẻ ra checkbox được tick mà không ai thật sự nhìn màn 390px.

## Steps

| ID | Step | Path | Interaction | Verifies | Assert |
|---|---|---|---|---|---|
| S1 | Giỏ hàng rỗng: không có dòng "Khuyến mại", cũng không có ô xám đang tải | `/` | — | AC-14 | `no-text=Khuyến mại` |
| S2 | Báo cáo theo ngày: mục Thu có cả dòng Điểm lẫn Khuyến mại | `/daily-report` | — | AC-27 | `text=Khuyến mại; text=Điểm` |
| S3 | Báo cáo nói rõ Điểm/Khuyến mại không nằm trong tổng — TỔNG không bằng tổng số học các dòng là có chủ ý | `/daily-report` | — | AC-29 | `text=không tính vào tổng thu` |
| S4 | Danh sách hóa đơn mở được, là nơi đối chiếu số của một hóa đơn cụ thể | `/invoices` | — | AC-31 | `text=Số hóa đơn` |

## Not verified here

Bốn bước trên là những gì **thật sự quan sát được** bằng ≤3 thao tác trên một trang. Phần còn lại
cố tình không đưa vào, kèm thứ đang phủ nó — thà nói rõ còn hơn để người đọc sau tưởng ảnh chụp bị
thiếu:

- **AC-01…AC-05 (hoàn tiền trả hàng), AC-06…AC-08 (kẹp điểm), AC-09/AC-10 (huỷ đơn hoàn điểm)** —
  đều là **giao dịch nhiều bước** (bán → trả → đối chiếu phiếu chi; bán → đổi điểm → xem thẻ;
  bán → huỷ → xem số dư). Bốn động từ `click/fill/wait/scroll` không dựng nổi một phiên bán hàng,
  và ép vào sẽ thành script giòn hơn là bằng chứng. Đang được phủ bởi unit test bám đúng số của QA:
  `checkout-return.service.spec.ts` (34 test, gồm 400 / 1.229.000 / không chi đồng nào cho HĐ trả
  bằng điểm), `clamp-points.step.spec.ts` (10 test, gồm ca 928/72), `cancel-invoice.service.spec.ts`
  (29 test, gồm số dư thẻ về đúng 4.165 — và đã kiểm test này **đỏ** khi gỡ bản vá).
- **AC-11, AC-13 (không tích điểm cho khách vãng lai)** — AC-11 là trạng thái DB, đã đối chiếu trực
  tiếp: `select count(*) from invoices where customer_id is null and points_earned <> 0` → **0**.
  AC-13 đòi lật cờ `VITE_CHECKOUT_V2` rồi build lại, không phải việc của một lần chụp màn hình;
  phủ bởi test song song ở cả hai luồng (`checkout-invoice.service.spec.ts` +
  `persist-invoice.step.spec.ts`).
- **AC-12 (biên lai không có dòng "Điểm được tích")** — cần in/mở biên lai của **một hóa đơn vãng
  lai cụ thể**, tức phải bám vào id hàng trong danh sách. Cố ý không hardcode id vào Path (luật của
  package). Sau khi có phiên đăng nhập, đây là ứng viên số một để thêm bước.
- **AC-15…AC-18 (lý do CTKM không áp)** — cần dữ liệu dựng sẵn: một CTKM `Ngừng theo dõi`, một CTKM
  ngoài khoảng ngày, một CTKM sai chi nhánh. `erp_dev` hiện chỉ có KM000001/KM000002 đều đang chạy.
  Không tự ý đổi trạng thái CTKM của môi trường test — xem `## Notes`.
- **AC-19…AC-22 (giờ áp dụng)** — phụ thuộc **giờ hệ thống lúc chạy**. Một bước chụp màn lúc 09:00
  và lúc 19:00 cho hai kết quả trái ngược mà cùng đúng; đó là thứ thuộc về unit test, không thuộc
  về ảnh chụp. `time-window.spec.ts` 24/24.
- **AC-23…AC-26 (chặn CTKM thiếu dữ liệu)** — nằm ở **backoffice** (`localhost:3000`), không cùng
  environment với bảng này. Phủ bởi `promotion-program.spec.ts` (31) và 5 spec strategy (29).
- **AC-28, AC-30 (số của báo cáo khớp sổ quỹ)** — S2/S3 chứng minh **giao diện** đã có; còn con số
  +2.527.000 cần đúng bộ dữ liệu ngày 13/08. Đang phủ bởi ca tái dựng nguyên bộ số đó trong
  `get-pos-daily-summary.handler.spec.ts` (`reconciles the QA day against the cash book`).

## Trạng thái hiện tại — CHẬP CHỜN, không tin được

Đã có lúc xanh **4/4** (bằng chứng trong `evidence/`, ảnh S1 và S3 là thật). Nhưng **sau đó đỏ 4
lần liên tiếp** với API còn sống, cùng một lý do `redirected to sign-in`. Tức bản sửa
`wait text=Tổng tiền` **chỉ thu hẹp cửa sổ đua, không đóng được nó**.

⚠️ **Đừng tick ô nào dựa trên một lần xanh.** Một suite chập chờn còn tệ hơn không có suite: nó
dạy người ta bỏ qua màu đỏ. `evidence_check.py` có lúc báo UOW-07 sạch, nhưng kết quả đó không
lặp lại được nên **không dùng làm căn cứ đóng gate**.

Nguyên nhân gốc vẫn đúng như mô tả bên dưới (phiên bị xoay giữa lúc chụp), chỉ là cách sửa bằng
`wait` trên một chuỗi text **không đủ tất định**: thứ cần đợi là lệnh ghi localStorage sau khi
`switch-branch` trả token mới, mà 4 động từ của runner không diễn đạt được.

Muốn dùng thật thì phải chọn một trong hai:
- Nới rotation cho tài khoản test (refresh không revoke jti cũ ngay), hoặc
- Dạy runner đăng nhập lại cho **mỗi** browser context thay vì phát lại một phiên đã lưu.

Cả hai đều nằm ngoài phạm vi đợt sửa 10 lỗi QA.

### Đã vấp gì và sửa thế nào (giữ lại vì dễ tái phát)

Ban đầu cả 4 bước đỏ với `redirected to sign-in — the session was not accepted`. Hai nguyên nhân
**khác nhau** bị lẫn vào nhau:

1. **API tự chết lúc 21:56.** Mấy lần chạy báo `credentials rejected` xảy ra **sau** thời điểm đó,
   tức là đang đấu với một server đã tắt. Đường vòng `vite preview` + `VITE_API_BASE_URL` sinh ra từ
   chẩn đoán sai này → đã **bỏ**, `dist` build lại sạch, preview đã tắt.
2. **Đua rotation phiên đăng nhập — có thật.** Với API chắc chắn sống, vẫn đỏ. Giải mã `jti` trong
   token đã lưu rồi soi Redis mới chốt được: `erp:session:*` có tồn tại, nhưng `jti` đã lưu **không**
   nằm trong đó. Chọn chi nhánh gọi `POST /auth/switch-branch`, hàm này `revokeSession(jti cũ)` rồi
   cấp cặp token mới — phiên bị chụp **giữa lúc đang xoay**, nên refresh token lưu lại đã chết.

   **Sửa**: thêm `wait text=Tổng tiền` vào cuối `post_login`, đợi màn bán hàng render xong rồi mới
   chụp phiên → token lưu là token sau khi xoay.

   *Giả thuyết đã tự bác*: lúc đầu đổ cho React `StrictMode` gọi refresh hai lần. Sai —
   `http.ts:11` có `refreshPromise` gom các lời gọi đồng thời. Ghi lại để người sau khỏi đi lại
   đường cụt đó.

## Notes

- Thông tin đăng nhập nằm ở `.ai/credentials.env` (đã gitignore, do người dùng tự tạo). Runner đọc
  và tự điền; không có mật khẩu nào bị ghi ra bởi cấu hình này.
- `local-backoffice` đã có khối `auth:` riêng trong `.ai/aidlc.yaml` (id `#login-*`, khác POS
  `#pos-login-*`, nên **không** kế thừa được khối global). Nhưng nó **chưa từng chạy**: feature này
  khai báo `environments: [local-pos]`, và `--env local-backoffice` trả đúng
  *"07-verification.md declares no environment that is runnable"*. Cấu hình có, **chưa được chứng
  minh** — đừng coi là đã kiểm.
- Cần chạy: API `:4000`, POS `:3001` (và `:3000` nếu sau này verify backoffice). API từng tự chết
  giữa chừng — kiểm `curl localhost:4000/docs-json` trước khi kết luận một lần đỏ là lỗi thật.
- Nếu quay lại dùng `recipe: storage-state` + `--manual-login`: đăng nhập xong **chọn luôn chi
  nhánh** ở `/chon-chi-nhanh` trước khi đóng trình duyệt — lựa chọn đó nằm trong localStorage và
  được lưu cùng phiên.
- `apps/pos-web/.env` phải có `VITE_CHECKOUT_V2=true` (đã kiểm: có). Thiếu cờ này thì POS rơi về
  luồng v1 và toàn bộ hành vi khuyến mại quan sát được sẽ khác.
- Cần API chạy ở `:4000` và POS ở `:3001`.
- **Không** dựng dữ liệu bằng cách sửa thẳng CTKM/hoá đơn trong `erp_dev` chỉ để làm xanh một bước.
  Muốn phủ AC-15…AC-18 thì tạo CTKM test riêng và ghi rõ trong ticket, đừng đổi trạng thái cái
  đang có.
