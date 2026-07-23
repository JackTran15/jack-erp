# TKT-KM-07 Application commands — create / update / duplicate / status / delete

## Epic

[EPIC-22072026 Khuyến mại — schema chuẩn hóa, domain engine & evaluate API](../epics/EPIC-22072026-promotion-programs-engine.md)

## Summary

Tầng ghi: 5 command + handler, DTO phân nhánh theo `type`, và controller v2 cho các route mutation. Đây là ticket hiện thực FR-006…FR-010 (tạo / sửa / nhân bản / xóa / trạng thái theo dõi).

> **Sai lệch chủ ý so với repo:** `.claude/skills/cqrs-search-endpoint/SKILL.md` ghi *"CQRS commands are not used in this repo"*. Epic này dùng `CommandBus`. Lý do trong file epic. Idempotency **không** đổi — global `IdempotencyInterceptor` chặn ở tầng HTTP, độc lập CQRS.

## Deliverables

```
apps/api/src/modules/promotion/application/
├── commands/
│   ├── create-promotion.{command,handler}.ts
│   ├── update-promotion.{command,handler}.ts
│   ├── duplicate-promotion.{command,handler}.ts
│   ├── change-promotion-status.{command,handler}.ts
│   └── delete-promotion.{command,handler}.ts
└── dto/
    ├── create-promotion.dto.ts
    ├── update-promotion.dto.ts
    └── change-promotion-status.dto.ts
```

- `apps/api/src/modules/promotion/interface/promotion-v2.controller.ts` — phần mutation (route search/get thuộc TKT-KM-08, cùng file).
- Đăng ký handler vào `providers` của module.

| Method | Route | Command | Permission |
| ------ | ----- | ------- | ---------- |
| POST | `/v2/promotions` | `CreatePromotionCommand` | `promotion.write` |
| PUT | `/v2/promotions/:id` | `UpdatePromotionCommand` | `promotion.write` |
| POST | `/v2/promotions/:id/duplicate` | `DuplicatePromotionCommand` | `promotion.write` |
| PATCH | `/v2/promotions/:id/status` | `ChangePromotionStatusCommand` | `promotion.write` |
| DELETE | `/v2/promotions/:id` | `DeletePromotionCommand` | `promotion.delete` |

## Acceptance Criteria

- [ ] `CreatePromotionDto` khai báo **mọi** trường được chấp nhận cho cả 5 hình thức — global `ValidationPipe` chạy `whitelist: true, forbidNonWhitelisted: true`, thiếu một trường là FE gửi lên bị 400 khó hiểu.
- [ ] Validate theo `type` chạy ở **domain** (`PromotionProgram.create`), không nhân bản logic vào DTO. DTO chỉ validate kiểu/format; DTO không biết "TIERED_DISCOUNT thì bắt buộc có tier".
- [ ] `DomainValidationError` được map sang `BadRequestException` với body `{ message, issues: [{ field, code, message }] }` — trả **toàn bộ** lỗi một lần, không dừng ở lỗi đầu.
- [ ] `create` sinh `code` qua `DocumentNumberingService.generate(DocumentType.PROMOTION, actor.branchId, actor)`; client **không** gửi `code`.
- [ ] `create` luôn đặt `status = TRACKING` (FR-010: bản ghi mới không có radio trạng thái).
- [ ] `update` **từ chối đổi `type`** → 400 `PROMOTION_TYPE_IMMUTABLE` (FR-006). Đổi hình thức = nhân bản.
- [ ] `duplicate` sao chép trọn aggregate kể cả `groups`/`lines`/`tiers`/`condition`/`branches`/`customerGroups`, cấp `code` mới, `status = TRACKING`, tên = `<tên gốc> (sao chép)`. **Không** sao chép `id`, `createdAt`, `createdBy`.
- [ ] `delete` là **soft delete** (`deleted_at`). Có hook `assertNotReferenced()` kiểm tra `invoice_promotions.ref_id` — hiện luôn rỗng vì POS chưa nối, nhưng đặt sẵn để epic POS không quên (FR-009).
- [ ] Mọi handler lọc theo `actor.organizationId`; sửa/xóa CTKM của org khác → 404, không phải 403 (không tiết lộ tồn tại).
- [ ] Gửi lại cùng `X-Idempotency-Key` + cùng body → replay response cũ (`X-Idempotency-Status: REPLAYED`); cùng key + body khác → 409. Không tự hiện thực lại, chỉ xác nhận interceptor toàn cục vẫn ăn route v2.
- [ ] Controller có `@UseGuards(AuthGuard, PermissionGuard)` ở cấp class và `@RequirePermission(...)` từng method. **Không** để `@RequirePermission` bị comment như `invoice-v2.controller.ts` đang mắc.

## Definition of Done

- [ ] `pnpm --filter @erp/api test -- promotion` và `lint` xanh.
- [ ] Spec cho từng handler: happy path + 404 + cross-tenant + validate lỗi + `type` immutable + duplicate giữ đủ con.
- [ ] Swagger (`@ApiProperty`) đủ cho mọi trường DTO; `/docs` hiển thị được cả 5 hình thức.
- [ ] Không có tiếng Việt trong source backend (kể cả message lỗi và mô tả Swagger).
- [ ] Không có TODO/FIXME.

## Tech Approach

DTO phân nhánh: dùng **một** DTO phẳng với `@ValidateIf` theo `type` thay vì `@ApiExtraModels` + discriminated union — union làm OpenAPI generator sinh type khó dùng ở FE, và form của FE vốn là một `ProgramFormState` phẳng.

```ts
export class CreatePromotionDto {
  @ApiProperty({ enum: PromotionProgramType })
  @IsEnum(PromotionProgramType) type: PromotionProgramType;

  @ApiProperty() @IsString() @IsNotEmpty() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;

  @ApiProperty({ enum: PromotionApplyTo })
  @IsEnum(PromotionApplyTo) applyTo: PromotionApplyTo;

  @ApiPropertyOptional({ enum: PromotionBirthdayMatch })
  @ValidateIf(o => o.applyTo === PromotionApplyTo.BIRTHDAY)
  @IsEnum(PromotionBirthdayMatch) birthdayMatch?: PromotionBirthdayMatch;

  @ApiPropertyOptional() @IsOptional() @IsArray() @IsUUID('4', { each: true })
  customerGroupIds?: string[];

  @ApiPropertyOptional() @IsOptional() @IsUUID() cardTierId?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional() @IsArray() @IsInt({ each: true }) @Min(1, { each: true }) @Max(7, { each: true })
  daysOfWeek?: number[];

  @ApiPropertyOptional({ example: '18:00' })
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime?: string;
  // ... endTime, autoApply, priority, branchIds[],
  //     invoiceScope, discountMode, discountValue, maxDiscountAmount,
  //     tierBasis, tierScope, targetType, giftMode, buyGetPolicy,
  //     buyQuantity, giftQuantity,
  //     groups: PromotionGroupInputDto[]  (nested @ValidateNested + @Type)
  //     condition: PromotionConditionInputDto
}
```

Handler mỏng — dựng aggregate rồi giao cho repository:

```ts
@CommandHandler(CreatePromotionCommand)
export class CreatePromotionHandler implements ICommandHandler<CreatePromotionCommand> {
  constructor(
    @Inject(PROMOTION_REPOSITORY) private readonly repo: PromotionRepositoryPort,
    private readonly docNumbering: DocumentNumberingService,
  ) {}

  async execute({ dto, actor }: CreatePromotionCommand) {
    const code = await this.docNumbering.generate(DocumentType.PROMOTION, actor.branchId, actor);
    try {
      const program = PromotionProgram.create({ ...dto, code, organizationId: actor.organizationId, createdBy: actor.userId });
      return await this.repo.save(program);
    } catch (e) {
      if (e instanceof DomainValidationError) throw new BadRequestException({ message: 'Invalid promotion configuration', issues: e.issues });
      throw e;
    }
  }
}
```

Map `DomainValidationError → BadRequestException` lặp ở 3 handler → tách một helper `rethrowDomainError(e)` trong `application/`, không dùng exception filter toàn cục (sẽ ảnh hưởng module khác).

## Testing Strategy

- Unit từng handler với repository/docNumbering mock. Không cần DB.
- Case bắt buộc: tạo đủ 5 hình thức; `update` đổi `type` → 400; `duplicate` giữ nguyên số group/line/tier; `delete` set `deletedAt` chứ không xóa dòng; org khác → 404.
- Idempotency kiểm ở e2e (TKT-KM-16), không ở unit.

## Dependencies

- Depends on: TKT-KM-06
- Blocks: TKT-KM-11
