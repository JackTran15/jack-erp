# TKT-MON-05 Tests + docs

## Epic

[EPIC-07072026 API monitoring — Prometheus metrics](../epics/EPIC-07072026-api-metrics-monitoring.md)

## Summary

Chốt epic bằng unit test cho MetricsService + MetricsInterceptor và cập nhật tài liệu observability.

## Deliverables

- `apps/api/src/modules/metrics/metrics.service.spec.ts`:
  - enabled → `metrics()` trả text chứa default metric + prefix; helper HTTP/domain tăng counter.
  - disabled (`METRICS_ENABLED=false`) → helper no-op, `metrics()` không throw.
- `apps/api/src/modules/metrics/metrics.interceptor.spec.ts`:
  - dùng `request.route?.path`; fallback `unmatched` khi không có route; nhánh error dùng
    `err.status`.
- `docs/02-architecture.md` (§Observability) — cập nhật từ "intended" → đã cài: endpoint `/metrics`,
  danh sách metric name, dashboard, env `METRICS_ENABLED`/`METRICS_PREFIX`.

## Acceptance Criteria

- [ ] `pnpm --filter @erp/api test -- metrics` xanh; cả nhánh enabled + disabled.
- [ ] Interceptor spec phủ: route pattern, fallback `unmatched`, error status.
- [ ] Docs phản ánh đúng metric name + cách bật/tắt.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` toàn bộ xanh; build xanh.
- [ ] No Vietnamese trong backend source (specs/comment English).
- [ ] No TODO/FIXME ngoài kế hoạch.

## Tech Approach

```ts
// metrics.service.spec.ts
it('exposes default metrics when enabled', async () => {
  const svc = new MetricsService(configWith({ METRICS_ENABLED: 'true' }));
  expect(await svc.metrics()).toContain('erp_process_cpu_seconds_total');
});
it('is a no-op when disabled', async () => {
  const svc = new MetricsService(configWith({ METRICS_ENABLED: 'false' }));
  svc.observeHttp('GET', '/x', 200, 0.01); // must not throw
  expect(await svc.metrics()).not.toContain('http_requests_total');
});
```

## Testing Strategy

- Unit only; endpoint auth đã chứng minh qua `@Public()` (không cần e2e riêng, có thể thêm 1 e2e nhẹ
  nếu muốn).

## Dependencies

- Depends on: TKT-MON-02, TKT-MON-03, TKT-MON-04
- Blocks: —
