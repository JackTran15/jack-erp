# TKT-FND-04 SearchCounterparties query + dialog dùng chung (NCC + KH + NV)

## Epic

[EPIC-18062026 Inventory Foundation](../epics/EPIC-18062026-inventory-foundation.md)

## Layer

🟦 Backend (CQRS query mới) + 🟩 Frontend (component dialog + hook dùng chung).

## Summary

Query CQRS + component dialog **tìm đối tượng** dùng chung (giống thu/chi tiền mặt) cho phiếu Nhập/Xuất kho. Gồm **NCC (inventory_providers) + Khách hàng (customers) + Nhân viên (users/employees)**. **Không** đụng `/cash-vouchers/partners` (raw SQL cũ) — viết mới theo CQRS + repository, gom kết quả trên RAM.

## Deliverables

- `apps/api/src/modules/counterparty/` — module mới gọn:
  - `dto/search-counterparties.dto.ts`:
    ```ts
    export enum CounterpartyKind { SUPPLIER='supplier', CUSTOMER='customer', EMPLOYEE='employee', ALL='all' }
    export class SearchCounterpartiesDto {
      @IsEnum(CounterpartyKind) type: CounterpartyKind = CounterpartyKind.ALL;
      @IsOptional() @IsString() search?: string;
      @IsOptional() @Type(()=>Number) @IsInt() @Min(1) page = 1;
      @IsOptional() @Type(()=>Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
    }
    ```
  - `queries/search-counterparties.query.ts` + `.handler.ts` — `@QueryHandler`:
    - `type != all`: 1 querybuilder repo tương ứng (ILIKE `name`/`code`), phân trang DB.
    - `type = all`: lấy top-N mỗi loại bằng repo, **merge + sort + phân trang trên RAM**; `total` = tổng count 3 nguồn.
    - Scope `organizationId`; provider `is_active`, customer `status != MERGED`, user `is_active`.
    - Trả `[{ kind, id, code, name, phone?, address? }]` (inline mỗi item, không root map).
  - `counterparty.controller.ts` — `POST /v2/counterparties/search`, guards + `@RequirePermission('inventory.read')` (reuse quyền sẵn có; không seed quyền mới trừ khi cần).
  - `counterparty.module.ts` — import `CqrsModule` + repos `ProviderEntity`, `CustomerEntity`, `UserEntity`.
- `packages/shared-interfaces/src/counterparty/counterparty.ts` — `CounterpartyKind`, `CounterpartyOption`.
- `apps/backoffice-web/src/components/shared/counterparty-search/`:
  - `CounterpartySearchDialog.tsx` — props:
    ```ts
    interface Props {
      open: boolean;
      onOpenChange: (o: boolean) => void;
      allowKinds?: CounterpartyKind[];     // mặc định [supplier, customer, employee]
      defaultKind?: CounterpartyKind;
      onSelect: (item: CounterpartyOption) => void;
    }
    ```
    Tabs lọc theo loại + ô search + bảng phân trang (code, tên, loại, sđt) + chọn 1.
  - `useSearchCounterparties.ts` — hook react-query gọi `POST /v2/counterparties/search`, key `["counterparties", type, search, page]`.

## Acceptance Criteria

- [ ] `type=all` trả gộp NCC + KH + NV; lọc `search` theo `name`/`code`; phân trang ổn định, `total` đúng.
- [ ] `type=supplier|customer|employee` chỉ trả đúng loại đó.
- [ ] Component dialog dùng được **độc lập page** (chỉ cần props), trả `CounterpartyOption` qua `onSelect`.
- [ ] Scope `organizationId`; provider inactive / customer MERGED / user inactive bị loại.

## Definition of Done

- [ ] `pnpm --filter @erp/api test` + `lint` pass.
- [ ] Handler spec: từng type + all + phân trang + loại trừ inactive/MERGED.
- [ ] `pnpm openapi:generate` chạy, snapshot + `schema.ts` commit.
- [ ] Source/Swagger tiếng Anh; nhãn FE tiếng Việt (Nhà cung cấp / Khách hàng / Nhân viên).
- [ ] Component có thể import từ ≥1 page (chứng minh ở EPIC-C/D).

## Tech Approach

- Gom RAM thay vì UNION SQL (xem [[feedback_prefer_in_memory_aggregation]]); employee name ghép `first_name`/`last_name` + code từ `employee_profiles`.
- Đặt module `counterparty` ở tầng cross-cutting (không nhét vào inventory/customer) vì nó đọc 3 domain — nhưng chỉ READ, không sở hữu entity nào.

## Dependencies

- Requires: `ProviderEntity`, `CustomerEntity`, `UserEntity`/`employee_profiles` — đã có.
- Blocks: TKT-GRV-02, TKT-GIV-02 (FE picker Đối tượng).
