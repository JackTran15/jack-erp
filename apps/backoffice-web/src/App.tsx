import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DashboardPage } from "./pages/DashboardPage";
import { CrudListPage } from "./components/crud/CrudListPage";
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

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route
          path="/admin/:entityKey"
          element={<CrudListPage />}
        />
        <Route
          path="/branch-management/sales-hierarchy"
          element={<SalesHierarchyPage />}
        />
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
        <Route path="/reports" element={<DashboardReportPage />} />
        <Route path="/reports/dashboard" element={<DashboardReportPage />} />
        <Route path="/reports/sales" element={<SalesReportPage />} />
        <Route path="/reports/inventory" element={<InventoryReportPage />} />
        <Route path="/reports/aging" element={<AgingReportPage />} />
        <Route path="/reports/cash" element={<CashReportPage />} />
      </Routes>
    </BrowserRouter>
  );
}
