---
id: UOW-05
slug: storage-cleanup-and-production
title: File rác tự được dọn và storage chạy được sau nginx production
demoable: true
duration: 1d
depends_on: [UOW-01]
requirements: [US-05]
verifies: [AC-20]
risk: medium
status: todo
rollback: Revert commit của job — không có dữ liệu nào đổi hình dạng; runbook là tài liệu, gỡ hai `location` nginx thì trình duyệt không còn với tới storage
---

# UOW-05 — File rác tự được dọn và storage chạy được sau nginx production

## Demo script
1. Local: xin vé tải lên, tải file, xác nhận, **không** gắn vào chủ sở hữu nào
2. `UPDATE media_objects SET created_at = now() - interval '25 hours' WHERE id = '<id>'`
3. `pnpm --filter @erp/api media:cleanup` → dòng đó chuyển `DELETED`, có `object_removed_at`; object biến mất khỏi console MinIO
4. Một ảnh nhân viên đã gắn từ demo UOW-01 vẫn còn nguyên
5. Staging/production (theo runbook): `curl` một presigned GET qua `http://erp.giaymt.com.vn/erp-media-private/...` → 200; tải lên một file 10 MB qua trình duyệt → thành công, không bị 413 ở nginx

## In scope
- `MediaCleanupJob` hằng ngày và lệnh chạy tay
- Spike xác minh A-06 trên nginx thật, runbook vận hành

## Not in scope
- HA, replication, backup MinIO (A-07)
- Chuyển sang HTTPS (A-21)

## Risks

| Risk | Mitigation |
|---|---|
| A-06 sai: proxy theo path làm lệch chữ ký presigned GET | T-05-02 không phụ thuộc ticket nào nên chạy từ wave đầu; nếu sai thì `aidlc reopen G2` trước khi UOW-04 bắt đầu |
| Chưa có người nhận vận hành MinIO production (A-07) | Runbook liệt kê từng việc vận hành; phát hành bị chặn cho tới khi có người nhận |
| Job xoá nhầm file đã gắn | Job chỉ chạm `PENDING`/`UPLOADED` quá 24 giờ và `DELETED`; có test cho file `ATTACHED` |

## Definition of done
- [ ] AC-20 pass
- [ ] Kết quả spike A-06 (lệnh, output, ngày) ghi trong T-05-02
- [ ] Runbook có đủ: hai `location` nginx, `client_max_body_size`, bootstrap bucket, biến môi trường, `Cache-Control` cho bucket công khai
- [ ] `pnpm --filter @erp/api test` xanh
- [ ] Demo và nghiệm thu tại gate G4
