# TKT-068 Temp warehouse module bootstrap

## Epic

[EPIC-15052026 Temporary Warehouse Session](../epics/EPIC-15052026-temporary-warehouse-session.md)

## Summary

Tạo NestJS module `TempWarehouseModule` với 2 entity classes, các DTO chung, branch-location resolver, register session entity vào `EntityRegistryService` (generic CRUD platform), và publish 4 enum vào `@erp/shared-interfaces`.

## Deliverables

- `apps/api/src/modules/inventory/temp-warehouse/temp-warehouse.module.ts`
- `apps/api/src/modules/inventory/temp-warehouse/temp-warehouse-session.entity.ts`
- `apps/api/src/modules/inventory/temp-warehouse/temp-warehouse-line.entity.ts`
- `apps/api/src/modules/inventory/temp-warehouse/branch-location-resolver.service.ts`
- `apps/api/src/modules/inventory/temp-warehouse/temp-warehouse.crud-config.ts`
- 4 enum trong `packages/shared-interfaces/src/enums/temp-warehouse.ts` + re-export trong `index.ts`.
- `apps/api/src/app.module.ts` thêm `TempWarehouseModule` vào imports.

## Acceptance Criteria

- [ ] Entity `TempWarehouseSessionEntity` map đầy đủ cột schema TKT-067, kèm `@OneToMany` tới line.
- [ ] Entity `TempWarehouseLineEntity` map đầy đủ cột + `@ManyToOne` ngược lại session.
- [ ] `BranchLocationResolverService.resolve(branchId, organizationId)` trả về `{ warehouseLocationId, showroomLocationId }` lấy từ:
  - `warehouseLocationId` = `LocationEntity` đầu tiên (`ORDER BY created_at ASC`) thuộc `StorageEntity` của branch có `isMainStorage=true`.
  - `showroomLocationId` = `LocationEntity` đầu tiên thuộc `StorageEntity` backing `ShowroomEntity` của branch có `isMainShowroom=true`.
  - Throw `BadRequestException` nếu branch chưa có main storage / main showroom / location.
- [ ] `TempWarehouseSessionEntity` được register vào `EntityRegistryService` với `scopingPolicy: ORGANIZATION`, `deletionPolicy: SOFT`, `entityKey: 'temp-warehouse-sessions'`.
- [ ] 4 enum export từ `@erp/shared-interfaces`: `TempWarehouseSessionStatus`, `TempWarehouseLineStatus`, `TempWarehouseDirection`, `TempWarehouseCloseMode`.
- [ ] `pnpm build:shared` regenerate dist không lỗi.

## Definition of Done

- [ ] Module load vào `AppModule` không crash; `/admin/entities/temp-warehouse-sessions/records` trả 200 (empty list).
- [ ] Unit test cho `BranchLocationResolverService` (3 case: happy / no main storage / no main showroom).
- [ ] OpenAPI snapshot có endpoint admin/entities cho `temp-warehouse-sessions`.

## Tech Approach

### Enum file

```ts
// packages/shared-interfaces/src/enums/temp-warehouse.ts
export enum TempWarehouseSessionStatus {
  ACTIVE = 'ACTIVE',
  CLOSED = 'CLOSED',
}

export enum TempWarehouseLineStatus {
  ACTIVE = 'ACTIVE',
  DELETED = 'DELETED',
  AUTO_BALANCED = 'AUTO_BALANCED',
}

export enum TempWarehouseDirection {
  WAREHOUSE_TO_SHOWROOM = 'warehouse_to_showroom',
  SHOWROOM_TO_WAREHOUSE = 'showroom_to_warehouse',
}

export enum TempWarehouseCloseMode {
  NET_OFFSET = 'NET_OFFSET',
  CREATE_TRANSFERS = 'CREATE_TRANSFERS',
  NONE = 'NONE',
}
```

### Entity skeleton

```ts
@Entity('temp_warehouse_sessions')
@Index(['organizationId', 'status'])
export class TempWarehouseSessionEntity extends BaseEntity {
  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @Column({ type: 'varchar', length: 20, default: TempWarehouseSessionStatus.ACTIVE })
  status: TempWarehouseSessionStatus;

  @Column({ name: 'close_mode', type: 'varchar', length: 20, nullable: true })
  closeMode?: TempWarehouseCloseMode;

  @Column({ name: 'warehouse_location_id', type: 'uuid' })
  warehouseLocationId: string;

  @Column({ name: 'showroom_location_id', type: 'uuid' })
  showroomLocationId: string;

  @Column({ name: 'opened_by', type: 'uuid' })
  openedBy: string;

  @Column({ name: 'opened_at', type: 'timestamptz' })
  openedAt: Date;

  @Column({ name: 'closed_by', type: 'uuid', nullable: true })
  closedBy?: string;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt?: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @OneToMany(() => TempWarehouseLineEntity, (l) => l.session)
  lines: TempWarehouseLineEntity[];
}
```

### CRUD register pattern (giống `inventory/location/item-crud.service.ts`)

```ts
export class TempWarehouseModule implements OnModuleInit {
  constructor(
    private readonly entityRegistry: EntityRegistryService,
    @Inject(TEMP_WAREHOUSE_SESSION_CRUD_TOKEN)
    private readonly sessionCrud: BaseCrudService<TempWarehouseSessionEntity, ...>,
  ) {}

  onModuleInit(): void {
    this.entityRegistry.registerEntity(TEMP_WAREHOUSE_SESSION_CONFIG, TEMP_WAREHOUSE_SESSION_CRUD_TOKEN);
  }
}
```

## Dependencies

- Phụ thuộc: TKT-067.
- Blocks: TKT-069, TKT-071, TKT-072.
