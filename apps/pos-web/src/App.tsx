import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { queryClient } from "@erp/pos/lib/common/query-client";
import { PosBranchHandoff } from "./components/common/PosBranchHandoff/PosBranchHandoff";
import { PosSessionHandoff } from "./components/common/PosSessionHandoff/PosSessionHandoff";
import { PosRequireAuth } from "./components/common/PosRequireAuth/PosRequireAuth";
import { PosRequireBranch } from "./components/common/PosRequireBranch/PosRequireBranch";
import { PosLayout } from "./components/layout/PosLayout/PosLayout";
import { BranchSelectPage } from "./pages/BranchSelectPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { DailyReportPage } from "./pages/DailyReportPage";
import { FastStockTransferPage } from "./pages/FastStockTransferPage";
import { InvoiceListPage } from "./pages/InvoiceListPage";
import { PosLoginPage } from "./pages/PosLoginPage";
import { PrintSettingsPage } from "./pages/PrintSettingsPage";
import { ReturnGoodsPage } from "./pages/ReturnGoodsPage";
import { UiCatalogPage } from "./pages/UiCatalogPage";

//
// Fix query
// Fix số tiền ko reset đúng

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Toaster
        position="top-right"
        richColors
        closeButton
        expand={false}
        visibleToasts={1}
        gap={16}
        style={{ zIndex: 11000 }}
      />
      <HotkeysProvider
        defaultOptions={{
          hotkey: { preventDefault: true, ignoreInputs: false },
        }}
      >
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <PosSessionHandoff>
            <PosBranchHandoff />
            <Routes>
              <Route path="/dang-nhap" element={<PosLoginPage />} />
              <Route path="/ui" element={<UiCatalogPage />} />
              <Route element={<PosRequireAuth />}>
                <Route path="/chon-chi-nhanh" element={<BranchSelectPage />} />
                {/* Trang công cụ đứng riêng (mở ở tab mới): không bọc PosLayout
                    vì topbar POS thừa, không bọc PosRequireBranch vì thông số in
                    là cấu hình theo máy, preview dùng dữ liệu mẫu. */}
                <Route path="/cai-dat-in" element={<PrintSettingsPage />} />
                <Route element={<PosRequireBranch />}>
                  <Route element={<PosLayout />}>
                    <Route path="/" element={<CheckoutPage />} />
                    <Route
                      path="/fast-stock-transfer"
                      element={<FastStockTransferPage />}
                    />
                    <Route path="/return-goods" element={<ReturnGoodsPage />} />
                    <Route path="/invoices" element={<InvoiceListPage />} />
                    <Route path="/daily-report" element={<DailyReportPage />} />
                  </Route>
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </PosSessionHandoff>
        </BrowserRouter>
      </HotkeysProvider>
    </QueryClientProvider>
  );
}
