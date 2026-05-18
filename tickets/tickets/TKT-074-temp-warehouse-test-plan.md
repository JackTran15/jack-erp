# TKT-074 Temp warehouse — E2E + DoD gate

## Epic

[EPIC-15052026 Temporary Warehouse Session](../epics/EPIC-15052026-temporary-warehouse-session.md)

## Summary

Ticket cuối epic: E2E test suite cho Kho Tạm session + checklist regression với các module liên quan (`stock-transfer`, `stock-ledger`, `inventory-location`, các consumer Kafka hiện có). Bao gồm test async consumer flow để verify eventual consistency. Đây là gate cuối trước khi epic được coi là DONE.

## Deliverables

- `apps/api/test/e2e/temp-warehouse.e2e-spec.ts` — Jest e2e với Redpanda thật (qua `docker compose up -d` hoặc testcontainers).
- Test fixture trong `apps/api/test/e2e/fixtures/temp-warehouse.fixture.ts` (seed: 1 org, 1 branch, 1 main storage + 1 location, 1 main showroom + 1 location, 3 item, 2 user).
- Helper `waitForCondition(predicate, timeoutMs)` để chờ consumer xử lý xong (eventual consistency).
- Update `docs/13-workflows-and-state-machines.md` — bổ sung state machine cho `temp_warehouse_sessions` (ACTIVE → CLOSED) và line (ACTIVE → DELETED / AUTO_BALANCED), kèm `transfer_processing_status` (NONE → PENDING → COMPLETED | FAILED).

## Acceptance Criteria

### E2E scenarios

- [ ] **Happy path full flow async**:
  1. POST line W2S (item A, qty 10) → session auto-created.
  2. POST line W2S (item B, qty 5).
  3. POST line S2W (item A, qty 3).
  4. GET lines `hideOffsetting=true` → item A `netQty=7 W2S`, item B `netQty=5 W2S`.
  5. PATCH line A's W2S đổi qty từ 10 → 12 → line cũ DELETED, line mới ACTIVE.
  6. POST close `mode=CREATE_TRANSFERS` → response 200 ngay, `publishedEvents=[{direction:W2S}, {direction:S2W}]`, session `status=CLOSED`, `transfer_processing_status='PENDING'`.
  7. Wait until session `transfer_processing_status='COMPLETED'` (timeout 10s). Verify:
     - `transferW2sId` và `transferS2wId` set.
     - `stock_transfers` có 2 row `POSTED` với `document_number`.
     - `stock_ledger_entries` có entries TRANSFER_IN/OUT đúng tổng quantity.
     - `stock_balances` cập nhật đúng cho 2 location.
     - 2 row trong `processed_events` với `consumerName='TempWarehouseTransferConsumer'`.

- [ ] **NET_OFFSET balance verification** (sync, không qua Kafka):
  1. POST line W2S item A qty 10, line S2W item A qty 6.
  2. POST close `mode=NET_OFFSET` → response trả `autoBalancedLines` với 1 entry: item A, S2W, qty 4, `status=AUTO_BALANCED`.
  3. GET lines netted → item A `netQty=0`.
  4. Verify **không** có row mới trong `stock_transfers`, `stock_ledger_entries`, hay `processed_events`.

- [ ] **NONE close**:
  1. POST 3 line.
  2. POST close `mode=NONE` → session CLOSED, line không đổi, không event publish.
  3. Try POST add line lần nữa → 200 (tạo session mới ACTIVE).

- [ ] **Consumer idempotency**:
  - Publish cùng event 5 lần thẳng vào Kafka (bypass close API) → chỉ 1 `stock_transfers` được tạo.
  - `processed_events` có 1 row với eventId tương ứng.

- [ ] **Consumer DLQ**:
  - Mock `stockTransferService.post()` để throw (vd: stock không đủ) → sau 3 retry, message vào `erp.temp-warehouse.transfer-requested.dlq`.
  - Verify row trong `dead_letter_events` với `error_message` chứa lý do.
  - Verify session `transfer_processing_status='FAILED'`, `transfer_failure_reason` set.

- [ ] **Race condition open session**:
  - 5 concurrent POST line vào branch chưa có session → kết quả: chỉ 1 session ACTIVE, 5 line cùng `sessionId`.

- [ ] **Multi-tenant isolation**:
  - Tạo session ở org A → user của org B gọi GET lines → 0 result.
  - User org B gọi POST close session A → 404.

- [ ] **Resolver failure**:
  - Branch không có main storage → POST add line → 400 với error message rõ ràng.
  - Branch có main storage nhưng không có location → 400.

### Regression checklist

- [ ] `pnpm --filter @erp/api test` pass (unit test cũ + mới).
- [ ] `pnpm --filter @erp/api test:e2e` pass (suite cũ + temp-warehouse).
- [ ] Stock transfer module: e2e cũ pass — không regression.
- [ ] Các consumer hiện có (`stock-deduction`, `loyalty-points`, `journal-sale`...) pass test cũ.
- [ ] Goods receipt + POS checkout: smoke test 1 luồng đầy đủ.
- [ ] OpenAPI snapshot diff chỉ có endpoint mới của `/inventory/temp-warehouse/...`.
- [ ] Topic `erp.temp-warehouse.transfer-requested` + DLQ tồn tại trong Redpanda console sau khi app start.

## Definition of Done

- [ ] Tất cả AC trên pass trên CI (≥ 3 lần liên tiếp, không flaky).
- [ ] Coverage `temp-warehouse` module (service + consumer) ≥ 80% statements (`pnpm --filter @erp/api test --coverage`).
- [ ] Migration `<timestamp>-TempWarehouseSession.ts` đã chạy trên staging, snapshot trước/sau attached vào PR.
- [ ] Doc state machine update trong `docs/13-workflows-and-state-machines.md`.
- [ ] Acceptance test với team nghiệp vụ qua Postman/API client (không yêu cầu UI).

## Tech Approach

### E2E setup pattern (theo `apps/api/test/e2e/`)

```ts
describe('Temp warehouse session (e2e)', () => {
  let app: INestApplication;
  let fixture: TempWarehouseFixture;

  beforeAll(async () => {
    app = await bootstrapTestApp();  // app này phải connect tới Redpanda + Postgres dev
    fixture = await seedTempWarehouseFixture(app);
  });

  afterAll(async () => {
    await teardownFixture(fixture);
    await app.close();
  });

  it('opens session implicitly on first add-line', async () => {
    const res = await request(app.getHttpServer())
      .post('/inventory/temp-warehouse/lines')
      .set(authHeaders(fixture.userA))
      .set('X-Branch-Id', fixture.branchId)
      .send({ branchId: fixture.branchId, itemId: fixture.itemA, direction: 'warehouse_to_showroom', quantity: 10 })
      .expect(201);

    expect(res.body.session.status).toBe('ACTIVE');
    expect(res.body.line.quantity).toBe('10.00');
  });

  it('closes with CREATE_TRANSFERS, consumer creates transfers async', async () => {
    // ... seed lines, then POST close
    const closeRes = await request(app.getHttpServer())
      .post(`/inventory/temp-warehouse/sessions/${sessionId}/close`)
      .set(authHeaders(fixture.userA))
      .send({ mode: 'CREATE_TRANSFERS' })
      .expect(200);

    expect(closeRes.body.publishedEvents).toHaveLength(2);

    // Wait for consumer (eventual consistency)
    await waitForCondition(async () => {
      const s = await dataSource.query(
        `SELECT transfer_processing_status, transfer_w2s_id, transfer_s2w_id
         FROM temp_warehouse_sessions WHERE id = $1`,
        [sessionId],
      );
      return s[0].transfer_processing_status === 'COMPLETED';
    }, 10_000);

    const transfers = await dataSource.query(
      `SELECT * FROM stock_transfers WHERE id IN (
         SELECT transfer_w2s_id FROM temp_warehouse_sessions WHERE id = $1
         UNION
         SELECT transfer_s2w_id FROM temp_warehouse_sessions WHERE id = $1
       )`,
      [sessionId],
    );
    expect(transfers.every((t: any) => t.status === 'POSTED')).toBe(true);
    expect(transfers.every((t: any) => t.document_number)).toBe(true);
  });

  it('routes to DLQ when stock insufficient', async () => {
    // ... seed line vượt stock available
    await request(app.getHttpServer())
      .post(`/inventory/temp-warehouse/sessions/${sessionId}/close`)
      .send({ mode: 'CREATE_TRANSFERS' })
      .expect(200);

    await waitForCondition(async () => {
      const s = await dataSource.query(
        `SELECT transfer_processing_status FROM temp_warehouse_sessions WHERE id = $1`,
        [sessionId],
      );
      return s[0].transfer_processing_status === 'FAILED';
    }, 15_000);

    const dlqRows = await dataSource.query(
      `SELECT * FROM dead_letter_events WHERE topic = 'erp.temp-warehouse.transfer-requested'`,
    );
    expect(dlqRows.length).toBeGreaterThan(0);
  });
});
```

## Dependencies

- Phụ thuộc: TKT-067, TKT-068, TKT-069, TKT-070, TKT-071, TKT-072, TKT-073.
- Blocks: (epic close).
