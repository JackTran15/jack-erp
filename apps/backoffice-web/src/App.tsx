import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "./hooks/useAuth";
import { RequireAuth } from "./components/auth/RequireAuth";
import { BackofficeLayout } from "./components/layout/BackofficeLayout";
import { LoginPage } from "./pages/auth/LoginPage";
import { TenantSetupPage } from "./pages/setup/TenantSetupPage";
import { DashboardPage } from "./pages/DashboardPage";
import { CrudListPage } from "./components/crud/CrudListPage";
import { CrudCreatePage } from "./components/crud/CrudCreatePage";
import { ProviderGroupListPage } from "./pages/inventory/ProviderGroupListPage";
import { CrudDetailPage } from "./components/crud/CrudDetailPage";
import { CrudEditPage } from "./components/crud/CrudEditPage";
import { BranchManagementPage } from "./pages/branch-management/BranchManagementPage";
import { SalesHierarchyPage } from "./pages/branch-management/SalesHierarchyPage";
// import { OrgRegistrationPage } from "./pages/onboarding/OrgRegistrationPage";
// import { BranchRegistrationPage } from "./pages/onboarding/BranchRegistrationPage";
// import { ApprovalQueuePage } from "./pages/onboarding/ApprovalQueuePage";
// import { RegistrationDetailPage } from "./pages/onboarding/RegistrationDetailPage";
import { DashboardReportPage } from "./pages/reports/DashboardReportPage";
import { ReportPage } from "./pages/chain-store/reports/ReportPage";
import { REPORT_CATEGORY } from "./constants/reports/report-category.constant";
import { AgingReportPage } from "./pages/reports/AgingReportPage";
import { CashReportPage } from "./pages/reports/CashReportPage";
import { LedgerCashPage } from "./pages/treasury/ledger-cash/LedgerCashPage";
import { LedgerDepositPage } from "./pages/treasury/deposit/LedgerDepositPage";
import { TreasuryDepositReceiptsPage } from "./pages/treasury/deposit/receipts-expenses/TreasuryDepositReceiptsPage";
import { DepositReconPage } from "./pages/treasury/deposit-recon/DepositReconPage";
import { DepositPeriodLockPage } from "./pages/treasury/deposit-period-lock/DepositPeriodLockPage";
import { DepositTransferListPage } from "./pages/treasury/deposit-transfer/DepositTransferListPage";
import { CashTransferListPage } from "./pages/treasury/cash-transfer/CashTransferListPage";
import { DepositInTransitPage } from "./pages/treasury/deposit-in-transit/DepositInTransitPage";
import { DepositBalanceDashboardPage } from "./pages/treasury/deposit-dashboard/DepositBalanceDashboardPage";
import { TreasuryCashReceiptsPage } from "./pages/treasury/cash/receipts-expenses/TreasuryCashReceiptsPage";
import { TreasuryCashCountPage } from "./pages/treasury/cash/TreasuryCashCountPage";
import { TreasuryWipPage } from "./pages/treasury/TreasuryWipPage";
import { ProgramsPage } from "./pages/promotions/programs/ProgramsPage";
import { ProgramFormPage } from "./pages/promotions/programs/ProgramFormPage/ProgramFormPage";
import { VouchersPage } from "./pages/promotions/vouchers/VouchersPage";
import { InventoryManagementPage } from "./pages/inventory/InventoryManagementPage";
import { InventoryItemsPage } from "./pages/inventory/InventoryItemsPage";
import { ItemCategoriesPage } from "./pages/inventory/ItemCategoriesPage";
import { InventoryItemBarcodesPage } from "./pages/inventory-item-barcodes/InventoryItemBarcodesPage";
import { InventoryStoragesPage } from "./pages/inventory/InventoryStoragesPage";
import { ItemLocationDetailsPage } from "./pages/item-location-details/ItemLocationDetailsPage";
import { StockTakesPage } from "./pages/stock-takes/StockTakesPage";
import { TransferOrdersPage } from "./pages/transfer-orders/TransferOrdersPage";
import { TransferInPage } from "./pages/transfer-in/TransferInPage";
import { PurchaseOrdersPage } from "./pages/purchase-orders/PurchaseOrdersPage";
import { GoodsIssuePage } from "./pages/goods-issue/GoodsIssuePage";
import { StockTransferPage } from "./pages/stock-transfer/StockTransferPage";
import { ItemLocationsPage } from "./pages/item-locations/ItemLocationsPage";

import { HttpErrorPage, HttpErrorView } from "./pages/errors/HttpErrorPage";
import { DocumentNumberingPage } from "./pages/settings/DocumentNumberingPage";
import { AppearancePage } from "./pages/settings/appearance/AppearancePage";
import { ProductsPage } from "./pages/products/ProductsPage";
import { ProductDetailPage } from "./pages/products/ProductDetailPage";
import { EmployeesPage } from "./pages/employees/EmployeesPage";
import { RoleManagementPage } from "./pages/role-management/RoleManagementPage";
import { CustomerDetailPage } from "./pages/customers/CustomerDetailPage";
import { CustomersPage } from "./pages/customers/CustomersPage";
import { InventoryReportPage } from "./pages/reports/InventoryReportPage";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster
        position="bottom-right"
        richColors
        closeButton
        expand={false}
        visibleToasts={1} // only show one toast at a time
        gap={16}
        style={{ zIndex: 11000 }}
      />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<BackofficeLayout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/admin/employees" element={<EmployeesPage />} />
                <Route
                  path="/admin/provider-groups"
                  element={<ProviderGroupListPage />}
                />
                <Route
                  path="/admin/:entityKey/new"
                  element={<CrudCreatePage />}
                />
                <Route
                  path="/admin/:entityKey/:id/edit"
                  element={<CrudEditPage />}
                />
                <Route
                  path="/admin/customers/:id"
                  element={<CustomerDetailPage />}
                />
                <Route path="/admin/customers" element={<CustomersPage />} />
                <Route
                  path="/admin/:entityKey/:id"
                  element={<CrudDetailPage />}
                />
                <Route
                  path="/admin/inventory-items"
                  element={<InventoryItemsPage />}
                />
                <Route
                  path="/admin/inventory-item-categories"
                  element={<ItemCategoriesPage />}
                />
                <Route
                  path="/admin/inventory-item-barcodes"
                  element={<InventoryItemBarcodesPage />}
                />
                <Route
                  path="/admin/inventory-storages"
                  element={<InventoryStoragesPage />}
                />
                <Route
                  path="/admin/branches"
                  element={<BranchManagementPage />}
                />
                <Route path="/admin/:entityKey" element={<CrudListPage />} />
                <Route
                  path="/branch-management/sales-hierarchy"
                  element={<SalesHierarchyPage />}
                />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/products/:id" element={<ProductDetailPage />} />
                <Route
                  path="/inventory-management"
                  element={<InventoryManagementPage />}
                />
                <Route
                  path="/inventory/purchase-orders"
                  element={<PurchaseOrdersPage />}
                />
                <Route
                  path="/purchases/imports"
                  element={<PurchaseOrdersPage mode="purchase" />}
                />
                <Route
                  path="/inventory/transfer-in"
                  element={<TransferInPage />}
                />
                <Route
                  path="/inventory/goods-issues"
                  element={<GoodsIssuePage />}
                />
                <Route
                  path="/inventory/stock-transfers"
                  element={<StockTransferPage />}
                />
                <Route
                  path="/inventory/item-locations"
                  element={<ItemLocationsPage />}
                />
                <Route
                  path="/inventory/item-location-details"
                  element={<ItemLocationDetailsPage />}
                />
                <Route
                  path="/inventory/stock-takes"
                  element={<StockTakesPage />}
                />
                <Route
                  path="/inventory/transfer-orders"
                  element={<TransferOrdersPage />}
                />
                {/* Onboarding routes hidden
                <Route
                  path="/onboarding/org-registration"
                  element={<OrgRegistrationPage />}
                />
                <Route
                  path="/onboarding/branch-registration"
                  element={<BranchRegistrationPage />}
                />
                <Route
                  path="/onboarding/approvals"
                  element={<ApprovalQueuePage />}
                />
                <Route
                  path="/onboarding/approvals/:id"
                  element={<RegistrationDetailPage />}
                />
                */}
                <Route path="/reports" element={<DashboardReportPage />} />
                <Route
                  path="/reports/dashboard"
                  element={<DashboardReportPage />}
                />
                <Route
                  path="/reports/sales"
                  element={<ReportPage category={REPORT_CATEGORY.SALES} />}
                />
                <Route
                  path="/reports/inventory"
                  element={<ReportPage category={REPORT_CATEGORY.INVENTORY} />}
                />
                <Route
                  path="/reports/debts"
                  element={<ReportPage category={REPORT_CATEGORY.DEBTS} />}
                />
                <Route
                  path="/reports/profit"
                  element={<ReportPage category={REPORT_CATEGORY.PROFIT} />}
                />

                <Route path="/reports/aging" element={<AgingReportPage />} />
                <Route path="/reports/cash" element={<CashReportPage />} />
                <Route
                  path="/treasury/cash/receipts-expenses"
                  element={<TreasuryCashReceiptsPage />}
                />
                <Route
                  path="/treasury/cash/count"
                  element={<TreasuryCashCountPage />}
                />
                <Route
                  path="/treasury/cash/ledger"
                  element={<LedgerCashPage />}
                />
                <Route
                  path="/treasury/deposit/ledger"
                  element={<LedgerDepositPage />}
                />
                <Route
                  path="/treasury/deposit/receipts-expenses"
                  element={<TreasuryDepositReceiptsPage />}
                />
                <Route
                  path="/treasury/deposit-reconciliation"
                  element={<DepositReconPage />}
                />
                <Route
                  path="/treasury/deposit-period-lock"
                  element={<DepositPeriodLockPage />}
                />
                <Route
                  path="/treasury/deposit-transfers"
                  element={<DepositTransferListPage />}
                />
                <Route
                  path="/treasury/cash-transfers"
                  element={<CashTransferListPage />}
                />
                <Route
                  path="/treasury/deposit-in-transit"
                  element={<DepositInTransitPage />}
                />
                <Route
                  path="/treasury/deposit-dashboard"
                  element={<DepositBalanceDashboardPage />}
                />
                <Route
                  path="/treasury/wip/:slug"
                  element={<TreasuryWipPage />}
                />
                <Route
                  path="/ledger-cash"
                  element={<Navigate to="/treasury/cash/ledger" replace />}
                />
                <Route
                  path="/promotions/programs"
                  element={<ProgramsPage />}
                />
                <Route
                  path="/promotions/programs/new"
                  element={<ProgramFormPage />}
                />
                <Route
                  path="/promotions/programs/:id/edit"
                  element={<ProgramFormPage />}
                />
                <Route
                  path="/promotions/vouchers"
                  element={<VouchersPage />}
                />
                <Route
                  path="/settings/document-numbering"
                  element={<DocumentNumberingPage />}
                />
                <Route
                  path="/settings/appearance"
                  element={<AppearancePage />}
                />
                <Route
                  path="/role-management"
                  element={<RoleManagementPage />}
                />
                <Route path="/setup" element={<TenantSetupPage />} />
                <Route path="/error/:code" element={<HttpErrorPage />} />
                <Route path="*" element={<HttpErrorView code={404} />} />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
