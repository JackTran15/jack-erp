import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { clearPosSession } from "@erp/pos/lib/posAuth";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";

export function PosShellLayout() {
  const navigate = useNavigate();
  const branchName = usePosBranchStore((s) => s.branchName) ?? "—";
  const clearBranch = usePosBranchStore((s) => s.clearBranch);

  return (
    <div className="pos-shell">
      <a href="#pos-main-content" className="pos-skip-link">
        Bỏ qua menu, tới nội dung chính
      </a>
      <header className="pos-banner" role="banner">
        <div className="pos-banner__inner">
          <h1 className="pos-brand">Bán hàng POS</h1>
          <p
            className="pos-hint"
            style={{ margin: "0.25rem 0 0", fontSize: "0.95rem" }}
          >
            Chi nhánh: <strong>{branchName}</strong>
            <span style={{ marginLeft: "0.75rem" }}>
              <button
                type="button"
                className="pos-btn pos-btn--secondary"
                onClick={() => {
                  clearBranch();
                  navigate("/chon-chi-nhanh");
                }}
                style={{ fontSize: "0.9rem", padding: "0.25rem 0.6rem" }}
              >
                Đổi chi nhánh
              </button>
              <button
                type="button"
                className="pos-btn pos-btn--secondary"
                onClick={() => {
                  clearBranch();
                  clearPosSession();
                  navigate("/dang-nhap", { replace: true });
                }}
                style={{
                  fontSize: "0.9rem",
                  padding: "0.25rem 0.6rem",
                  marginLeft: "0.5rem",
                }}
              >
                Đăng xuất
              </button>
            </span>
          </p>
          <nav aria-label="Điều hướng chính">
            <ul className="pos-nav">
              <li>
                <NavLink to="/" end>
                  Thanh toán
                </NavLink>
              </li>
              <li>
                <NavLink to="/session">Ca bán hàng</NavLink>
              </li>
              <li>
                <NavLink to="/returns">Trả hàng</NavLink>
              </li>
              <li>
                <NavLink to="/exchange">Đổi hàng</NavLink>
              </li>
            </ul>
          </nav>
        </div>
      </header>
      <main
        id="pos-main-content"
        className="pos-main"
        tabIndex={-1}
        role="main"
      >
        <Outlet />
      </main>
    </div>
  );
}
