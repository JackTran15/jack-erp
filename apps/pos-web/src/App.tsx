import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { PosRequireAuth } from "./components/common/PosRequireAuth/PosRequireAuth";
import { PosRequireBranch } from "./components/common/PosRequireBranch/PosRequireBranch";
import { PosLayout } from "./components/layout/PosLayout/PosLayout";
import { BranchSelectPage } from "./pages/BranchSelectPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { FastStockTransferPage } from "./pages/FastStockTransferPage";
import { InvoiceListPage } from "./pages/InvoiceListPage";
import { PosLoginPage } from "./pages/PosLoginPage";
import { ReturnGoodsPage } from "./pages/ReturnGoodsPage";
import { UiCatalogPage } from "./pages/UiCatalogPage";

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
          <Routes>
            <Route path="/dang-nhap" element={<PosLoginPage />} />
            <Route path="/ui" element={<UiCatalogPage />} />
            <Route element={<PosRequireAuth />}>
              <Route path="/chon-chi-nhanh" element={<BranchSelectPage />} />
              <Route element={<PosRequireBranch />}>
                <Route element={<PosLayout />}>
                  <Route path="/" element={<CheckoutPage />} />
                  <Route
                    path="/fast-stock-transfer"
                    element={<FastStockTransferPage />}
                  />
                  <Route path="/return-goods" element={<ReturnGoodsPage />} />
                  <Route path="/invoices" element={<InvoiceListPage />} />
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </HotkeysProvider>
    </QueryClientProvider>
  );
}
