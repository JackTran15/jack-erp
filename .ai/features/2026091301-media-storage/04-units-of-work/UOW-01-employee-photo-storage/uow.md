---
id: UOW-01
slug: employee-photo-storage
title: Ảnh nhân viên được lưu thật trên MinIO và chỉ người có quyền xem được
demoable: true
duration: 2d
depends_on: []
requirements: [US-01, US-02, US-03, US-04, US-05]
verifies: [AC-03, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-17, AC-18, AC-19]
risk: high
status: todo
rollback: Revert các commit của UoW. Migration `CreateMediaObjects` có `down` xoá bảng; migration dọn `blob:` không đảo được nhưng giá trị bị xoá vốn không hiển thị được ở đâu (A-13). Gỡ `MediaModule` khỏi `app.module.ts` thì mọi route `/media/*` biến mất
---

# UOW-01 — Ảnh nhân viên được lưu thật trên MinIO và chỉ người có quyền xem được

Slice này mang theo toàn bộ nền tảng media (MinIO local, bảng, storage, vé tải lên, gắn/gỡ, ký
link đọc). Ảnh nhân viên được chọn làm lát cắt đầu tiên vì nó đi qua **cả** đường ghi lẫn đường
đọc riêng tư với ít code nghiệp vụ nhất.

## Demo script
1. `docker compose up -d` rồi `pnpm --filter @erp/api media:bootstrap` → console MinIO ở `:9001` có 2 bucket; chạy lại lệnh bootstrap lần hai vẫn thành công
2. Đăng nhập backoffice `:3000`, mở một nhân viên, chọn ảnh ~1 MB, lưu
3. Tải lại trang → ảnh vẫn hiện. DevTools → Network: request tải file đi tới `/erp-media-private`, **không** có header `Authorization`; `photoUrl` là link có tham số `X-Amz-*`
4. Copy link ảnh, bỏ phần query → storage trả 403
5. Chọn file 6 MB → thông báo lỗi tiếng Việt, không có request tải lên nào
6. `docker compose stop minio`, khởi động lại API → API vẫn lên; chọn ảnh → toast "Không thể tải tệp lên lúc này", dữ liệu form còn nguyên
7. Chạy `SELECT count(*) FROM employee_profiles WHERE photo_url LIKE 'blob:%'` → 0

## In scope
- MinIO local, biến môi trường, proxy Vite mô phỏng nginx
- Module `media`: bảng `media_objects`, `ObjectStorageService`, vé tải lên + xác nhận, `MediaLinkService`, `MediaQueryService`
- Ảnh nhân viên end-to-end, dọn giá trị `blob:` cũ
- E2E chạy với storage giả, không cần MinIO

## Not in scope
- Ảnh hàng hoá (UOW-02)
- URL ảnh trong POS và API đối tác (UOW-03)
- Đính kèm chứng từ và `download-url` (UOW-04)
- Job dọn file rác, nginx production (UOW-05)

## Risks

| Risk | Mitigation |
|---|---|
| Proxy theo path làm lệch chữ ký presigned GET (A-06) | Local mô phỏng bằng Vite proxy (T-01-01); production xác minh ở T-05-02, chạy song song từ wave đầu |
| E2E boot `AppModule` thật, CI không có object store (M10) | T-01-03 không gọi mạng khi khởi tạo; T-01-11 thay provider bằng storage giả |
| Nhiều ticket song song cùng cần đăng ký class trong `media.module.ts` | Quyết định G3: T-01-02 dựng stub và đăng ký sẵn cả 9 class; không ticket nào sau sửa file module |
| T-01-04, T-01-07 (và T-03-02, T-04-01 ở UoW khác) cùng sinh lại `schema.ts` + `openapi.snapshot.json` | Quyết định G3: mỗi ticket chỉ sinh lại sau khi rebase lên main, ngay trước khi merge, không bao giờ song song; partner-catalog T-05-03 cũng tuân theo |
| Migration dọn `blob:` không đảo được | T-01-08 đếm và ghi số dòng bị ảnh hưởng trước khi chạy ở mỗi môi trường |
| Migration dọn `blob:` lên môi trường trước khi form thôi ghi `blob:` → dọn bị vô hiệu | T-01-08 chỉ triển khai cùng release với T-01-07 và T-01-10 (cả nhánh phát hành một lần); đếm lại sau triển khai |

## Definition of done
- [ ] AC-03, AC-07, AC-08, AC-09, AC-10, AC-11, AC-12, AC-17, AC-18, AC-19 pass
- [ ] Demo chạy trên một máy vừa `docker compose up -d`
- [ ] `rtk proxy grep -rn "FileInterceptor" apps/api/src` không nhiều hơn ở `743b485a`; `rtk proxy grep -rn "from 'minio'" apps/api/src` rỗng
- [ ] `pnpm --filter @erp/api test` xanh; `pnpm --filter @erp/api test:e2e` xanh khi MinIO tắt (đọc output thật, không chỉ exit code)
- [ ] `pnpm openapi:generate` đã chạy; `schema.ts` + `openapi.snapshot.json` được commit
- [ ] Demo và nghiệm thu tại gate G4
- [ ] **Trước merge — client** (T-01-04, T-01-07): rebase lên `main`, chạy `pnpm openapi:generate` một lần từ commit sạch,
  commit `schema.ts` + `openapi.snapshot.json`. Không sinh song song với T-03-02, T-04-01 hay partner-catalog T-05-03.
- [ ] **Trước merge — trình duyệt** (T-01-09): với phiên đăng nhập có `iam.user.write` hoặc `inventory.write`, (1) tải
  một file thật tới `/erp-media-private` và thấy request không có `Authorization`, `X-Branch-Id`, `X-Idempotency-Key`;
  (2) tắt MinIO, chọn file → "Không thể tải tệp lên lúc này.", form không vỡ.
- [ ] **Trước merge — build** (T-01-09): `pnpm --filter @erp/backoffice-web build` xanh toàn app (lỗi `user-form.ts(55,5)` hết sau T-01-10).
- [ ] **Trước merge — e2e** (T-01-11): `MEDIA_S3_ENDPOINT=http://127.0.0.1:1 pnpm --filter @erp/api test:e2e -- media-upload`
  xanh trên code cuối; chạy toàn bộ e2e trên `main` và trên nhánh (không chạy API dev song song vì dùng chung consumer
  group Kafka), không suite nào PASS trên `main` mà FAIL trên nhánh. `main` đã có suite FAIL sẵn (xem T-01-11).
  - 2026-09-14: `media-upload` chạy lại trên code cuối (trong lượt T-02-03) → 1/1 suite, 5/5 test. Phần so sánh toàn bộ còn nợ.
