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

