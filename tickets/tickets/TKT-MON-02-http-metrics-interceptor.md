# TKT-MON-02 BE: HTTP metrics interceptor

## Epic

[EPIC-07072026 API monitoring — Prometheus metrics](../epics/EPIC-07072026-api-metrics-monitoring.md)

## Summary

Global interceptor đo mọi HTTP request: `http_request_duration_seconds` (Histogram) +
`http_requests_total` (Counter), label `method` / `route` / `status_code`. Mô phỏng
`LoggingInterceptor` (timing bằng `Date.now()`, `tap({next,error})`). Đăng ký như `APP_INTERCEPTOR`
thứ 4 trong `common.module.ts`.

## Deliverables

- `apps/api/src/modules/metrics/metrics.service.ts` — thêm 2 metric object (`httpDuration`,
  `httpTotal`) đăng ký vào registry; helper `observeHttp(method, route, statusCode, seconds)`.
- `apps/api/src/modules/metrics/metrics.interceptor.ts` — `MetricsInterceptor implements
  NestInterceptor`, lấy `route = request.route?.path ?? 'unmatched'`, `statusCode` từ response
  (và từ `error.status`/`500` ở nhánh error), gọi `observeHttp`.
- `apps/api/src/common/common.module.ts` — thêm
  `{ provide: APP_INTERCEPTOR, useClass: MetricsInterceptor }` sau `IdempotencyInterceptor`.

## Acceptance Criteria

- [ ] Sau vài request, `/metrics` có `http_requests_total{method,route,status_code}` và
      `http_request_duration_seconds_bucket{...}`.
- [ ] Label `route` là **route pattern** (`/pos/invoices/:id`), không phải URL thô có id/query.
- [ ] Request không match route (404) → label `route="unmatched"` (không sinh label từ path thô).
- [ ] Nhánh error vẫn ghi metric với `status_code` đúng (từ exception status, fallback 500).
- [ ] Khi `METRICS_ENABLED=false`, interceptor no-op (không đăng ký/observe), không lỗi.

## Definition of Done

- [ ] `pnpm --filter @erp/api build` + `test` xanh.
- [ ] Interceptor đứng sau Idempotency, không đổi thứ tự các interceptor hiện có.
- [ ] No Vietnamese trong backend source.
- [ ] Không đổi endpoint shape → KHÔNG cần `openapi:generate`.

## Tech Approach

```ts
// metrics.service.ts (thêm)
this.httpDuration = new Histogram({
  name: `${this.prefix}http_request_duration_seconds`,
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [this.registry],
});
this.httpTotal = new Counter({
  name: `${this.prefix}http_requests_total`,
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [this.registry],
});
observeHttp(method: string, route: string, statusCode: number, seconds: number) {
  if (!this.enabled) return;
  const labels = { method, route, status_code: String(statusCode) };
  this.httpDuration.observe(labels, seconds);
  this.httpTotal.inc(labels);
}
```

```ts
// metrics.interceptor.ts
intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
  const http = context.switchToHttp();
  const request = http.getRequest<Request>();
  const response = http.getResponse<Response>();
  const method = request.method;
  const start = Date.now();
  const record = (statusCode: number) => {
    const route = request.route?.path ?? 'unmatched';
    this.metrics.observeHttp(method, route, statusCode, (Date.now() - start) / 1000);
  };
  return next.handle().pipe(
    tap({
      next: () => record(response.statusCode),
      error: (err) => record(err?.status ?? 500),
    }),
  );
}
```

## Testing Strategy

- Unit (`metrics.interceptor.spec.ts`, MON-05): route từ `route.path`; fallback `unmatched`; nhánh
  error dùng `err.status`.

## Dependencies

- Depends on: TKT-MON-01
- Blocks: TKT-MON-05
