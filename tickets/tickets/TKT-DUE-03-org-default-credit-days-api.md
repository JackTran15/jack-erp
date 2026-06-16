# TKT-DUE-03 Org defaultCreditDays — read (POS prefill) + update (admin)

## Epic

[EPIC-16062026 POS công nợ — Hạn thanh toán](../epics/EPIC-16062026-pos-debt-due-date.md)

## Summary

Expose `organizations.default_credit_days` để (a) POS đọc và **prefill** modal "Hạn thanh toán", (b) admin **set** giá trị mặc định. Đây là giá trị org-wide, không ghi đè số ngày thu ngân nhập per-invoice.

## Deliverables

- **Read (POS):** trả `defaultCreditDays` cho FE. Ưu tiên **mở rộng endpoint org/profile hiện có** mà app shell đã gọi (kiểm tra `apps/api/src/modules/organization/*.controller.ts`); nếu không có endpoint phù hợp → thêm `GET /organizations/current/pos-settings` trả `{ defaultCreditDays: number | null }`. `@RequirePermission` đọc tối thiểu (org member).
- **Update (admin):** `PATCH /organizations/current/pos-settings` body `{ defaultCreditDays: number | null }` (`@IsOptional` `@IsInt` `@Min(0)`); `@RequirePermission("organization.update")` (tái dùng permission org sẵn có — không seed mới nếu đã tồn tại).
- DTO `UpdatePosSettingsDto` (hoặc field thêm vào DTO org update sẵn có) — class-validator + `@ApiProperty`.
- Service: đọc/ghi `defaultCreditDays` scoped `actor.organizationId`.

## Acceptance Criteria

- [ ] GET trả đúng `defaultCreditDays` của org hiện tại (NULL khi chưa set); scope `actor.organizationId`.
- [ ] PATCH cập nhật `default_credit_days`; gửi `null` → clear; gửi số âm → `400`.
- [ ] PATCH yêu cầu permission admin; user thường → `403`.
- [ ] Không endpoint nào rò org khác (scope cứng theo `organizationId`).
- [ ] Mutation PATCH idempotent (kế thừa `IdempotencyInterceptor`).

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` xanh.
- [ ] Spec: GET trả giá trị + NULL; PATCH set/clear/validation/permission-denied.
- [ ] No Vietnamese trong source.
- [ ] OpenAPI regen gộp ở TKT-DUE-05.

## Tech Approach

- Trước khi thêm route mới, **đọc** controller org hiện có để xem có endpoint "current organization" đã trả về cho app shell — nếu có, chỉ thêm field `defaultCreditDays` vào response + một method PATCH, tránh tạo controller thừa.
- Service skeleton:

```ts
async getPosSettings(actor: ActorContext): Promise<{ defaultCreditDays: number | null }> {
  const org = await this.orgRepo.findOneByOrFail({ id: actor.organizationId });
  return { defaultCreditDays: org.defaultCreditDays ?? null };
}

async updatePosSettings(actor: ActorContext, dto: UpdatePosSettingsDto): Promise<void> {
  await this.orgRepo.update(
    { id: actor.organizationId },
    { defaultCreditDays: dto.defaultCreditDays ?? null },
  );
}
```

## Testing Strategy

- Unit `organization.service.spec.ts` (hoặc spec service tương ứng): get/patch + scope + validation.
- E2E read-after-write nhẹ ở TKT-DUE-08 (set 30 → GET trả 30).

## Dependencies

- Depends on: TKT-DUE-01 (cột `default_credit_days`).
- Blocks: TKT-DUE-05, TKT-DUE-07, TKT-DUE-08.
