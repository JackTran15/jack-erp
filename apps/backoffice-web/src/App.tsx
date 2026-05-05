import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { RequireAuth } from "./components/auth/RequireAuth";
import { BackofficeLayout } from "./components/layout/BackofficeLayout";
import { LoginPage } from "./pages/auth/LoginPage";
import { TenantSetupPage } from "./pages/setup/TenantSetupPage";
import { DashboardPage } from "./pages/DashboardPage";
import { CrudListPage } from "./components/crud/CrudListPage";
import { CrudCreatePage } from "./components/crud/CrudCreatePage";
import { CrudDetailPage } from "./components/crud/CrudDetailPage";
import { CrudEditPage } from "./components/crud/CrudEditPage";
import { SalesHierarchyPage } from "./pages/branch-management/SalesHierarchyPage";
import { OrgRegistrationPage } from "./pages/onboarding/OrgRegistrationPage";
import { BranchRegistrationPage } from "./pages/onboarding/BranchRegistrationPage";
import { ApprovalQueuePage } from "./pages/onboarding/ApprovalQueuePage";
import { RegistrationDetailPage } from "./pages/onboarding/RegistrationDetailPage";
import { DashboardReportPage } from "./pages/reports/DashboardReportPage";
import { SalesReportPage } from "./pages/reports/SalesReportPage";
import { InventoryReportPage } from "./pages/reports/InventoryReportPage";
import { AgingReportPage } from "./pages/reports/AgingReportPage";
import { CashReportPage } from "./pages/reports/CashReportPage";
import { InventoryManagementPage } from "./pages/inventory/InventoryManagementPage";
import { PurchaseOrdersPage } from "./pages/purchase-orders/PurchaseOrdersPage";
import { GoodsIssuePage } from "./pages/goods-issue/GoodsIssuePage";
import { DocumentNumberingPage } from "./pages/settings/DocumentNumberingPage";

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
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<RequireAuth />}>
              <Route element={<BackofficeLayout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/admin/:entityKey/new" element={<CrudCreatePage />} />
                <Route path="/admin/:entityKey/:id/edit" element={<CrudEditPage />} />
                <Route path="/admin/:entityKey/:id" element={<CrudDetailPage />} />
                <Route path="/admin/:entityKey" element={<CrudListPage />} />
                <Route
                  path="/branch-management/sales-hierarchy"
                  element={<SalesHierarchyPage />}
                />
                <Route
                  path="/inventory-management"
                  element={<InventoryManagementPage />}
                />
                <Route
                  path="/inventory/purchase-orders"
                  element={<PurchaseOrdersPage />}
                />
                <Route
                  path="/inventory/goods-issues"
                  element={<GoodsIssuePage />}
                />
                <Route
                  path="/onboarding/org-registration"
                  element={<OrgRegistrationPage />}
                />
                <Route
                  path="/onboarding/branch-registration"
                  element={<BranchRegistrationPage />}
                />
                <Route path="/onboarding/approvals" element={<ApprovalQueuePage />} />
                <Route
                  path="/onboarding/approvals/:id"
                  element={<RegistrationDetailPage />}
                />
                <Route path="/reports" element={<DashboardReportPage />} />
                <Route path="/reports/dashboard" element={<DashboardReportPage />} />
                <Route path="/reports/sales" element={<SalesReportPage />} />
                <Route path="/reports/inventory" element={<InventoryReportPage />} />
                <Route path="/reports/aging" element={<AgingReportPage />} />
                <Route path="/reports/cash" element={<CashReportPage />} />
                <Route
                  path="/settings/document-numbering"
                  element={<DocumentNumberingPage />}
                />
                <Route path="/setup" element={<TenantSetupPage />} />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
