import { BrowserRouter, Route, Routes } from "react-router-dom";
import { CheckoutPage } from "./pages/CheckoutPage";
import { SessionPage } from "./pages/SessionPage";
import { ReturnsPage } from "./pages/ReturnsPage";
import { ExchangePage } from "./pages/ExchangePage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CheckoutPage />} />
        <Route path="/session" element={<SessionPage />} />
        <Route path="/returns" element={<ReturnsPage />} />
        <Route path="/exchange" element={<ExchangePage />} />
      </Routes>
    </BrowserRouter>
  );
}
