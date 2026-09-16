# Runbook vận hành — Lưu trữ media (MinIO)

Feature `.ai/features/2026091301-media-storage`. Tài liệu này dành cho người vận hành máy production
(nginx + PM2 + Postgres + Redis + MinIO cùng một máy — A-07). Cấu hình nginx không nằm trong repo, nên
mọi snippet dưới đây phải được chép tay vào máy thật và kiểm lại bằng mục 10.

Mọi thứ trong feature đọc/ghi MinIO qua API S3 chuẩn (`@aws-sdk/client-s3`), không dùng SDK `minio`
(ADR-01). Trình duyệt tải lên **thẳng tới MinIO** bằng presigned POST (ADR-02) và đọc file riêng tư
bằng presigned GET, nên nginx phải proxy nguyên path và giữ nguyên `Host` — nếu không, chữ ký hỏng.

---

## 1. Service MinIO

| Mục | Giá trị |
|---|---|
| Image | `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z` (ghim ở `docker-compose.yml`; **không** dùng `latest`) |
| Lệnh | `minio server /data --address 127.0.0.1:9000 --console-address 127.0.0.1:9001` |
| Volume | Thư mục/volume riêng cho `/data` — xem mục 7 |
| Cổng | Chỉ nghe `127.0.0.1`. Không mở 9000/9001 ra ngoài; chỉ nginx (mục 6) được thấy |
| Credential root | `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD`, đặt cùng chỗ với `DB_PASS` hiện nay (A-07). Root chỉ dùng để chạy bootstrap (mục 5) và `mc`; API chạy bằng user riêng (mục 2) |

### Quyết định về tag (kiểm ngày 2026-09-15)

- `minio/minio` bản community đã archive; `docker.io/minio/minio` không còn kéo được. quay.io chỉ còn hai
  dòng tag đáng quan tâm: `RELEASE.2025-09-07T16-13-09Z` (bản thường cuối, 2025-09-07) và
  `RELEASE.2025-09-07T16-13-09Z.hotfix.7aa24e772` (đẩy 2026-04-01).
- **Không xác định được hotfix `7aa24e772` sửa gì**: commit đó không có trên `github.com/minio/minio`
  (API GitHub trả `No commit found for SHA: 7aa24e772`), và quay.io không kèm changelog. Nhánh hotfix
  của MinIO thường build riêng cho khách hàng, không public mã nguồn.
- Bản thường mới hơn có trên GitHub — `RELEASE.2025-10-15T17-29-55Z` (2025-10-16) — **vá CVE
  GHSA-jjjj-jwhf-8rgr** ("Privilege Escalation via Session Policy Bypass in Service Accounts and STS")
  nhưng **không có image trên quay.io**; MinIO yêu cầu tự clone và `make docker`.
- Mức phơi nhiễm với CVE này ở ERP: lỗi nằm ở STS / service account (endpoint gốc `/?Action=AssumeRole…`
  và API admin). Với cấu hình mục 6, nginx **chỉ** proxy `/erp-media-public/` và `/erp-media-private/`;
  MinIO nghe `127.0.0.1`; API dùng một access key tĩnh, không tạo service account hay STS. Đường tấn công
  của CVE không với tới được từ ngoài máy.
- **Quyết định**: giữ `RELEASE.2025-09-07T16-13-09Z` cho production **với điều kiện** MinIO nghe
  `127.0.0.1` và nginx chỉ proxy hai path bucket. Không đổi sang tag hotfix vì không rõ nội dung. Nếu
  người vận hành muốn vá CVE, đường đi đúng là build image `RELEASE.2025-10-15T17-29-55Z` từ nguồn theo
  release note và đổi `image:` trong `docker-compose.yml` — ghi lại tag mới vào bảng trên.

---

## 2. User MinIO riêng cho API

Local dùng root user làm access key. Production **không** — tạo user chỉ có quyền object trên hai bucket.
Chạy bằng `mc` trỏ tới MinIO bằng root:

```bash
mc alias set erp-root http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"

cat > /tmp/erp-media-api-policy.json <<'JSON'
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": [
        "arn:aws:s3:::erp-media-public/*",
        "arn:aws:s3:::erp-media-private/*"
      ]
    }
  ]
}
JSON

mc admin policy create erp-root erp-media-api /tmp/erp-media-api-policy.json
mc admin user add erp-root <MEDIA_S3_ACCESS_KEY> <MEDIA_S3_SECRET_KEY>
mc admin policy attach erp-root erp-media-api --user <MEDIA_S3_ACCESS_KEY>
```

Ba quyền này là đúng tất cả những gì API gọi lúc chạy: `HeadObject`/`GetObject` (xác nhận tải lên, ký
link đọc), presigned POST (`PutObject`), `DeleteObject` (job dọn). `CreateBucket`, `HeadBucket`,
`Get/PutBucketPolicy` chỉ bootstrap (mục 5) cần, và bootstrap chạy bằng root.

---

## 3. Biến môi trường

Bảy biến, đọc ở `apps/api/src/modules/media/media-storage.config.ts`. Thiếu bất kỳ biến nào, hai bucket
trùng tên, hoặc `NODE_ENV=production` mà giá trị giống mặc định dev → API coi storage là **chưa cấu
hình**: mọi thao tác media trả `503 STORAGE_UNAVAILABLE`, phần còn lại của ERP chạy bình thường.

| Biến | Production | Ghi chú |
|---|---|---|
| `MEDIA_S3_ENDPOINT` | `http://127.0.0.1:9000` | API → MinIO, nội bộ. Loopback là **hợp lệ** ở production (cùng máy, A-07) |
| `MEDIA_PUBLIC_BASE_URL` | `http://erp.giaymt.com.vn` | Origin trình duyệt dùng, **cũng là host presigned URL được ký**. Không được là loopback ở production |
| `MEDIA_S3_REGION` | `us-east-1` | MinIO không quan tâm, nhưng chữ ký SigV4 cần |
| `MEDIA_S3_ACCESS_KEY` | user ở mục 2 | Không được là `erp_media_access` (giá trị `.env.example`) |
| `MEDIA_S3_SECRET_KEY` | secret ở mục 2 | Không được là `erp_media_secret` |
| `MEDIA_BUCKET_PUBLIC` | `erp-media-public` | Ảnh hàng hoá; đọc ẩn danh |
| `MEDIA_BUCKET_PRIVATE` | `erp-media-private` | Ảnh nhân viên, đính kèm chứng từ; chỉ đọc qua presigned GET |

- **PM2**: `apps/api/ecosystem.config.cjs:68-74` đã whitelist đủ 7 biến; đặt chúng ở cùng chỗ với
  `DB_PASS` là đủ, không sửa gì thêm ở ecosystem.
- **`NODE_ENV`**: `app.module.ts` rơi về `.env.example` (`NODE_ENV=development`) cho biến nào chưa đặt.
  PM2 đặt `NODE_ENV=production` sẵn cho tiến trình API, nhưng **lệnh chạy tay** (mục 5, 8) thì không —
  phải đặt tường minh, nếu không guard chống cấu hình dev không chạy.
- Đổi tên bucket sau khi đã có dữ liệu là di chuyển object thủ công; đừng.

---

## 4. Thứ tự triển khai lần đầu

1. Dựng MinIO (mục 1), tạo user API (mục 2), đặt 7 biến (mục 3).
2. Đếm số dòng trước khi chạy migration (mục 9) và ghi lại.
3. `pnpm migration:run` — có `CreateMediaObjects` và `ClearBlobEmployeePhotoUrls` (không đảo được, xem mục 9).
4. Bootstrap bucket (mục 5).
5. Thêm nginx (mục 6), `nginx -t`, reload.
6. Deploy API + backoffice **cùng một lượt** (form nhân viên thôi ghi `blob:` cùng lúc migration dọn nó).
7. Kiểm tra sau triển khai (mục 10) — 5 phép thử, ghi kết quả vào bảng của T-05-02.

---

## 5. Bootstrap bucket — `media:bootstrap`

```bash
cd apps/api
NODE_ENV=production \
MEDIA_S3_ACCESS_KEY="$MINIO_ROOT_USER" MEDIA_S3_SECRET_KEY="$MINIO_ROOT_PASSWORD" \
pnpm media:bootstrap
```

Script `src/database/seeds/media-buckets.seed.ts`: không khởi động `AppModule`, không chạm Postgres/Kafka;
chỉ đọc 7 biến trên rồi gọi `ObjectStorageService.ensureBuckets()`. Chạy lại bao nhiêu lần cũng cùng kết
quả (AC-18). Nó làm đúng hai việc:

- **Bucket công khai**: tạo nếu chưa có, rồi `PutBucketPolicy` với policy cho phép `s3:GetObject` ẩn
  danh trên `arn:aws:s3:::erp-media-public/*`. **`PutBucketPolicy` ghi đè toàn bộ policy của bucket** —
  mọi rule đặt tay trước đó (ví dụ một `Deny`) sẽ mất mỗi lần chạy. Nếu cần rule riêng, đặt ở nginx,
  không đặt ở bucket policy.
- **Bucket riêng tư**: tạo nếu chưa có, rồi `GetBucketPolicy`. **Nếu bucket đã có policy, bootstrap dừng
  với lỗi** và không tự xoá — phải gỡ tay (`mc anonymous set none erp-root/erp-media-private` hoặc
  `mc admin policy`/console) rồi chạy lại.

Chạy bằng root như trên vì user API (mục 2) không có quyền bucket. Sau bootstrap, kiểm nhanh:

```bash
mc anonymous get erp-root/erp-media-public    # → download
mc anonymous get erp-root/erp-media-private   # → none
```

---

## 6. nginx — hai `location`, `client_max_body_size`, header

Thêm vào `server` block của `erp.giaymt.com.vn`, **một location cho mỗi bucket, tên location = tên
bucket** (A-06). Presigned URL ký cả `Host` lẫn path; proxy dưới một path con khác hoặc đổi `Host` làm
mọi link riêng tư trả 403.

```nginx
# ── Media (MinIO) ───────────────────────────────────────────────────────────
# proxy_pass KHÔNG kèm URI để nginx chuyển nguyên path /erp-media-*/... sang MinIO.
# Host phải là host trình duyệt gọi ($http_host), vì presigned URL ký trên host đó.

location /erp-media-public/ {
    proxy_pass         http://127.0.0.1:9000;
    proxy_http_version 1.1;
    proxy_set_header   Host $http_host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   Connection "";
    client_max_body_size 11m;              # nginx mặc định 1m → 413 trước khi tới MinIO
    proxy_request_buffering off;

    # Object key là duy nhất cho mỗi lần tải lên, không bao giờ bị ghi đè → cache vĩnh viễn.
    add_header Cache-Control "public, max-age=31536000, immutable" always;
    # A-27: file trong bucket công khai đọc được ngay khi tải lên; chặn trình duyệt đoán MIME.
    add_header X-Content-Type-Options nosniff always;
    add_header Content-Security-Policy "sandbox; default-src 'none'" always;
}

location /erp-media-private/ {
    proxy_pass         http://127.0.0.1:9000;
    proxy_http_version 1.1;
    proxy_set_header   Host $http_host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   Connection "";
    client_max_body_size 11m;
    proxy_request_buffering off;

    add_header X-Content-Type-Options nosniff always;
    add_header Content-Security-Policy "sandbox; default-src 'none'" always;
}
```

Ghi chú:

- `client_max_body_size 11m`: giới hạn lớn nhất của feature là 10 MiB (đính kèm chứng từ; ảnh hàng hoá
  2 MiB, ảnh nhân viên 5 MiB). Kích thước thật do policy `content-length-range` của presigned POST giới
  hạn theo **kích thước khai báo** của từng vé, nên 11m ở nginx chỉ là trần kỹ thuật.
- `add_header` trong `location` **thay thế** toàn bộ `add_header` kế thừa từ `server`. Nếu `server` block
  đang có header chung (HSTS, v.v.), chép lại chúng vào hai location này.
- **Không** đặt `Cache-Control` cho location riêng tư: link presigned chỉ sống 15 phút
  (`ATTACHMENT_URL_EXPIRES_SEC`), và cache chung sẽ giữ byte file sau khi link hết hạn.
- Cả hai bucket đều phải cho phép **POST** (tải lên) từ trình duyệt; đừng chặn method ở nginx.
- **HTTP thuần** (A-21): cho tới khi production có HTTPS, link presigned và byte file đi qua HTTP như
  access token hiện nay. Rủi ro nghe lén trong thời hạn URL; chủ sở hữu đã ghi nhận ở A-21. Khi có
  HTTPS, đổi `MEDIA_PUBLIC_BASE_URL` sang `https://…` — chữ ký không phụ thuộc scheme, nhưng URL đã cấp
  trước đó vẫn là `http://`.

---

## 7. Đĩa và quota (A-30)

MinIO dùng chung máy với Postgres. Feature giới hạn mỗi người dùng 100 file chưa gắn / 24 giờ
(`429 MEDIA_QUOTA_EXCEEDED`) nhưng vẫn để lọt tới ~2 GiB / người / tổ chức giữa hai lần job dọn. Chọn
**một** trong hai, làm trước khi mở cho người dùng:

```bash
# (a) quota bucket — MinIO từ chối PUT/POST khi đầy, Postgres không bị ảnh hưởng
mc quota set erp-root/erp-media-public  --size 20GiB
mc quota set erp-root/erp-media-private --size 50GiB
mc quota info erp-root/erp-media-private
```

```text
# (b) volume/phân vùng riêng cho /data của MinIO — đầy thì chỉ MinIO lỗi
```

Con số trên là gợi ý; chỉnh theo đĩa thật. Khi bucket đầy, người dùng thấy lỗi tải lên, không mất
dữ liệu.

---

## 8. Job dọn — `media:cleanup`

`MediaCleanupJob` (`apps/api/src/modules/media/media-cleanup.job.ts`) chạy **02:00 mỗi ngày** trong tiến
trình API (một tiến trình PM2, A-18), xuyên tổ chức:

1. Dòng `PENDING`/`UPLOADED` quá 24 giờ chưa được gắn → chuyển sang `DELETED`.
2. Dòng `DELETED` (bước 1, hoặc chủ sở hữu đã gỡ) đã quá hạn vé tải lên (10 phút + 60 giây bù lệch
   giờ) → xoá object, ghi `object_removed_at`. Dòng xoá lỗi được để lại cho lần chạy sau.

Không bao giờ chạm dòng `ATTACHED`. Chạy tay (idempotent, chạy trùng cron cũng vô hại):

```bash
cd apps/api && NODE_ENV=production pnpm media:cleanup
```

Cần Postgres (khác `media:bootstrap`). Theo dõi dung lượng bucket sau vài ngày: nếu tăng dù không có
người tải lên, job không chạy — kiểm log PM2 cho `MediaCleanupJob`.

---

## 9. Đếm trước khi triển khai

Hai việc không đảo được; ghi số trước và sau vào phần "Kết quả" của T-05-02 / UOW-04.

```sql
-- T-01-08: migration ClearBlobEmployeePhotoUrls đặt NULL các photo_url 'blob:%' (chưa bao giờ hiển thị được)
SELECT count(*) FROM employee_profiles WHERE photo_url LIKE 'blob:%';

-- UOW-04: đính kèm chứng từ chuyển sang media_objects; đếm dòng đã có attachment_ids
SELECT 'goods_receipts' t, count(*) FROM goods_receipts WHERE attachment_ids <> '[]'
UNION ALL SELECT 'transfer_orders', count(*) FROM transfer_orders WHERE attachment_ids <> '[]'
UNION ALL SELECT 'stock_transfers', count(*) FROM stock_transfers WHERE attachment_ids <> '[]'
UNION ALL SELECT 'cash_receipts',   count(*) FROM cash_receipts   WHERE attachment_ids <> '[]'
UNION ALL SELECT 'cash_payments',   count(*) FROM cash_payments   WHERE attachment_ids <> '[]'
UNION ALL SELECT 'bank_receipts',   count(*) FROM bank_receipts   WHERE attachment_ids <> '[]'
UNION ALL SELECT 'bank_payments',   count(*) FROM bank_payments   WHERE attachment_ids <> '[]';
```

Trên `erp_dev` ngày 2026-09-14 cả 7 bảng đều 0. Production chưa đo.

---

## 10. Kiểm tra sau triển khai (spike A-06)

Dùng `aws` CLI với credential user API (mục 2), **trỏ qua nginx**, không trỏ thẳng MinIO — mục đích là
kiểm nginx. Điền kết quả vào bảng "Kết quả spike" của T-05-02 kèm lệnh đã chạy.

```bash
export AWS_ACCESS_KEY_ID=<MEDIA_S3_ACCESS_KEY> AWS_SECRET_ACCESS_KEY=<MEDIA_S3_SECRET_KEY> AWS_DEFAULT_REGION=us-east-1
EP=http://erp.giaymt.com.vn

# chuẩn bị: một object mỗi bucket (PUT thẳng qua nginx cũng là một phép thử proxy)
echo spike > /tmp/spike.txt
aws --endpoint-url $EP s3 cp /tmp/spike.txt s3://erp-media-private/spike.txt
aws --endpoint-url $EP s3 cp /tmp/spike.txt s3://erp-media-public/spike.txt

# 1. presigned GET qua nginx → 200
URL=$(aws --endpoint-url $EP s3 presign s3://erp-media-private/spike.txt --expires-in 300)
curl -s -o /dev/null -w '%{http_code}\n' "$URL"

# 2. sửa một ký tự trong path → 403 (chữ ký ký cả path)
curl -s -o /dev/null -w '%{http_code}\n' "${URL/spike.txt/spikf.txt}"

# 3. object riêng tư không chữ ký → 403
curl -s -o /dev/null -w '%{http_code}\n' $EP/erp-media-private/spike.txt

# 4. object công khai không chữ ký → 200, và có header ở mục 6
curl -s -D - -o /dev/null $EP/erp-media-public/spike.txt | grep -iE '^(HTTP|cache-control|x-content-type-options|content-security-policy)'

# 5. presigned POST với content-length-range: 10 MB → 204, 12 MB → bị từ chối
#    Xin vé thật qua API (POST /media/uploads với ownerType=GOODS_RECEIPT, contentType=application/pdf, size=10485760)
#    rồi POST form như trình duyệt; hoặc thử trần nginx trước:
dd if=/dev/zero of=/tmp/10mb bs=1M count=10; dd if=/dev/zero of=/tmp/12mb bs=1M count=12
aws --endpoint-url $EP s3 cp /tmp/10mb s3://erp-media-private/spike-10mb   # OK
aws --endpoint-url $EP s3 cp /tmp/12mb s3://erp-media-private/spike-12mb   # nginx 413 (client_max_body_size)

# dọn
aws --endpoint-url $EP s3 rm s3://erp-media-private/spike.txt
aws --endpoint-url $EP s3 rm s3://erp-media-public/spike.txt
aws --endpoint-url $EP s3 rm s3://erp-media-private/spike-10mb
```

Phép thử 1 hoặc 5 sai → **dừng phát hành**, `aidlc reopen G2 --reason "<kết quả>"`: nghĩa là nginx làm
lệch host/path (đổi cách proxy) hoặc giới hạn kích thước không như thiết kế.

---

## 11. Việc còn chưa có người nhận

| Việc | Assumption | Trạng thái |
|---|---|---|
| Backup volume MinIO (cùng lịch với backup Postgres; object và dòng `media_objects` phải khớp) | A-07 | Chưa có người nhận. **Chặn phát hành** cho tới khi có |
| Người vận hành tạo credential, bucket, nginx theo runbook này | A-07 | Chưa có người nhận |
| HTTPS cho `erp.giaymt.com.vn` | A-21 | Chủ sở hữu ghi nhận rủi ro HTTP thuần; chưa có kế hoạch |
| Đo lại số dòng mục 9 trên production trước khi chạy migration | T-01-08, UOW-04 | Chưa đo |
| Build image `RELEASE.2025-10-15T17-29-55Z` nếu muốn vá GHSA-jjjj-jwhf-8rgr | mục 1 | Quyết định để mở, mặc định giữ tag đang ghim |
