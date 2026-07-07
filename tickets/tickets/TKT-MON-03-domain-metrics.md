# TKT-MON-03 BE: domain metrics (events / redis / pos / csv)

## Epic

[EPIC-07072026 API monitoring — Prometheus metrics](../epics/EPIC-07072026-api-metrics-monitoring.md)

## Summary

Instrument các chokepoint nghiệp vụ đã liệt kê ở `docs/02-architecture.md`. Inject `MetricsService`
tại mỗi điểm; chỉ thêm vài dòng, **không đổi business logic**. Tất cả metric dùng `METRICS_PREFIX`.

## Deliverables

- `apps/api/src/modules/metrics/metrics.service.ts` — khai báo domain metric object + helper:
  - `kafka_events_published_total{topic}`, `kafka_publish_duration_seconds{topic}`,
    `kafka_publish_errors_total{topic}` → helpers `observeKafkaPublish(topic, seconds)`,
    `incKafkaPublishError(topic)`.
  - `redis_cache_hits_total`, `redis_cache_misses_total` → `incCacheHit()`, `incCacheMiss()`.
  - `pos_checkout_duration_seconds`, `pos_checkout_total{result}` →
    `observeCheckout(result, seconds)`.
  - `inventory_import_rows_total{result}`, `inventory_import_jobs_total{result}` →
    `incImportRows(result, n)`, `incImportJob(result)`.
- `apps/api/src/modules/events/event-publisher.service.ts` — bọc `publish` (và `publishBatch`) đo
  duration + inc counter; inc error trên throw (giữ nguyên rethrow).
- `apps/api/src/modules/redis/cache.service.ts` — inc hit khi `get` trả giá trị, miss khi null.
- `apps/api/src/modules/pos/services/checkout-invoice.service.ts` — bọc entrypoint checkout đo
  duration + `result="success|error"`.
- `apps/api/src/modules/inventory/csv/csv-import.service.ts` — inc `inventory_import_rows_total`
  theo success/failure và `inventory_import_jobs_total` khi job kết thúc.
- Các module tương ứng phải import được `MetricsService` (nhờ `MetricsModule` `@Global` từ MON-01).

## Acceptance Criteria

- [ ] Publish 1 event → `kafka_events_published_total{topic="..."}` +1,
      `kafka_publish_duration_seconds` có observation; publish lỗi → `kafka_publish_errors_total` +1
      và lỗi vẫn được rethrow (không nuốt).
- [ ] Cache `get` hit/miss → tăng đúng counter tương ứng.
- [ ] Checkout thành công → `pos_checkout_total{result="success"}` +1 + duration observed; checkout
      lỗi → `result="error"`.
- [ ] CSV import → rows success/failure và job counter tăng đúng.
- [ ] `METRICS_ENABLED=false` → mọi helper no-op; nghiệp vụ không đổi hành vi.
- [ ] Không đổi contract/log nghiệp vụ; label `topic` là tên topic (bounded), không nhét id thô.

## Definition of Done

- [ ] `pnpm --filter @erp/api build` + `test` xanh (specs hiện có của các service không vỡ).
- [ ] Instrument-only: diff không đổi luồng nghiệp vụ, không đổi giá trị trả về.
- [ ] No Vietnamese trong backend source.
- [ ] Không đổi endpoint/event shape → KHÔNG cần `openapi:generate`.

## Tech Approach

```ts
// event-publisher.service.ts
async publish<T>(topic: string, event: DomainEvent<T>, key?: string): Promise<void> {
  const start = Date.now();
  try {
    await publishEvent(this.producer, topic, event, key);
    this.metrics.observeKafkaPublish(topic, (Date.now() - start) / 1000);
  } catch (err) {
    this.metrics.incKafkaPublishError(topic);
    throw err;
  }
}
```

Redis/checkout/csv theo cùng khuôn: gọi helper `MetricsService` ở đúng nhánh success/error, giữ
nguyên control-flow. Mỗi helper tự guard `if (!this.enabled) return;`.

## Testing Strategy

- Dựa vào specs service hiện có (không được vỡ). Metric helper là no-op-safe nên không cần mock nặng;
  có thể assert counter tăng trong 1-2 spec nhẹ nếu thuận tiện.
- Manual: trigger checkout/publish/import ở dev, xem `/metrics`.

## Dependencies

- Depends on: TKT-MON-01
- Blocks: TKT-MON-05
