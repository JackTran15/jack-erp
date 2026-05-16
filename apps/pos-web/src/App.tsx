import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { PosRequireAuth } from "./components/common/PosRequireAuth/PosRequireAuth";
import { PosShellLayout } from "./components/layout/PosShellLayout/PosShellLayout";
import { PosRequireBranch } from "./components/common/PosRequireBranch/PosRequireBranch";
import { BranchSelectPage } from "./pages/BranchSelectPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { CheckoutPageV2 } from "./pages/CheckoutPageV2";
import { FastStockTransferPage } from "./pages/FastStockTransferPage";
import { ReturnGoodsPage } from "./pages/ReturnGoodsPage";
import { SessionPage } from "./pages/SessionPage";
import { ReturnsPage } from "./pages/ReturnsPage";
import { ExchangePage } from "./pages/ExchangePage";
import { PosLoginPage } from "./pages/PosLoginPage";
import { PosLayout } from "./components/layout/PosLayout/PosLayout";

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
      <HotkeysProvider
        defaultOptions={{
          hotkey: { preventDefault: true, ignoreInputs: false },
        }}
      >
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Routes>
            <Route path="/dang-nhap" element={<PosLoginPage />} />
            <Route element={<PosRequireAuth />}>
              <Route path="/chon-chi-nhanh" element={<BranchSelectPage />} />
              <Route element={<PosRequireBranch />}>
                <Route element={<PosLayout />}>
                  <Route path="/" element={<CheckoutPageV2 />} />
                  <Route path="/fast-stock-transfer" element={<FastStockTransferPage />} />
                  <Route path="/return-goods" element={<ReturnGoodsPage />} />
                </Route>

                <Route element={<PosShellLayout />}>
                  <Route path="/session" element={<SessionPage />} />
                  <Route path="/returns" element={<ReturnsPage />} />
                  <Route path="/exchange" element={<ExchangePage />} />
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
