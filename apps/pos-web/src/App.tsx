import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { RequirePosAuth } from "./components/RequirePosAuth";
import { PosShellLayout } from "./components/PosShellLayout";
import { RequirePosBranch } from "./components/RequirePosBranch";
import { BranchSelectPage } from "./pages/BranchSelectPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { CheckoutPageV2 } from "./features/checkout/pages/CheckoutPageV2";
import { FastStockTransferPage } from "./features/fast-stock-transfer/pages/FastStockTransferPage";
import { ReturnGoodsPage } from "./features/return-goods/pages/ReturnGoodsPage";
import { SessionPage } from "./pages/SessionPage";
import { ReturnsPage } from "./pages/ReturnsPage";
import { ExchangePage } from "./pages/ExchangePage";
import { PosLoginPage } from "./pages/PosLoginPage";
import { AppPosLayout } from "./components/layout/AppPosLayout/AppPosLayout";

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
            <Route element={<RequirePosAuth />}>
              <Route path="/chon-chi-nhanh" element={<BranchSelectPage />} />
              <Route element={<RequirePosBranch />}>
                <Route element={<AppPosLayout />}>
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
