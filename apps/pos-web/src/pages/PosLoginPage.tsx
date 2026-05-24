import { useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { authService } from "@erp/pos/services/auth.service";

const DEFAULT_DEV_ORG_ID = "10000000-0000-4000-8000-000000000001";

export function PosLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const from = useMemo(() => {
    if (
      typeof location.state === "object" &&
      location.state !== null &&
      "from" in location.state
    ) {
      const fromValue = (location.state as { from?: unknown }).from;
      if (typeof fromValue === "string" && fromValue !== "/dang-nhap") {
        return fromValue;
      }
    }
    return "/";
  }, [location.state]);

  const [organizationId, setOrganizationId] = useState(
    authService.getStoredOrganizationId() ??
      import.meta.env.VITE_DEV_ORG_ID ??
      DEFAULT_DEV_ORG_ID,
  );
  const [email, setEmail] = useState(
    import.meta.env.VITE_DEV_LOGIN_EMAIL ?? "inventory.admin@erp.local",
  );
  const [password, setPassword] = useState(
    import.meta.env.VITE_DEV_LOGIN_PASSWORD ?? "password123",
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (authService.isAuthenticated()) {
    return <Navigate to={from} replace />;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await authService.login({
        organizationId: organizationId.trim(),
        email: email.trim(),
        password,
      });
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Đăng nhập thất bại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="pos-shell" style={{ minHeight: "100vh" }}>
      <header className="pos-banner" role="banner">
        <div className="pos-banner__inner">
          <h1 className="pos-brand">POS - Đăng nhập</h1>
        </div>
      </header>
      <main
        className="pos-main"
        style={{ maxWidth: "36rem", margin: "0 auto" }}
        id="pos-main-content"
        tabIndex={-1}
        role="main"
      >
        <h2 className="pos-page-title">Đăng nhập vào quầy bán hàng</h2>
        <p className="pos-hint">
          Dùng tài khoản đã được phân quyền chi nhánh để bắt đầu phiên bán hàng.
        </p>

        <form className="pos-panel" onSubmit={(e) => void submit(e)}>
          {error ? (
            <div className="pos-dialog__alert" role="alert">
              {error}
            </div>
          ) : null}
          <div className="pos-field">
            <label htmlFor="pos-login-org-id">ID tổ chức</label>
            <input
              id="pos-login-org-id"
              className="pos-input"
              value={organizationId}
              onChange={(e) => setOrganizationId(e.target.value)}
              autoComplete="organization"
              spellCheck={false}
              required
            />
          </div>
          <div className="pos-field">
            <label htmlFor="pos-login-email">Email đăng nhập</label>
            <input
              id="pos-login-email"
              className="pos-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="pos-field">
            <label htmlFor="pos-login-password">Mật khẩu</label>
            <input
              id="pos-login-password"
              className="pos-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          <button className="pos-btn pos-btn--primary" type="submit" disabled={loading}>
            {loading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>
      </main>
    </div>
  );
}
