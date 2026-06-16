# TKT-DUE-04 Overdue cron + event debt.overdue

## Epic

[EPIC-16062026 POS công nợ — Hạn thanh toán](../epics/EPIC-16062026-pos-debt-due-date.md)

## Summary

Cron hằng ngày đánh dấu debt `OPEN` đã quá hạn (`due_date < hôm nay`) thành `OVERDUE` và publish event `debt.overdue` (idempotent) cho mỗi debt vừa chuyển trạng thái. `DebtStatus.OVERDUE` đã định nghĩa nhưng chưa từng được set. Repo **chưa có scheduler** → thêm `@nestjs/schedule` + `ScheduleModule`.

## Deliverables

- `apps/api/package.json` — thêm dependency `@nestjs/schedule`.
- Đăng ký `ScheduleModule.forRoot()` (AppModule hoặc module phù hợp).
- `apps/api/src/modules/pos/services/overdue-debts.service.ts` (new) — `@Cron(CronExpression.EVERY_DAY_AT_1AM)` quét + cập nhật + publish.
- Topic `debt.overdue` đăng ký trong `TopicInitializer` / `ERP_TOPICS`.
- Publisher dùng `EventPublisher` với `eventId` deterministic.
- Wire service vào `pos.module.ts` (providers).

## Acceptance Criteria

- [ ] Cron tìm debt `status = OPEN` và `due_date < CURRENT_DATE` (cross-tenant), set `status = OVERDUE`, giữ nguyên các field khác.
- [ ] Mỗi debt vừa chuyển OVERDUE → publish đúng **1** `debt.overdue` với `eventId = debt-overdue-<debtId>-<dueDate>` (replay/chạy lại cùng ngày → no-op, không phát trùng).
- [ ] Debt đã `OVERDUE`/`PAID` không bị xử lý lại.
- [ ] Payload event mang `{ debtId, invoiceId, customerId, organizationId, branchId, dueDate, remainingAmount }`.
- [ ] Cập nhật chạy theo batch an toàn (không khóa bảng lâu); không tạo journal/cash (chỉ đổi status + event).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh.
- [ ] Unit test gọi thẳng method cron: seed 1 debt quá hạn + 1 chưa tới hạn + 1 đã PAID → chỉ debt quá hạn flip OVERDUE và phát 1 event.
- [ ] Chạy lại method lần 2 → 0 debt đổi, 0 event mới (idempotent).
- [ ] No Vietnamese trong source.
- [ ] Topic `debt.overdue` xuất hiện trong danh sách topic khởi tạo.

## Tech Approach

```ts
@Injectable()
export class OverdueDebtsService {
  constructor(
    @InjectRepository(InvoiceDebtEntity) private readonly debtRepo: Repository<InvoiceDebtEntity>,
    private readonly events: EventPublisher,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async markOverdue(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const due = await this.debtRepo.find({
      where: { status: DebtStatus.OPEN, dueDate: LessThan(today) },
    });
    for (const debt of due) {
      debt.status = DebtStatus.OVERDUE;
      await this.debtRepo.save(debt);
      await this.events.publish('debt.overdue', {
        eventId: `debt-overdue-${debt.id}-${debt.dueDate}`,
        debtId: debt.id,
        invoiceId: debt.invoiceId,
        customerId: debt.customerId,
        organizationId: debt.organizationId,
        branchId: debt.branchId,
        dueDate: debt.dueDate,
        remainingAmount: debt.remainingAmount,
      });
    }
  }
}
```

> Method `markOverdue` để **public** + không phụ thuộc `Date.now()` ẩn (lấy `today` 1 lần) để unit test gọi trực tiếp. Cron expression có thể tinh chỉnh; mặc định 01:00 hằng ngày.

## Testing Strategy

- Unit `overdue-debts.service.spec.ts`: mock repo + `EventPublisher`; assert flip + publish đúng 1 lần + idempotent lần 2.
- (Tùy chọn) e2e nhẹ: seed debt `due_date` = hôm qua → gọi method → DB status OVERDUE.

## Dependencies

- Depends on: TKT-DUE-01 (cột `credit_days`/`due_date` sẵn sàng — cron đọc `due_date`).
- Blocks: TKT-DUE-08.
- Lưu ý: thêm `@nestjs/schedule` là thay đổi infra toàn API — xác nhận version tương thích NestJS 11 khi cài.
