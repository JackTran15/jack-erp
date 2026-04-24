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
