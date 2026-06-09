# ERP Delivery Tickets

Jira-style planning artifacts for implementation tracking.

## Folder Structure

- `epics/`: high-level delivery streams.
- `tickets/`: implementable work items mapped to epics.

## Epic Dependency Graph

```mermaid
flowchart LR
  E1["EPIC-001 FoundationAndMonorepo"] --> E2["EPIC-002 MasterDataAndBranch"]
  E1 --> E3["EPIC-003 InventoryAndCsv"]
  E2 --> E4["EPIC-004 PosAndAccounting"]
  E3 --> E4
  E4 --> E5["EPIC-005 ReportingAndHardening"]
  E2 --> E7["EPIC-007 PosInvoiceCustomerPromotions"]
  E3 --> E7
  E4 --> E7
  E6["EPIC-006 ProductVariantsCatalog"] --> E7
  E3 --> E10["EPIC-010 ItemManagementEnhancement"]
  E6 --> E10
  E3 --> E13["EPIC-013 StockByLocationQueryApi"]
  E10 --> E13
  E7["EPIC-007 PosInvoiceCustomerPromotions"] --> E11["EPIC-011 PosReturnExchange"]
  E8["EPIC-008 PosEventDrivenRefactor"] --> E11
  E9["EPIC-009 CashManagementEnhancement"] --> E11
```

## Ticket Dependency Graph

```mermaid
flowchart LR
  T1["TKT-001 InitPnpmWorkspace"] --> T2["TKT-002 SharedInterfacesPackage"]
  T2 --> T3["TKT-003 ApiAppBootstrap"]
  T2 --> T4["TKT-004 BackofficeAppBootstrap"]
  T2 --> T5["TKT-005 PosAppBootstrap"]
  T5 --> T13
  T3 --> T24["TKT-024 GenericCrudPlatform"]
  T4 --> T24
  T3 --> T6["TKT-006 AuthAndRbacCore"]
  T3 --> T7["TKT-007 BranchAndOrgCore"]
  T4 --> T25["TKT-025 OrgBranchOnboardingApprovalUi"]
  T6 --> T25
  T7 --> T25
  T6 --> T26["TKT-026 BranchSalesHierarchyManagement"]
  T7 --> T26
  T24 --> T26
  T3 --> T8["TKT-008 CustomerModule"]
  T24 --> T8
  T7 --> T22["TKT-022 DocumentNumberingRuleEngine"]
  T7 --> T9["TKT-009 InventoryLocationHierarchy"]
  T9 --> T10["TKT-010 StockLedgerAndBalance"]
  T10 --> T11["TKT-011 StockTransferAndAdjustment"]
  T10 --> T12["TKT-012 InventoryCsvImportExport"]
  T8 --> T13["TKT-013 PosCheckoutAndReturns"]
  T10 --> T13
  T22 --> T13
  T24 --> T13
  T13 --> T14["TKT-014 PosSessionReconciliation"]
  T3 --> T15["TKT-015 AccountingCoaAndJournals"]
  T22 --> T15
  T24 --> T15
  T15 --> T16["TKT-016 PayablesReceivablesExpensesCash"]
  T13 --> T16
  T24 --> T16
  T3 --> T21["TKT-021 SharedKafkaJsClientPackage"]
  T21 --> T19["TKT-019 RedpandaEventBusSetup"]
  T3 --> T20["TKT-020 RedisCachingLayerSetup"]
  T3 --> T23["TKT-023 WebSocketRealtimeNotificationService"]
  T21 --> T23
  T20 --> T23
  T23 --> T12
  T23 --> T13
  T23 --> T17
  T11 --> T17["TKT-017 ReportingAndAnalytics"]
  T16 --> T17
  T19 --> T17
  T20 --> T17
  T17 --> T18["TKT-018 E2eHardeningAndGoLiveReadiness"]
```

## Epics

- [EPIC-001 Foundation and Monorepo](./epics/EPIC-001-foundation-and-monorepo.md)
- [EPIC-002 Master Data and Branch](./epics/EPIC-002-master-data-and-branch.md)
- [EPIC-003 Inventory and CSV](./epics/EPIC-003-inventory-and-csv.md)
- [EPIC-004 POS and Accounting](./epics/EPIC-004-pos-and-accounting.md)
- [EPIC-005 Reporting and Hardening](./epics/EPIC-005-reporting-and-hardening.md)

## Tickets

- [All tickets](./tickets/)

## EPIC-006 Product variants & catalog

- [EPIC-006 Product variants & catalog](./epics/EPIC-006-product-variants-catalog.md)
- Tickets: [TKT-027](./tickets/TKT-027-inventory-product-schema.md) – [TKT-037](./tickets/TKT-037-product-variants-test-plan.md)
- Dependencies: [TKT-DEP-006-dependencies.md](./TKT-DEP-006-dependencies.md)

## EPIC-007 POS Invoice, Customer Loyalty & Promotions

- [EPIC-007 POS Invoice, Customer Loyalty & Promotions](./epics/EPIC-007-pos-invoice-customer-promotions.md)
- ERD: [docs/pos-erd.md](../docs/pos-erd.md)
- Tickets: [TKT-038](./tickets/TKT-038-invoice-entities-migration.md) – [TKT-046](./tickets/TKT-046-promotion-apply-service.md)

| Ticket                                                     | Mô tả                                           |
| ---------------------------------------------------------- | ----------------------------------------------- |
| [TKT-038](./tickets/TKT-038-invoice-entities-migration.md) | Invoice + InvoiceItem entities & migration      |
| [TKT-039](./tickets/TKT-039-invoice-crud-api.md)           | Invoice CRUD API (draft lifecycle)              |
| [TKT-040](./tickets/TKT-040-invoice-checkout-service.md)   | Invoice checkout service (draft → paid \| debt) |
| [TKT-041](./tickets/TKT-041-customer-module-extensions.md) | Customer extensions + CustomerGroup             |
| [TKT-042](./tickets/TKT-042-membership-card-api.md)        | MembershipCard + PointHistory API               |
| [TKT-043](./tickets/TKT-043-invoice-debt-service.md)       | InvoiceDebt + DebtPayment & debt flow           |
| [TKT-044](./tickets/TKT-044-purchase-history-api.md)       | Purchase history API                            |
| [TKT-045](./tickets/TKT-045-promotion-entities.md)         | Promotion module entities                       |
| [TKT-046](./tickets/TKT-046-promotion-apply-service.md)    | Promotion apply service + InvoicePromotion      |

## EPIC-010 Item Management Enhancement (Phase 1)

- [EPIC-010 Item Management Enhancement](./epics/EPIC-010-item-management-enhancement.md)
- Tickets: [TKT-059](./tickets/TKT-059-item-management-schema.md) – [TKT-066](./tickets/TKT-066-item-management-test-plan.md)

| Ticket                                                       | Mô tả                                                         |
| ------------------------------------------------------------ | ------------------------------------------------------------- |
| [TKT-059](./tickets/TKT-059-item-management-schema.md)       | Schema migration: alter `items` + 3 bảng mới + data migration |
| [TKT-060](./tickets/TKT-060-item-entity-enhancement.md)      | `ItemEntity` / DTO / CrudConfig + filter POS catalog          |
| [TKT-061](./tickets/TKT-061-item-providers-m2m-api.md)       | API M2M `item_providers` (CRUD + set-primary)                 |
| [TKT-062](./tickets/TKT-062-provider-crud-endpoints.md)      | Bổ sung `POST/PATCH/DELETE /inventory/providers`              |
| [TKT-063](./tickets/TKT-063-item-barcodes-api.md)            | API `item_barcodes` (nhiều mã/item + lookup POS)              |
| [TKT-064](./tickets/TKT-064-item-stock-thresholds-api.md)    | API định mức tồn min/max theo `(item, location)`              |
| [TKT-065](./tickets/TKT-065-backoffice-item-form-rebuild.md) | Backoffice UI form 3 tab (Cơ bản / Bổ sung / Kho)             |
| [TKT-066](./tickets/TKT-066-item-management-test-plan.md)    | E2E + migration test + regression + docs                      |

### Ticket dependency graph (EPIC-010)

```mermaid
flowchart LR
  T59["TKT-059 Schema migration"] --> T60["TKT-060 Entity & DTO"]
  T59 --> T61["TKT-061 Item-providers API"]
  T59 --> T63["TKT-063 Item-barcodes API"]
  T59 --> T64["TKT-064 Stock-thresholds API"]
  T62["TKT-062 Provider CRUD"] --> T61
  T60 --> T65["TKT-065 UI rebuild"]
  T61 --> T65
  T63 --> T65
  T64 --> T65
  T65 --> T66["TKT-066 E2E + DoD"]
  T60 --> T66
  T61 --> T66
  T63 --> T66
  T64 --> T66
```

## EPIC-013 Stock-by-Location Query API (Phase 1)

- [EPIC-013 Stock-by-Location Query API](./epics/EPIC-013-stock-by-location-api.md)
- Tickets: [TKT-067](./tickets/TKT-067-stock-by-location-service.md) – [TKT-069](./tickets/TKT-069-stock-by-location-test-plan.md)

| Ticket                                                       | Mô tả                                                                                   |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| [TKT-067](./tickets/TKT-067-stock-by-location-service.md)    | DTO + Service: query builder + filter mapping + computed `belowMin`                     |
| [TKT-068](./tickets/TKT-068-stock-by-location-controller.md) | Controller `GET /inventory/locations/:locationId/stock-items` + Swagger + OpenAPI regen |
| [TKT-069](./tickets/TKT-069-stock-by-location-test-plan.md)  | Test plan (unit + e2e) + DoD gate                                                       |

### Ticket dependency graph (EPIC-013)

```mermaid
flowchart LR
  T67["TKT-067 DTO & Service"] --> T68["TKT-068 Controller + OpenAPI"]
  T68 --> T69["TKT-069 Test plan + DoD"]
  T67 --> T69
## EPIC-011 POS Return & Exchange

- [EPIC-011 POS Return & Exchange](./epics/EPIC-011-pos-return-exchange.md)
- Plan: [docs/plan-return-exchange.md](../docs/plan-return-exchange.md)
- Tickets: [TKT-067](./tickets/TKT-067-pos-legacy-scaffolding-cleanup.md) – [TKT-074](./tickets/TKT-074-return-exchange-test-plan.md)

| Ticket                                                                | Mô tả                                                                                                 |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [TKT-067](./tickets/TKT-067-pos-legacy-scaffolding-cleanup.md)        | Xoá legacy `SaleEntity` / `ReturnService` / `ExchangeService` (zero behavior change)                  |
| [TKT-068](./tickets/TKT-068-return-exchange-schema-migrations.md)     | 4 migration: invoice type/refund fields, item direction, `customer_credits` table                     |
| [TKT-069](./tickets/TKT-069-return-entities-topics-and-enums.md)      | Entity updates + 5 Kafka topics + DomainEventType + shared enums                                      |
| [TKT-070](./tickets/TKT-070-return-publishers-and-consumers.md)       | 5 publishers + 4 idempotent consumers (stock-return-in, cash-refund, loyalty-reverse, journal-return) |
| [TKT-071](./tickets/TKT-071-customer-credit-service.md)               | `CustomerCreditEntity` + service (issue / redeem)                                                     |
| [TKT-072](./tickets/TKT-072-return-eligibility-and-draft-services.md) | `checkout-shared.ts` + eligibility + draft creation services                                          |
| [TKT-073](./tickets/TKT-073-checkout-return-service-and-api.md)       | `CheckoutReturnService` + DTOs + 4 endpoint + module wiring                                           |
| [TKT-074](./tickets/TKT-074-return-exchange-test-plan.md)             | E2E (4 flow) + unit + manual verification + docs update                                               |

### Ticket dependency graph (EPIC-011)

```mermaid
flowchart LR
  T67["TKT-067 Legacy cleanup"] --> T68["TKT-068 Schema migrations"]
  T68 --> T69["TKT-069 Entities + topics"]
  T69 --> T70["TKT-070 Publishers + consumers"]
  T69 --> T71["TKT-071 Customer credit service"]
  T69 --> T72["TKT-072 Eligibility + draft services"]
  T70 --> T73["TKT-073 Checkout-return + API"]
  T71 --> T73
  T72 --> T73
  T73 --> T74["TKT-074 Test plan + DoD"]
```

## EPIC-20052026 Quản lý Nhân viên & Hồ sơ nhân sự (Employee HR Profile)

- [EPIC-20052026 Employee HR Profile](./epics/EPIC-20052026-employee-hr-management.md)
- Mở rộng DB + API backend để lưu/đọc dữ liệu HR mà FE (`pages/employees/`, modal 5 tab) đã thu thập sẵn; gỡ readonly 3 tab HR.

| Ticket     | Mô tả                                                                                                                                                             |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TKT-EMP-01 | Migration: 5 bảng (`job_positions`, `employee_profiles`, `employee_addresses`, `employee_emergency_contacts`, `employee_access_schedules`) + enums + index/unique |
| TKT-EMP-02 | shared-interfaces: enums HR + `EmployeeProfilePayload`/`EmployeeProfileView`; mở rộng `CreateUserRequest`/`UpdateUserRequest`/`UserDetail`                        |
| TKT-EMP-03 | Entities + `job_positions` đăng ký `EntityRegistryService` + permissions seed `hr.job_position.*`                                                                 |
| TKT-EMP-04 | DTO `EmployeeProfileDto` + mở rộng `UsersService.create/update/findById` (transaction, validate, inline jobPosition) + unit test                                  |
| TKT-EMP-05 | `pnpm openapi:generate` + commit api-client snapshot                                                                                                              |
| TKT-EMP-06 | FE wiring `user-form.ts` + `employee.mappers.ts`; enable field code/mobile                                                                                        |
| TKT-EMP-07 | FE gỡ readonly 3 tab HR + dropdown vị trí công việc + detail panel                                                                                                |
| TKT-EMP-08 | E2E employee flow + docs                                                                                                                                          |

### Ticket dependency graph (EPIC-20052026)

```mermaid
flowchart LR
  E1["TKT-EMP-01 Migration"] --> E3["TKT-EMP-03 Entities + jobPos CRUD"]
  E2["TKT-EMP-02 shared-interfaces"] --> E4["TKT-EMP-04 Service + DTO"]
  E1 --> E4
  E3 --> E4
  E4 --> E5["TKT-EMP-05 openapi:generate"]
  E5 --> E6["TKT-EMP-06 FE mappers"]
  E3 --> E7["TKT-EMP-07 FE tabs + dropdown"]
  E6 --> E7
  E4 --> E8["TKT-EMP-08 E2E + docs"]
  E7 --> E8
```

## EPIC-18052026 Phiếu Thu, Phiếu Chi và Sổ Tiền Mặt (Backend-only)

- [EPIC-18052026 Cash Vouchers (Backend-only)](./epics/EPIC-18052026-cash-vouchers.md)
- **Scope: chỉ backend.** Toàn bộ frontend (backoffice pages, form, nav, badge) tách sang FE epic riêng — xem section "Deferred FE work" trong epic.
- Tickets: [TKT-CV-00](./tickets/TKT-CV-00-cash-tx-jeid-refactor.md) (prerequisite), [TKT-CV-01](./tickets/TKT-CV-01-schema-migration.md) – [TKT-CV-23](./tickets/TKT-CV-23-openapi-e2e-auto.md) + [TKT-CV-OB1](./tickets/TKT-CV-OB1-outbox-schema.md) – [TKT-CV-OB3](./tickets/TKT-CV-OB3-wire-publish-outbox.md). Các số 08–11, 19–21 là ticket FE đã defer (không có file).
- Follow-up: [EPIC-21052026 Cash Vouchers — Follow-up Refactor](./epics/EPIC-21052026-cash-vouchers-followup-refactor.md) (gom các scope item #7–#11 phát hiện khi review plan).

### Phase 1 (manual flow + ledger + kiểm kê)

| Ticket                                                          | Mô tả                                                                                                                                                                       |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [TKT-CV-00](./tickets/TKT-CV-00-cash-tx-jeid-refactor.md)       | **Prerequisite** — refactor `recordMovement`/`JournalService.post` nhận `manager?` + `recordMovement` trả `journalEntryId` (vá atomic, deadlock cash-count, dual-write gap) |
| [TKT-CV-01](./tickets/TKT-CV-01-schema-migration.md)            | Migration 6 bảng + enums + reversal dedupe index (DocumentType cash đã có sẵn — chỉ verify)                                                                                 |
| [TKT-CV-02](./tickets/TKT-CV-02-module-bootstrap-categories.md) | Entities + DTOs + module + register categories + seed mặc định                                                                                                              |
| [TKT-CV-03](./tickets/TKT-CV-03-cash-receipt-service.md)        | CashReceiptService + Controller (CRUD/post/reverse + 2 internal method)                                                                                                     |
| [TKT-CV-04](./tickets/TKT-CV-04-cash-payment-service.md)        | CashPaymentService + Controller (đối xứng)                                                                                                                                  |
| [TKT-CV-05](./tickets/TKT-CV-05-cash-ledger-service.md)         | CashLedgerService + Controller (cursor pagination, running balance in-RAM)                                                                                                  |
| [TKT-CV-06](./tickets/TKT-CV-06-cash-count-service.md)          | CashCountService + Controller (variance → voucher)                                                                                                                          |
| [TKT-CV-07](./tickets/TKT-CV-07-permissions-coa-seed.md)        | Permissions seed + COA TK 711/811                                                                                                                                           |
| [TKT-CV-12](./tickets/TKT-CV-12-openapi-e2e-manual.md)          | OpenAPI regen + E2E manual flow (gate Phase 1)                                                                                                                              |

### Phase 2 (auto-create vouchers + Transactional Outbox)

| Ticket                                                        | Mô tả                                                                     |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| [TKT-CV-13](./tickets/TKT-CV-13-schema-extension.md)          | Schema extension: unique reference + payment_method/cash/JE link          |
| [TKT-CV-14](./tickets/TKT-CV-14-event-topics-dtos.md)         | Event topics + payload DTOs                                               |
| [TKT-CV-15](./tickets/TKT-CV-15-voucher-consumers.md)         | 4 voucher consumers (POS createAndPost / 3 flow createVoucherForMovement) |
| [TKT-CV-16](./tickets/TKT-CV-16-refactor-pos-consumer.md)     | Refactor CashFromPaymentConsumer → pos-cash-sale consumer                 |
| [TKT-CV-17](./tickets/TKT-CV-17-source-accounting-publish.md) | A-revised source accounting + publish needed (debt/GR/expense)            |
| [TKT-CV-18](./tickets/TKT-CV-18-link-back-consumers.md)       | Link-back consumers (FK back-fill)                                        |
| [TKT-CV-22](./tickets/TKT-CV-22-voucher-source-api.md)        | API delta: source filter + sourceLink (BE-only; UI defer)                 |
| [TKT-CV-23](./tickets/TKT-CV-23-openapi-e2e-auto.md)          | OpenAPI regen + E2E auto flow (gate Phase 2)                              |
| [TKT-CV-OB1](./tickets/TKT-CV-OB1-outbox-schema.md)           | Transactional Outbox — schema                                             |
| [TKT-CV-OB2](./tickets/TKT-CV-OB2-outbox-service-relay.md)    | Transactional Outbox — service + relay                                    |
| [TKT-CV-OB3](./tickets/TKT-CV-OB3-wire-publish-outbox.md)     | Wire publish qua outbox                                                   |

### Ticket dependency graph (EPIC-18052026 — BE-only)

```mermaid
flowchart LR
  CV0["TKT-CV-00 recordMovement TX+jeId"] --> CV3
  CV0 --> CV4
  CV1["TKT-CV-01 Schema"] --> CV2["TKT-CV-02 Bootstrap"]
  CV2 --> CV3["TKT-CV-03 Receipt"]
  CV2 --> CV4["TKT-CV-04 Payment"]
  CV3 --> CV5["TKT-CV-05 Ledger"]
  CV4 --> CV5
  CV3 --> CV6["TKT-CV-06 Count"]
  CV4 --> CV6
  CV2 --> CV7["TKT-CV-07 Perms+COA"]
  CV3 --> CV12["TKT-CV-12 OpenAPI+E2E P1"]
  CV4 --> CV12
  CV5 --> CV12
  CV6 --> CV12
  CV7 --> CV12
  CV12 --> CV13["TKT-CV-13 Schema ext"]
  CV13 --> CV14["TKT-CV-14 Topics"]
  CV14 --> CV15["TKT-CV-15 Consumers"]
  CV14 --> CV17["TKT-CV-17 Source publish"]
  CV17 --> CV15
  CV15 --> CV16["TKT-CV-16 POS refactor"]
  CV15 --> CV18["TKT-CV-18 Link-back"]
  CV15 --> CV22["TKT-CV-22 Source API"]
  CV12 --> OB1["TKT-CV-OB1 Outbox schema"]
  OB1 --> OB2["TKT-CV-OB2 Outbox svc+relay"]
  OB2 --> OB3["TKT-CV-OB3 Wire outbox"]
  CV15 --> OB3
  CV16 --> OB3
  CV17 --> OB3
  CV16 --> CV23["TKT-CV-23 OpenAPI+E2E P2"]
  CV18 --> CV23
  CV22 --> CV23
  OB3 --> CV23
```

## EPIC-31052026 Inventory Item Form Refactor (KiotViet-style)

- [EPIC-31052026 Inventory Item Form Refactor](./epics/EPIC-31052026-inventory-item-form-refactor.md)
- Mở rộng [EPIC-010 Item Management Enhancement](./epics/EPIC-010-item-management-enhancement.md): refactor form tạo/sửa hàng hóa (`backoffice-web`) cho khớp ảnh tham chiếu + Brand master-data + Item Category (nhóm cha/mô tả/hoa hồng) + multi-provider + đơn vị chuyển đổi + edit mode.

| Ticket                                                        | Mô tả                                                              |
| ------------------------------------------------------------- | ------------------------------------------------------------------ |
| [TKT-IIF-01](./tickets/TKT-IIF-01-brand-master-entity.md)     | BE: `BrandEntity` (`inventory-brands`) + `item.brandId`            |
| [TKT-IIF-02](./tickets/TKT-IIF-02-item-category-extension.md) | BE: Item Category + nhóm cha + mô tả + bảng hoa hồng               |
| [TKT-IIF-03](./tickets/TKT-IIF-03-item-update-nested.md)      | BE: Item update reconcile providers/units + brandId                |
| [TKT-IIF-04](./tickets/TKT-IIF-04-fe-data-hooks.md)           | FE: hooks brand/category/unit/provider (bỏ data hardcode)          |
| [TKT-IIF-05](./tickets/TKT-IIF-05-fe-dialogs.md)              | FE: 4 dialog quick-create + danh sách thương hiệu (#3/#4/#5/#6/#7) |
| [TKT-IIF-06](./tickets/TKT-IIF-06-fe-form-layout.md)          | FE: refactor layout tab cơ bản (#2) + wire dropdown + #9           |
| [TKT-IIF-07](./tickets/TKT-IIF-07-fe-multi-provider-table.md) | FE: bảng nhiều nhà cung cấp (#8)                                   |
| [TKT-IIF-08](./tickets/TKT-IIF-08-fe-edit-mode.md)            | FE: edit mode dùng lại form giàu                                   |
| [TKT-IIF-09](./tickets/TKT-IIF-09-test-plan.md)               | E2E + test plan + DoD gate                                         |

### Ticket dependency graph (EPIC-31052026)

```mermaid
flowchart LR
  T1["TKT-IIF-01 Brand BE"] --> T3["TKT-IIF-03 Item update BE"]
  T1 --> T4["TKT-IIF-04 FE hooks"]
  T2["TKT-IIF-02 Category BE"] --> T4
  T3 --> T7["TKT-IIF-07 Provider table"]
  T3 --> T8["TKT-IIF-08 Edit mode"]
  T4 --> T5["TKT-IIF-05 Dialogs"]
  T5 --> T6["TKT-IIF-06 Form layout"]
  T4 --> T6
  T6 --> T7
  T6 --> T8
  T7 --> T8
  T6 --> T9["TKT-IIF-09 E2E + DoD"]
  T8 --> T9
  T1 --> T9
  T2 --> T9
  T3 --> T9
```

## EPIC-03062026 POS server-side invoice search

- [EPIC-03062026 POS server-side invoice search](./epics/EPIC-03062026-pos-invoice-search.md)
- Chuyển 3 màn danh sách hóa đơn trên `pos-web` từ lọc client-side sang **search server-side** qua các endpoint CQRS riêng (theo skill `cqrs-search-endpoint`), KHÔNG đụng `POST /v2/invoices/search` đang dùng cho `InvoiceListPage`. #5 "Đổi trả nhanh" = SALE+PAID; "Tổng thanh toán" = `totalPaid`; tên cửa hàng/chi nhánh do endpoint mới join branch trả inline.

| Ticket                                                             | Mô tả                                                                       |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| [TKT-PIS-01](./tickets/TKT-PIS-01-be-returnable-invoice-search.md) | BE: `POST /v2/invoices/returnable/search` (#5, SALE+PAID, branch-scoped)    |
| [TKT-PIS-02](./tickets/TKT-PIS-02-be-purchase-history-search.md)   | BE: `POST /v2/invoices/purchase-history/search` (#2, org-wide / customerId) |
| [TKT-PIS-03](./tickets/TKT-PIS-03-be-draft-invoice-search.md)      | BE: `POST /v2/invoices/drafts/search` (#4, free-text OR + date range)       |
| [TKT-PIS-04](./tickets/TKT-PIS-04-fe-invoice-search-data-layer.md) | FE: DTOs + `invoiceService` + `INVOICE_KEYS` + hooks + filter→body mapper   |
| [TKT-PIS-05](./tickets/TKT-PIS-05-fe-return-goods-search.md)       | FE: wire "Đổi trả nhanh" (#5) server-side                                   |
| [TKT-PIS-06](./tickets/TKT-PIS-06-fe-purchase-history-search.md)   | FE: wire "Lịch sử mua hàng" (#2) server-side                                |
| [TKT-PIS-07](./tickets/TKT-PIS-07-fe-draft-invoices-search.md)     | FE: wire "Hóa đơn chưa thanh toán" (#4) server-side                         |

### Ticket dependency graph (EPIC-03062026)

```mermaid
flowchart LR
  T1["TKT-PIS-01 BE returnable"] --> T4["TKT-PIS-04 FE data layer"]
  T2["TKT-PIS-02 BE purchase-history"] --> T4
  T3["TKT-PIS-03 BE drafts"] --> T4
  T1 --> T5["TKT-PIS-05 FE #5"]
  T2 --> T6["TKT-PIS-06 FE #2"]
  T3 --> T7["TKT-PIS-07 FE #4"]
  T4 --> T5
  T4 --> T6
  T4 --> T7
```

## EPIC-03062026 POS per-line discount breakdown + line note in read APIs

- [EPIC-03062026 POS per-line discount breakdown](./epics/EPIC-03062026-pos-line-discount-breakdown.md)
- Mỗi dòng hàng trên hóa đơn POS mang KM/chiết khấu **thủ công** riêng (vd "KM 10 % (59.000) - cc") + ghi chú riêng, lưu **đầy đủ breakdown** (type/value/amount/reason) vào `invoice_items` và **trả về** ở mọi API đọc. `note` + `lineDiscount` (số tiền) đã có sẵn; thêm `line_discount_type/value/reason`. Ba V2 search posted (search/returnable/purchase-history) được gắn thêm `items[]` theo pattern của draft search. **Chỉ backend** — không đụng FE pos-web; không liên kết PromotionEntity (chiết khấu thủ công, không phải chương trình KM).

| Ticket                                                                  | Mô tả                                                                               |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [TKT-LDB-01](./tickets/TKT-LDB-01-be-schema-line-discount-breakdown.md) | BE: migration + entity — thêm `line_discount_type/value/reason` vào `invoice_items` |
| [TKT-LDB-02](./tickets/TKT-LDB-02-be-dto-service-compute.md)            | BE: DTO 3 field mới + `computeLineDiscount()` dùng chung `create()`/`update()`      |
| [TKT-LDB-03](./tickets/TKT-LDB-03-be-read-apis-line-items.md)           | BE: gắn `items[]` vào 3 V2 search posted + verify detail/draft + openapi regen      |
| [TKT-LDB-04](./tickets/TKT-LDB-04-be-tests-e2e.md)                      | BE: unit compute + handler attach specs + E2E round-trip create→read + DoD          |

### Ticket dependency graph (EPIC-03062026 line-discount)

```mermaid
flowchart LR
  T1["TKT-LDB-01 Schema + entity"] --> T2["TKT-LDB-02 DTO + compute"]
  T1 --> T3["TKT-LDB-03 Read APIs + openapi"]
  T2 --> T4["TKT-LDB-04 Tests + E2E"]
  T3 --> T4
```

## EPIC-03062026 Loyalty point rate change (earn ÷10000, redeem 1pt = 500đ)

- [EPIC-03062026 Loyalty point rate change](./epics/EPIC-03062026-loyalty-point-rate-change.md)
- Đổi giá trị chương trình tích điểm: 1.000.000đ mua hàng → **100 điểm** (10% ÷ 1.000), đổi **100 điểm = 50.000đ** (1 điểm = 500đ), cashback thực ~**5%** (giảm từ ~100%). Chỉ đổi **2 hằng số** `POINT_EARN_VND_PER_POINT` (1000 → **10000**) + `POINT_REDEMPTION_VALUE_VND` (1000 → **500**) + sửa số magic `1000` trong consumer hoàn điểm khi trả hàng → dùng hằng số. **Không** migration, **không** entity/endpoint/event mới. ⚠️ Yêu cầu gốc chỉ nói redemption, nhưng ví dụ (1tr → 100 điểm) buộc đổi cả earn — chốt ở Step 3.

| Ticket                                                                   | Mô tả                                                                            |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| [TKT-LPR-01](./tickets/TKT-LPR-01-be-rate-constants-and-reversal-fix.md) | BE: đổi 2 hằng số earn/redeem + thay magic `1000` ở reverse consumer + unit test |
| [TKT-LPR-02](./tickets/TKT-LPR-02-fe-pos-redemption-mirror.md)           | FE: cập nhật mirror `POINT_REDEMPTION_VALUE_VND = 500` ở pos-web + copy hiển thị |
| [TKT-LPR-03](./tickets/TKT-LPR-03-e2e-loyalty-rate-regression.md)        | E2E: regression earn 100 / redeem 50.000 / reverse 100 + re-baseline assertions  |

### Ticket dependency graph (EPIC-03062026 loyalty-rate)

```mermaid
flowchart LR
  T1["TKT-LPR-01 BE constants + reversal fix"] --> T2["TKT-LPR-02 FE mirror"]
  T1 --> T3["TKT-LPR-03 E2E regression"]
  T2 --> T3
```

## EPIC-03062026 Backoffice admin list server-side CQRS search

- [EPIC-03062026 Backoffice admin list server-side CQRS search](./epics/EPIC-03062026-admin-list-cqrs-search.md)
- Thêm endpoint **CQRS v2 search** (theo skill `cqrs-search-endpoint`) cho 5 màn danh sách admin hiện do generic CRUD (`/admin/entities/:entityKey/records`) + `/admin/users` phục vụ: `customers`, `inventory-providers`, `job-positions`, `accounts`, `employees`. **Một controller chung** `AdminSearchV2Controller` (module mới `AdminSearchModule`) host cả 5 route `POST /v2/<entity>/search`; 4 module entity cũ KHÔNG đụng. Nâng filter lên **per-column operators** (contains/equals/range/compare) query toàn bộ dataset, phân trang. **Chỉ backend** — KHÔNG rewire FE, KHÔNG đụng `/records` hay `/admin/users`. Ràng buộc cứng: **dữ liệu từng dòng giống hệt hiện tại, không trả thiếu** — giữ `groupName` (NCC), `profile.jobPosition` (nhân viên), `parentAccountId` thô (COA), `code` (KH). Envelope đổi sang `{ data,total,page,limit }` (an toàn vì FE chưa nối). Tất cả scope theo `organizationId` (không branch-scope). Tái dùng permission cũ, không seed mới.

| Ticket                                                              | Mô tả                                                                      |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [TKT-ACS-01](./tickets/TKT-ACS-01-be-customers-search.md)           | BE: scaffold `AdminSearchModule`/controller + `POST /v2/customers/search`  |
| [TKT-ACS-02](./tickets/TKT-ACS-02-be-inventory-providers-search.md) | BE: `POST /v2/inventory-providers/search` (giữ `groupName` flatten)        |
| [TKT-ACS-03](./tickets/TKT-ACS-03-be-job-positions-search.md)       | BE: `POST /v2/job-positions/search` (đơn giản, soft-delete excluded)       |
| [TKT-ACS-04](./tickets/TKT-ACS-04-be-accounts-search.md)            | BE: `POST /v2/accounts/search` (giữ `parentAccountId` thô, không join)     |
| [TKT-ACS-05](./tickets/TKT-ACS-05-be-employees-search.md)           | BE: `POST /v2/employees/search` (giữ full `UserListItem`, tái dùng mapper) |
| [TKT-ACS-06](./tickets/TKT-ACS-06-openapi-regen.md)                 | OpenAPI regen + api-client snapshot cho FE epic sau                        |

### Ticket dependency graph (EPIC-03062026 admin-list-cqrs-search)

```mermaid
flowchart LR
  T1["TKT-ACS-01 Scaffold + customers"] --> T2["TKT-ACS-02 inventory-providers"]
  T1 --> T3["TKT-ACS-03 job-positions"]
  T1 --> T4["TKT-ACS-04 accounts"]
  T1 --> T5["TKT-ACS-05 employees"]
  T1 --> T6["TKT-ACS-06 OpenAPI regen"]
  T2 --> T6
  T3 --> T6
  T4 --> T6
  T5 --> T6
```

## EPIC-03062026 Backoffice admin list server-side search — FE wiring

- [EPIC-03062026 Backoffice admin list server-side search — FE wiring](./epics/EPIC-03062026-admin-list-cqrs-search-fe.md)
- Nối `backoffice-web` (5 màn admin) vào 5 endpoint CQRS `POST /v2/<entity>/search`: filter theo từng cột query **toàn bộ** dataset + phân trang server-side, bỏ lọc client-side (`applyColumnFilter` cũ chỉ lọc trang đã tải). **Mở rộng `CrudListPage` có cổng (registry 4 entity CRUD)** — entity khác KHÔNG đổi; `EmployeesPage` migrate riêng. Bỏ sort cột (createdAt DESC như POS v2). Thêm filter cell **date-range** cho `createdAt`. Chỉ FE.

| Ticket                                                            | Mô tả                                                                             |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [TKT-ACSFE-01](./tickets/TKT-ACSFE-01-fe-data-layer.md)           | FE: registry + `ColumnFilter→v2 body` mapper + hooks (`useCrudV2Search`/employee) |
| [TKT-ACSFE-02](./tickets/TKT-ACSFE-02-fe-datatable-date-range.md) | FE: thêm filter kind `date-range` vào `BaseDataTable`                             |
| [TKT-ACSFE-03](./tickets/TKT-ACSFE-03-fe-crudlistpage-wiring.md)  | FE: `CrudListPage` server-side v2 search có cổng (4 entity CRUD)                  |
| [TKT-ACSFE-04](./tickets/TKT-ACSFE-04-fe-employees-page.md)       | FE: migrate `EmployeesPage` sang `POST /v2/employees/search`                      |

### Ticket dependency graph (EPIC-03062026 admin-list-cqrs-search-fe)

```mermaid
flowchart LR
  T1["TKT-ACSFE-01 data layer"] --> T3["TKT-ACSFE-03 CrudListPage"]
  T2["TKT-ACSFE-02 date-range cell"] --> T3
  T1 --> T4["TKT-ACSFE-04 EmployeesPage"]
  T2 --> T4
```

## EPIC-03062026 Inventory item server-side grouped search (v2)

- [EPIC-03062026 Inventory item server-side grouped search (v2)](./epics/EPIC-03062026-inventory-item-search-v2.md)
- Thêm endpoint **CQRS v2 search** (skill `cqrs-search-endpoint`) cho mặt hàng kho: `POST /v2/inventory-items/search`. Đẩy filter của trang `/admin/inventory-items` xuống backend (search toàn cục + `isActive`/`isPosVisible`/`categoryId`/`productId`/`brand`/`itemType`), **trả y hệt shape product-group** mà `listProductGroups` đang trả (`ProductGroupRow`, envelope `{ data,total,page,pageSize }`, sort `code ASC`, gom nhóm product+category, `AVG/bool_and/MIN/COUNT`). **Chỉ backend** — KHÔNG rewire FE (làm sau); chạy `openapi:generate` chuẩn bị cho FE. Scope `organizationId` (không branch-scope), permission `inventory.read`, không seed mới. Đề xuất **Hướng A** (mở rộng SQL `listProductGroups`) để bảo đảm byte-identical; Hướng B (in-memory) nêu kèm — chốt ở Step 3.

| Ticket                                                                | Mô tả                                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [TKT-IIS-01](./tickets/TKT-IIS-01-be-extend-product-group-filters.md) | BE: mở rộng `listProductGroups` + `ProductGroupsQueryDto` với 5 filter optional |
| [TKT-IIS-02](./tickets/TKT-IIS-02-be-cqrs-grouped-search-endpoint.md) | BE: DTO + Query + Handler + `@Version('2')` controller + wire `CqrsModule`      |
| [TKT-IIS-03](./tickets/TKT-IIS-03-be-openapi-and-tests.md)            | BE: `openapi:generate` + tests (parity/scope/filter) + DoD gate                 |

### Ticket dependency graph (EPIC-03062026 inventory-item-search-v2)

```mermaid
flowchart LR
  T1["TKT-IIS-01 Extend listProductGroups filters"] --> T2["TKT-IIS-02 CQRS endpoint + wiring"]
  T2 --> T3["TKT-IIS-03 openapi + tests + DoD"]
```

## EPIC-03062026 Inventory list server-side CQRS search (categories + Nhập/Xuất kho)

- [EPIC-03062026 Inventory list server-side CQRS search](./epics/EPIC-03062026-inventory-list-cqrs-search.md)
- Phase-2 of the admin-list CQRS search initiative. Add **CQRS v2 search endpoints** + FE wiring for three more list surfaces: Nhóm hàng hoá (`/admin/inventory-item-categories`), Nhập kho (`/inventory/purchase-orders` → goods-receipts), Xuất kho (`/inventory/goods-issues`). Reuses `FilterBuilder` + shared filter sub-DTOs, envelope `{ data, total, page, limit }`, sort = each page's current default. **Trả y chang** what the FE renders today (goods-receipt/issue keep nested `provider`/`targetBranch`; categories full entity) **plus** a computed `totalAmount` (SQL `SUM(qty×unitPrice)` subquery, filterable). categories search goes in `AdminSearchModule`; goods-receipt/issue in their own modules (`*-v2.controller.ts`, mirroring `inventory-item-v2.controller.ts`). FE: categories = one `CRUD_V2_SEARCH` registry entry; Nhập/Xuất kho = bespoke filter rows on the hand-built pages. No schema/migration/events; org-scope categories, org+branch goods-receipt/issue; reuse `inventory.read`.

| Ticket                                                          | Mô tả                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [TKT-ILS-01](./tickets/TKT-ILS-01-be-goods-receipt-search.md)   | BE: `POST /v2/goods-receipts/search` (goods-receipt module) + computed `totalAmount` |
| [TKT-ILS-02](./tickets/TKT-ILS-02-be-goods-issue-search.md)     | BE: `POST /v2/inventory/goods-issues/search` + polymorphic party + `totalAmount`     |
| [TKT-ILS-03](./tickets/TKT-ILS-03-be-item-categories-search.md) | BE: `POST /v2/inventory-item-categories/search` (AdminSearch module)                 |
| [TKT-ILS-04](./tickets/TKT-ILS-04-openapi-regen.md)             | OpenAPI regen + api-client snapshot for the 3 endpoints                              |
| [TKT-ILS-05](./tickets/TKT-ILS-05-fe-goods-receipt-page.md)     | FE: Nhập kho (`PurchaseOrdersPage`) server-side per-column filters + pagination      |
| [TKT-ILS-06](./tickets/TKT-ILS-06-fe-goods-issue-page.md)       | FE: Xuất kho (`GoodsIssuePage`) server-side per-column filters + pagination          |
| [TKT-ILS-07](./tickets/TKT-ILS-07-fe-categories-registry.md)    | FE: add `inventory-item-categories` entry to `CRUD_V2_SEARCH`                        |

### Ticket dependency graph (EPIC-03062026 inventory-list-cqrs-search)

```mermaid
flowchart LR
  T1["TKT-ILS-01 BE goods-receipt"] --> T4["TKT-ILS-04 OpenAPI regen"]
  T2["TKT-ILS-02 BE goods-issue"] --> T4
  T3["TKT-ILS-03 BE item-categories"] --> T4
  T4 --> T5["TKT-ILS-05 FE Nhập kho"]
  T4 --> T6["TKT-ILS-06 FE Xuất kho"]
  T4 --> T7["TKT-ILS-07 FE categories registry"]
```

## EPIC-07062026 Phiếu Điều Chuyển Kho (two-phase — extends TransferOrder)

- [EPIC-07062026 Phiếu Điều Chuyển Kho](./epics/EPIC-07062026-inventory-transfer-voucher.md)
- Biến **Lệnh điều chuyển hiện có** (`transfer_orders`) thành phiếu điều chuyển **2 pha**: Store A xác nhận **xuất**, Store B xác nhận **nhập** ở 2 thời điểm khác nhau, phiếu ở `IN_PROGRESS` (đang luân chuyển) ở giữa. State machine mới `DRAFT → IN_PROGRESS → COMPLETED` (+ `CANCELLED`) **thay** `DRAFT→APPROVED→EXECUTED` cũ (migrate `EXECUTED→COMPLETED`, `APPROVED→DRAFT`; bỏ `approve`/`markExecuted`). **Mở rộng tại chỗ** `transfer_orders` + `transfer_order_lines` (KHÔNG bảng mới); thêm **kho nguồn + kho đích theo từng dòng**. 2 chân tồn kho **tái dùng** GoodsIssue(`TRANSFER_OUT`) + GoodsReceipt(`TRANSFER_IN`) ledger-only (không bút toán/công nợ); `import_reference` = id GoodsReceipt nhập. Tồn âm ("xuất kho khống") được phép (ledger không chặn, cảnh báo client-side). Giữ mã `LDC` (`DocumentType.TRANSFER_ORDER`, render QR để in). Chỉ `backoffice-web` (sửa `TransferOrdersPage`), không scanner camera. Cancel `IN_PROGRESS` đảo chân xuất.

| Ticket                                                        | Mô tả                                                                                      |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [TKT-ITV-01](./tickets/TKT-ITV-01-schema-transfer-voucher.md) | BE: mở rộng `transfer_orders`+lines + rebuild enum `TransferOrderStatus` + data migration  |
| [TKT-ITV-02](./tickets/TKT-ITV-02-shared-interfaces.md)       | Shared: rebuild `TransferOrderStatus` + thêm field `TransferOrder`/`TransferOrderLine`     |
| [TKT-ITV-03](./tickets/TKT-ITV-03-service.md)                 | BE: viết lại service create/getByCode/update/export/import/cancel; bỏ approve/markExecuted |
| [TKT-ITV-04](./tickets/TKT-ITV-04-controller-module.md)       | BE: controller thay approve/execute → export/import + by-code; module wiring + events      |
| [TKT-ITV-05](./tickets/TKT-ITV-05-permissions.md)             | BE: seed `inventory.transfer.export` + `.import` + VI labels                               |
| [TKT-ITV-06](./tickets/TKT-ITV-06-openapi.md)                 | OpenAPI regen + api-client snapshot (bỏ approve/execute, thêm export/import)               |
| [TKT-ITV-07](./tickets/TKT-ITV-07-fe-data-layer.md)           | FE: mở rộng hook transfer-order (export/import/by-code) + cảnh báo tồn âm                  |
| [TKT-ITV-08](./tickets/TKT-ITV-08-fe-ui.md)                   | FE: cải tạo `TransferOrdersPage` — kho nguồn/đích theo dòng + xuất/nhập + QR               |
| [TKT-ITV-09](./tickets/TKT-ITV-09-e2e.md)                     | E2E round-trip 2 pha + migration remap + tồn âm + cancel-reverse + idempotency + DoD       |

### Ticket dependency graph (EPIC-07062026)

```mermaid
flowchart LR
  T1["TKT-ITV-01 Schema + enum rebuild"] --> T2["TKT-ITV-02 shared-interfaces"]
  T1 --> T3["TKT-ITV-03 Service rewrite"]
  T3 --> T4["TKT-ITV-04 Controller + module"]
  T5["TKT-ITV-05 Permissions"] --> T4
  T4 --> T6["TKT-ITV-06 OpenAPI"]
  T2 --> T7["TKT-ITV-07 FE data layer"]
  T6 --> T7
  T7 --> T8["TKT-ITV-08 FE UI rework"]
  T4 --> T9["TKT-ITV-09 E2E + DoD"]
  T5 --> T9
  T8 --> T9
```

## EPIC-08062026 Lập phiếu xuất kho từ Lệnh điều chuyển ("Tiện ích" MISA)

- [EPIC-08062026 Lập phiếu xuất kho từ Lệnh điều chuyển](./epics/EPIC-08062026-goods-issue-from-transfer.md)
- Thêm menu **Tiện ích** (MISA-style) vào form **Phiếu xuất kho** (`GoodsIssueFormDialog`, `backoffice-web`), mục **"Lập từ lệnh điều chuyển"** → dialog "Chọn lệnh điều chuyển" liệt kê lệnh `DRAFT` của **chi nhánh nguồn** → chọn → nạp dòng vào form → **Lưu = chân xuất (export)** của EPIC-07062026 (spawn 1 GoodsIssue `TRANSFER_OUT` có `referenceType=TRANSFER_ORDER`, lệnh `DRAFT→IN_PROGRESS`). **Một lần trừ kho duy nhất, KHÔNG migration** (cột `goods_issues.reference_*`/`target_branch_id` đã có). **Phụ thuộc EPIC-07062026 đã land**; mở rộng `POST /:id/export` để nhận dòng đã sửa + gắn reference.

| Ticket                                                       | Mô tả                                                                                                                   |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| [TKT-IFT-01](./tickets/TKT-IFT-01-shared-interfaces.md)      | Shared: `GoodsIssueReferenceType.TRANSFER_ORDER` + `IssuableTransferOrderListItem` + `ExportTransferOrderRequest`       |
| [TKT-IFT-02](./tickets/TKT-IFT-02-be-issuable-and-export.md) | BE: `GET /issuable` (DRAFT + source branch + date) + `confirmExport` nhận dòng đã sửa + gắn reference (KHÔNG migration) |
| [TKT-IFT-03](./tickets/TKT-IFT-03-openapi.md)                | OpenAPI regen + api-client snapshot                                                                                     |
| [TKT-IFT-04](./tickets/TKT-IFT-04-fe-data-layer.md)          | FE: `useIssuableTransferOrders` + `useExportTransferOrder` (export-with-lines) + mapper                                 |
| [TKT-IFT-05](./tickets/TKT-IFT-05-fe-ui.md)                  | FE: dropdown Tiện ích + `SelectTransferOrderDialog` + prefill + save-as-export                                          |
| [TKT-IFT-06](./tickets/TKT-IFT-06-e2e.md)                    | E2E: issuable scope + export-from-form + no-double-issue + idempotency + DoD gate                                       |

### Ticket dependency graph (EPIC-08062026)

```mermaid
flowchart LR
  ITV["EPIC-07062026 (ITV) landed"] --> T2
  T1["TKT-IFT-01 shared-interfaces"] --> T2["TKT-IFT-02 BE issuable + export"]
  T2 --> T3["TKT-IFT-03 OpenAPI"]
  T3 --> T4["TKT-IFT-04 FE data layer"]
  T4 --> T5["TKT-IFT-05 FE UI"]
  T2 --> T6["TKT-IFT-06 E2E + DoD"]
  T5 --> T6
```

## EPIC-08062026 Phiếu xuất kho — round-trip đầy đủ trường

- [EPIC-08062026 Phiếu xuất kho — round-trip đầy đủ trường](./epics/EPIC-08062026-goods-issue-form-roundtrip.md)
- Form **Phiếu xuất kho** (`GoodsIssueFormDialog`, `backoffice-web`) mất dữ liệu giữa lúc tạo và xem lại: **Kho/Vị trí/Cửa hàng đích/Đối tượng/Tham chiếu** trống, **Người giao/Ngày-Giờ xuất** không lưu. Epic chuẩn hoá round-trip: **CÓ migration** thêm `goods_issues.deliverer` (varchar, Người giao text), `references` (jsonb `string[]`, danh sách mã tham chiếu FE gửi), `occurred_at` (timestamptz, ngày/giờ nhập). Fix read-path (v2 search thiếu `lines.location` → Kho/Vị trí trống) và FE map (`targetBranchLabel` không init; DetailPanel dùng location header cho mọi dòng). Provider giữ nguyên cho `TRANSFER_OUT`.

| Ticket                                                    | Mô tả                                                                                        |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [TKT-GIR-01](./tickets/TKT-GIR-01-schema-entity.md)       | Migration + entity: `deliverer` / `references` (jsonb) / `occurred_at`                       |
| [TKT-GIR-02](./tickets/TKT-GIR-02-be-dto-service-read.md) | BE: DTO + service persist 3 trường + read-path join `lines.location` (fix Kho/Vị trí)        |
| [TKT-GIR-03](./tickets/TKT-GIR-03-openapi.md)             | OpenAPI regen + api-client snapshot                                                          |
| [TKT-GIR-04](./tickets/TKT-GIR-04-fe-roundtrip.md)        | FE: gửi + load lại đủ trường; fix Cửa hàng đích label, Kho/Vị trí từng dòng, Tham chiếu list |
| [TKT-GIR-05](./tickets/TKT-GIR-05-e2e.md)                 | E2E round-trip + test plan + DoD gate                                                        |

### Ticket dependency graph (EPIC-08062026 round-trip)

```mermaid
flowchart LR
  T1["TKT-GIR-01 Migration + entity"] --> T2["TKT-GIR-02 BE DTO+service+read"]
  T2 --> T3["TKT-GIR-03 OpenAPI"]
  T3 --> T4["TKT-GIR-04 FE round-trip"]
  T2 --> T5["TKT-GIR-05 E2E + DoD"]
  T4 --> T5
```

## EPIC-08062026 Lập phiếu nhập kho từ chứng từ điều chuyển ("Chọn chứng từ điều chuyển")

- [EPIC-08062026 Lập phiếu nhập kho từ chứng từ điều chuyển](./epics/EPIC-08062026-goods-receipt-from-transfer.md)
- Chân **nhập** đối xứng chân xuất: trên form **Phiếu nhập kho** (`PurchaseOrderFormDialog`, `backoffice-web`), bật nút **"Chọn chứng từ điều chuyển"** (đang `disabled`) → dialog "Chọn chứng từ xuất kho điều chuyển" liệt kê lệnh `IN_PROGRESS` của **chi nhánh đích** (số phiếu **XK** + tổng tiền) → chọn → nạp dòng (khóa) + chọn **Kho nhận** → **Lưu = chân nhập** (`POST /:id/import`, lệnh `IN_PROGRESS→COMPLETED`, spawn GoodsReceipt `TRANSFER_IN`). **CÓ migration** `goods_receipts.references` jsonb (provider/deliveredBy/received_at đã có); mở rộng `confirmImport` nhận kho nhận + header round-trip. **Phụ thuộc EPIC-07062026 + goods-issue-from-transfer đã land.**

| Ticket                                                     | Mô tả                                                                                                     |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [TKT-GRT-01](./tickets/TKT-GRT-01-schema-shared.md)        | Schema `goods_receipts.references` + `ImportableTransferOrderListItem` + `ImportTransferOrderRequest` ext |
| [TKT-GRT-02](./tickets/TKT-GRT-02-be-importable-import.md) | BE: `GET /importable` (IN_PROGRESS + dest branch + XK số/tổng) + `confirmImport` nhận kho nhận + header   |
| [TKT-GRT-03](./tickets/TKT-GRT-03-openapi.md)              | OpenAPI regen + api-client snapshot                                                                       |
| [TKT-GRT-04](./tickets/TKT-GRT-04-fe-data-layer.md)        | FE: `useImportableTransferOrders` + transfer detail mapper                                                |
| [TKT-GRT-05](./tickets/TKT-GRT-05-fe-ui.md)                | FE: `SelectTransferReceiptDialog` + bật nút + prefill khóa + Kho nhận + save-as-import                    |
| [TKT-GRT-06](./tickets/TKT-GRT-06-e2e.md)                  | E2E: importable scope + import-from-form + no-double-receipt + idempotency + DoD gate                     |

### Ticket dependency graph (EPIC-08062026 goods-receipt-from-transfer)

```mermaid
flowchart LR
  ITV["EPIC-07062026 + goods-issue-from-transfer landed"] --> T2
  T1["TKT-GRT-01 Schema + shared"] --> T2["TKT-GRT-02 BE importable + import"]
  T2 --> T3["TKT-GRT-03 OpenAPI"]
  T3 --> T4["TKT-GRT-04 FE data layer"]
  T4 --> T5["TKT-GRT-05 FE UI"]
  T2 --> T6["TKT-GRT-06 E2E + DoD"]
  T5 --> T6
```

## EPIC-09062026 Chuyển kho giữa các kho trong cùng chi nhánh

- [EPIC-09062026 Chuyển kho giữa các kho trong cùng chi nhánh](./epics/EPIC-09062026-inter-warehouse-transfer.md)
- Nâng form **Chuyển kho** (`/inventory/stock-transfers`, module `inventory/transfer`) từ _chuyển giữa **vị trí** trong **một kho**_ sang _chuyển **kho → kho** trong **cùng chi nhánh**_, bám form mShopKeeper. **Mỗi dòng** mang `source_storage_id`/`destination_storage_id` riêng (+ vị trí tùy chọn; bỏ trống → location `is_unassigned` "Mặc định"). Ràng buộc cứng: mọi kho phải thuộc `actor.branchId` (liên chi nhánh vẫn là `transfer-order`). Khi **Lưu** = tạo + post nguyên tử: ghi `TRANSFER_OUT` rồi `TRANSFER_IN` trong **1 transaction** (`recordBatchMovements`, thêm khóa bi quan chống bán âm). Bổ sung `transporter_user_id` (Người vận chuyển — picker NV qua `/v2/employees/search`), `unit_price`/`line_value` (Đơn giá/Thành tiền; bỏ trống Đơn giá → snapshot giá vốn), `attachment_ids` (theo convention `jsonb` sẵn có), `transferred_at`. **Extend** entity/service/page sẵn có — KHÔNG module/permission mới. **CÓ migration** + backfill `*_storage_id` từ storage của location cũ.

| Ticket                                                                            | Mô tả                                                                            |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [TKT-IWT-01](./tickets/TKT-IWT-01-schema-storage-valuation-transporter.md)        | Migration + entity: per-line storage, đơn giá/thành tiền, transporter, attachments, transferred_at + backfill |
| [TKT-IWT-02](./tickets/TKT-IWT-02-service-kho-to-kho-posting.md)                  | DTO + Service: resolve vị trí mặc định, ràng buộc cùng chi nhánh, định giá, post 2 chân ledger 1 tx |
| [TKT-IWT-03](./tickets/TKT-IWT-03-controller-and-response-shaping.md)             | Controller + Swagger DTO + inline quan hệ (storages/locations/transporter) |
| [TKT-IWT-04](./tickets/TKT-IWT-04-openapi-regen.md)                               | `pnpm openapi:generate` + commit snapshot api-client |
| [TKT-IWT-05](./tickets/TKT-IWT-05-fe-unified-kho-to-kho-form.md)                  | FE: rebuild form Chuyển kho kho→kho (header + cột chi tiết + pickers + payload) |
| [TKT-IWT-06](./tickets/TKT-IWT-06-tests-and-dod.md)                               | Service spec + E2E + DoD gate |

### Ticket dependency graph (EPIC-09062026 inter-warehouse-transfer)

```mermaid
flowchart LR
  T1["TKT-IWT-01 Schema + entity"] --> T2["TKT-IWT-02 DTO + Service"]
  T2 --> T3["TKT-IWT-03 Controller + response"]
  T3 --> T4["TKT-IWT-04 openapi:generate"]
  T4 --> T5["TKT-IWT-05 FE form"]
  T3 --> T6["TKT-IWT-06 Tests + DoD"]
  T5 --> T6
```

## EPIC-09062026 Danh sách Chuyển kho theo mẫu mShopKeeper (v2 search + master-detail)

- [EPIC-09062026 Danh sách Chuyển kho theo mẫu mShopKeeper](./epics/EPIC-09062026-stock-transfer-list-v2.md)
- Clone UI **trang danh sách** Chuyển kho (`/inventory/stock-transfers`) theo mShopKeeper, mirror trang `Phiếu nhập`/`Xuất kho`: **CQRS v2 search** (`POST /v2/inventory/stock/transfers/search`) lọc theo từng cột (`=`/`*`/`≤`) toàn dataset + phân trang; cột **Ngày / Số phiếu chuyển (link) / Đối tượng (= Người vận chuyển) / Tổng tiền (∑ line_value) / Diễn giải** (bỏ Trạng thái/Số dòng/Tổng số lượng); **footer cộng Tổng tiền**; **panel "Chi tiết" master-detail** (dòng hàng kho/vị trí/đơn giá/thành tiền); toolbar **Thêm mới / Nhân bản / Xem / Sửa / Xóa / Nạp**. **Nhân bản** = mở form Thêm mới prefill (FE). **Xóa** = đảo bút toán + set `CANCELLED` (ledger bất biến, không hard-delete, không migration). Tái dùng `cqrs-search-endpoint`, `BaseDataTable` column filters + `useCrudV2Search`, `GoodsIssuePage`. Phụ thuộc [EPIC-09062026 Chuyển kho giữa các kho](./epics/EPIC-09062026-inter-warehouse-transfer.md) (transporter + line_value).

| Ticket                                                            | Mô tả                                                                       |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [TKT-STL-01](./tickets/TKT-STL-01-be-cqrs-v2-search.md)           | BE: `POST /v2/inventory/stock/transfers/search` (DTO + Query + Handler + controller) |
| [TKT-STL-02](./tickets/TKT-STL-02-be-reverse-and-void.md)         | BE: Xóa = đảo bút toán + set CANCELLED (mở rộng `cancel` cho POSTED)         |
| [TKT-STL-03](./tickets/TKT-STL-03-openapi-regen.md)               | `pnpm openapi:generate` + commit snapshot (DTO v2 introspect được)          |
| [TKT-STL-04](./tickets/TKT-STL-04-fe-list-redesign.md)            | FE: redesign danh sách (cột + column filters + footer + master-detail + Nhân bản + Xóa) |
| [TKT-STL-05](./tickets/TKT-STL-05-tests-and-dod.md)               | Handler spec + reverse spec + DoD gate                                      |

### Ticket dependency graph (EPIC-09062026 stock-transfer-list-v2)

```mermaid
flowchart LR
  T1["TKT-STL-01 BE v2 search"] --> T3["TKT-STL-03 openapi"]
  T2["TKT-STL-02 BE reverse+void"] --> T4["TKT-STL-04 FE list"]
  T3 --> T4
  T1 --> T5["TKT-STL-05 Tests + DoD"]
  T2 --> T5
  T4 --> T5
```

## EPIC-09062026 Sửa phiếu chuyển kho (POSTED) — đảo + ghi lại tồn kho

- [EPIC-09062026 Sửa phiếu chuyển kho (POSTED)](./epics/EPIC-09062026-stock-transfer-edit.md)
- Cho phép **sửa phiếu chuyển kho đã POSTED** (sửa mọi thông tin trừ `Số phiếu chuyển`). Vì sổ kho bất biến: khi lưu, hệ thống **đảo bút toán phiếu cũ (rollback tồn) rồi ghi bút toán mới** theo dữ liệu sửa trong **1 transaction**, giữ nguyên `id` + `Số phiếu chuyển` + POSTED. **Chặn nếu thiếu tồn** (khóa bi quan + kiểm tra net-delta mỗi `(item, location)`; kho xuất mới không đủ hoặc hàng đã rời kho nhập cũ → 400, rollback, phiếu gốc nguyên vẹn). Sửa CANCELLED → 400; DRAFT vẫn thay dòng no-ledger. **Mở rộng `update()`** (đang chỉ cho DRAFT) — tái dùng `resolveBranchScopedTransfer` + pattern đảo từ `cancel()` + khóa từ `post()` + `PATCH /:id`/DTO/`TransferFormDialog` edit đã có. **Không migration, không đổi OpenAPI, không permission mới.** Phụ thuộc [EPIC inter-warehouse-transfer](./epics/EPIC-09062026-inter-warehouse-transfer.md) + [EPIC list-v2](./epics/EPIC-09062026-stock-transfer-list-v2.md).

| Ticket                                                              | Mô tả                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [TKT-STE-01](./tickets/TKT-STE-01-be-edit-reverse-repost.md)        | BE: mở rộng `update()` cho POSTED — đảo + ghi lại 1 tx, net-delta chặn thiếu tồn |
| [TKT-STE-02](./tickets/TKT-STE-02-fe-enable-edit.md)                | FE: bật nút "Sửa" cho POSTED + reload danh sách/Chi tiết                         |
| [TKT-STE-03](./tickets/TKT-STE-03-tests-and-dod.md)                 | Service spec (đảo+ghi / chặn tồn / giữ số phiếu) + DoD gate                      |

### Ticket dependency graph (EPIC-09062026 stock-transfer-edit)

```mermaid
flowchart LR
  T1["TKT-STE-01 BE update() POSTED"] --> T2["TKT-STE-02 FE bật Sửa"]
  T1 --> T3["TKT-STE-03 Tests + DoD"]
  T2 --> T3
```

