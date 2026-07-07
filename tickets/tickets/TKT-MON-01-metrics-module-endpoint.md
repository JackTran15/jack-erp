# TKT-MON-01 BE: prom-client + MetricsModule + `/metrics` endpoint + default metrics

## Epic

[EPIC-07072026 API monitoring — Prometheus metrics](../epics/EPIC-07072026-api-metrics-monitoring.md)

## Summary

Nền tảng metrics. Thêm `prom-client`, dựng `MetricsModule` (`@Global`) sở hữu 1 `Registry` qua
`MetricsService`, và expose `GET /metrics` (`@Public()` + `@ApiExcludeEndpoint()`). Khi khởi động,
`MetricsService` gọi `collectDefaultMetrics` (process CPU/memory/GC/event-loop) trừ khi
`METRICS_ENABLED=false`. Đây là dependency cho MON-02/03/04.

## Deliverables

- `apps/api/package.json` — thêm `prom-client` (`^15.x`) vào `dependencies`.
- `apps/api/src/modules/metrics/metrics.service.ts` — sở hữu `Registry`, đọc `METRICS_ENABLED`/
  `METRICS_PREFIX` qua `ConfigService`, gọi `collectDefaultMetrics`, expose `getRegistry()` +
  `contentType` + typed getters (mở rộng ở MON-02/03).
- `apps/api/src/modules/metrics/metrics.controller.ts` — `@Controller('metrics')`, `@Public()`,
  `GET` với `@ApiExcludeEndpoint()`; set `Content-Type` = `register.contentType`, trả
  `await register.metrics()`.
- `apps/api/src/modules/metrics/metrics.module.ts` — `@Global()`, provides + exports
  `MetricsService`, declares `MetricsController`.
- `apps/api/src/app.module.ts` — import `MetricsModule`.
- `apps/api/.env.example` (+ `.env`) — `METRICS_ENABLED=true`, `METRICS_PREFIX=erp_`.

## Acceptance Criteria

- [ ] `GET /metrics` trả `200`, `Content-Type: text/plain; version=0.0.4`, có `# HELP`/`# TYPE`,
      **không cần** `Authorization`.
- [ ] Có default metrics với prefix (vd `erp_process_cpu_seconds_total`).
- [ ] `/metrics` **không** xuất hiện trong `/docs-json` (đã `@ApiExcludeEndpoint`).
- [ ] `METRICS_ENABLED=false` → `collectDefaultMetrics` không chạy, endpoint trả text rỗng, không lỗi.
- [ ] `MetricsService` là 1 instance duy nhất (Registry không nhân đôi khi hot-reload/nhiều import).

## Definition of Done

- [ ] `pnpm --filter @erp/api build` xanh; `pnpm --filter @erp/api test` xanh.
- [ ] Không schema change; `synchronize` vẫn false.
- [ ] `/metrics` không vào Swagger → KHÔNG cần `openapi:generate`.
- [ ] No Vietnamese trong backend source (comment/log/swagger English).
- [ ] No TODO/FIXME ngoài kế hoạch.

## Tech Approach

```ts
// metrics.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Registry, collectDefaultMetrics } from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry = new Registry();
  readonly enabled: boolean;
  readonly prefix: string;

  constructor(config: ConfigService) {
    this.enabled = config.get<string>('METRICS_ENABLED', 'true') !== 'false';
    this.prefix = config.get<string>('METRICS_PREFIX', 'erp_');
    if (this.enabled) {
      collectDefaultMetrics({ register: this.registry, prefix: this.prefix });
    }
  }
  get contentType(): string { return this.registry.contentType; }
  metrics(): Promise<string> { return this.registry.metrics(); }
  getRegistry(): Registry { return this.registry; }
}
```

```ts
// metrics.controller.ts
@ApiExcludeEndpoint()
@Public()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}
  @Get()
  async scrape(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', this.metrics.contentType);
    res.send(await this.metrics.metrics());
  }
}
```

## Testing Strategy

- Unit (`metrics.service.spec.ts`, ở MON-05): registry sinh text khi enabled; no-op khi disabled.
- Manual: `curl -i localhost:4000/metrics` không kèm token.

## Dependencies

- Depends on: —
- Blocks: TKT-MON-02, TKT-MON-03, TKT-MON-04
