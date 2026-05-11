# TKT-047 Dead Letter Events infrastructure

## Epic

[EPIC-008 POS Event-Driven Refactor](../epics/EPIC-008-pos-event-driven-refactor.md)

## Summary

Tạo bảng `dead_letter_events` để lưu các Kafka message fail sau khi DLQ retry hết. Cung cấp service insert từ consumer error handler và REST API cho admin xem / replay / ignore. Đây là foundation cho TKT-048/049/050 — cả 3 consumer Kafka sẽ ghi vào bảng này khi fail vĩnh viễn.

## Deliverables

- Migration: `1779000000000-AddDeadLetterEvents.ts` — bảng `dead_letter_events` + indexes.
- Entity: `apps/api/src/modules/events/entities/dead-letter-event.entity.ts`.
- Enum: `DeadLetterStatus` (`PENDING | RESOLVED | IGNORED`) trong shared-interfaces.
- Service: `apps/api/src/modules/events/services/dead-letter.service.ts`
  - `record(topic, partition, offset, key, payload, error)` — insert PENDING row.
  - `list({ status, topic, page })` — paginated list.
  - `replay(id, actor)` — re-publish original message lên Kafka topic; set status=RESOLVED, resolvedBy, resolvedAt.
  - `ignore(id, actor, reason)` — set status=IGNORED + notes.
- Controller: `apps/api/src/modules/events/controllers/dead-letter.controller.ts`
  - `GET /dead-letter-events` (admin role)
  - `GET /dead-letter-events/:id`
  - `POST /dead-letter-events/:id/replay`
  - `POST /dead-letter-events/:id/ignore`
- Integration với `EventConsumerManager`: hook vào DLQ handler để auto-insert khi message vào DLQ topic.

## Acceptance Criteria

- [ ] Bảng `dead_letter_events` có đủ cột: `id`, `topic`, `partition`, `offset`, `key`, `payload` (JSONB), `error` (TEXT), `retry_count`, `status`, `resolved_by`, `resolved_at`, `notes`, `created_at`, `organization_id`, `branch_id`.
- [ ] Index trên (`status`, `topic`) và (`organization_id`, `created_at`).
- [ ] `record()` được gọi tự động khi message vào DLQ topic (`<topic>.dlq`) — không cần consumer code tự call.
- [ ] `GET /dead-letter-events?status=PENDING` trả danh sách paginated, default 20/page.
- [ ] `POST /:id/replay` republish message với key + payload nguyên gốc lên topic gốc → trả `200 { newOffset }`.
- [ ] Không cho replay row đã `RESOLVED` hoặc `IGNORED` → 400.
- [ ] Replay log dòng `Replayed dead letter event <id> to topic <topic>`.
- [ ] RBAC: chỉ role `ADMIN` truy cập được.

## Definition of Done

- [ ] PR có migration + entity + service + controller; pass CI lint + build + unit tests.
- [ ] Unit test: record, list with filters, replay (mock publisher), ignore, replay đã resolved → 400.
- [ ] Integration test: force consumer fail 3x → verify row PENDING → replay → verify status=RESOLVED.

## Tech Approach

### Schema

```sql
CREATE TYPE dead_letter_status_enum AS ENUM ('PENDING', 'RESOLVED', 'IGNORED');

CREATE TABLE dead_letter_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  branch_id       uuid,
  topic           varchar(255) NOT NULL,
  partition       int,
  "offset"        bigint,
  key             varchar(255),
  payload         jsonb NOT NULL,
  error           text,
  retry_count     int NOT NULL DEFAULT 3,
  status          dead_letter_status_enum NOT NULL DEFAULT 'PENDING',
  resolved_by     uuid,
  resolved_at     timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dle_status_topic ON dead_letter_events (status, topic);
CREATE INDEX idx_dle_org_created ON dead_letter_events (organization_id, created_at DESC);
```

### Auto-insert from DLQ topic

`EventConsumerManager` đã có DLQ topic naming convention `<topic>.dlq`. Trong consumer setup, khi consumer cho `<topic>.dlq` nhận message, gọi `deadLetterService.record(...)`:

```typescript
// Trong EventConsumerManager hoặc dead-letter consumer
@OnDomainEvent('*.dlq', { dlq: false }) // chính nó là DLQ, không retry
async handleDlq(message: KafkaMessage, raw: { topic, partition, offset, error }) {
  await this.deadLetterService.record({
    topic: raw.topic.replace('.dlq', ''),
    partition: raw.partition,
    offset: raw.offset,
    key: message.key?.toString(),
    payload: JSON.parse(message.value.toString()),
    error: raw.error,
    organizationId: message.organizationId,
    branchId: message.branchId,
  });
}
```

### Replay

```typescript
async replay(id: string, actor: ActorContext) {
  const row = await this.repo.findOneOrFail({ where: { id } });
  if (row.status !== 'PENDING') throw new BadRequestException(`Cannot replay ${row.status} event`);
  await this.eventPublisher.publish(row.topic, row.payload, row.key);
  row.status = 'RESOLVED';
  row.resolvedBy = actor.userId;
  row.resolvedAt = new Date();
  await this.repo.save(row);
}
```

## Testing Strategy

- Unit: mock `eventPublisher`, `repo`; test record/list/replay/ignore branches.
- Integration: publish to a test topic, force handler throw, wait DLQ → verify row created → replay → verify message processed.

## Dependencies

- Requires: TKT-019 (Redpanda), TKT-021 (Kafka client), `EventConsumerManager` infrastructure.
- Required by: TKT-048, TKT-049, TKT-050.
- Blocks: TKT-051 (refactor cần DLE để recover khi consumer fail).
