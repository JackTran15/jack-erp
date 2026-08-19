---
id: UOW-03
slug: api-key-cache
title: Cache lookup key + invalidate ngay khi thu hồi/sửa
demoable: true
duration: 1d
depends_on: [UOW-02]
requirements: [US-06]
verifies: [AC-07, AC-11, AC-12]
risk: medium
status: todo
rollback: bỏ lớp cache trong ApiKeyAuthService.validate() (quay lại query DB mỗi lần) — không đổi entity/schema, revert an toàn
---

# UOW-03 — Cache lookup key, "không spam backend"

## Demo script
1. Gọi lại đúng request đã demo ở UOW-02 hai lần liên tiếp với cùng key.
2. Xem log/metric: lần 2 không phát sinh query DB mới cho việc xác thực key (cache hit).
3. Thu hồi key đó qua backoffice (UOW-01) ngay giữa TTL.
4. Gọi lại request thứ 3 → 401 ngay lập tức, không phải đợi hết TTL.

## In scope
- Bọc `CacheService.getOrSet` quanh phần lookup DB trong `ApiKeyAuthService.validate()`
- Nối `CacheService.invalidate` (hook đã có sẵn từ T-01-03) với cache thật

## Not in scope
- Rate limiting (ngoài phạm vi feature — xem 00-intent.md § Out of scope)

## Risks
| Risk | Mitigation |
|---|---|
| TTL quá dài → thu hồi cảm giác "không có tác dụng ngay" | Invalidate chủ động ngay khi revoke/sửa (T-03-02); TTL chỉ là chặn trên cho trường hợp lỡ quên gọi invalidate |

## Definition of done
- [x] AC-07, AC-11, AC-12 pass (e2e thật 3/3, xem T-03-03 — AC-11 đo bằng spy thật trên
      `repository.findOne`, không suy luận)
- [ ] Demoed and accepted at gate G4
