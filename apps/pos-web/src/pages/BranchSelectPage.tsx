import { useCallback, useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getBranchById, type BranchRow } from "@erp/pos/lib/common/branchApi";
import { parseAccessTokenPayload } from "@erp/pos/lib/common/parseJwt";
import { usePosBranchStore } from "../stores/common/branch.store";

type BranchOption = { id: string; name: string };

export function BranchSelectPage() {
  const formId = useId();
  const navigate = useNavigate();
  const storeBranchId = usePosBranchStore((s) => s.branchId);
  const setBranch = usePosBranchStore((s) => s.setBranch);
  const clearBranch = usePosBranchStore((s) => s.clearBranch);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoadError(null);
    setLoading(true);
    const token = localStorage.getItem("access_token");
    if (!token) {
      setLoadError("Chưa có phiên đăng nhập. Mở ứng dụng quản trị hoặc đăng nhập, sau đó thử lại.");
      setLoading(false);
      return;
    }
    const payload = parseAccessTokenPayload(token);
    if (!payload || payload.branchIds.length === 0) {
      setLoadError("Tài khoản chưa được gán chi nhánh. Liên hệ quản trị viên.");
      setLoading(false);
      return;
    }
    try {
      const rows = await Promise.all(
        payload.branchIds.map((id) => getBranchById(id).catch((): null => null)),
      );
      const options: BranchOption[] = [];
      for (let i = 0; i < payload.branchIds.length; i++) {
        const id = payload.branchIds[i]!;
        const r = rows[i] as BranchRow | null;
        options.push({ id, name: r?.name?.trim() ? r.name : `Chi nhánh ${id.slice(0, 8)}…` });
      }
      setBranches(options);
      const current = storeBranchId;
      if (current && options.some((b) => b.id === current)) {
        setSelected(current);
      } else if (options.length === 1) {
        setSelected(options[0]!.id);
      } else {
        setSelected(null);
      }
    } catch (e) {
      setLoadError(
        e instanceof Error
          ? `Không tải được danh sách chi nhánh: ${e.message}`
          : "Không tải được danh sách chi nhánh.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) {
      setLoadError("Hãy chọn một chi nhánh.");
      return;
    }
    const opt = branches.find((b) => b.id === selected);
    if (!opt) {
      setLoadError("Chi nhánh không hợp lệ.");
      return;
    }
    setBranch(opt.id, opt.name);
    navigate("/", { replace: true });
  };

  return (
    <div className="pos-shell" style={{ minHeight: "100vh" }}>
      <header className="pos-banner" role="banner">
        <div className="pos-banner__inner">
          <h1 className="pos-brand">Chọn chi nhánh</h1>
        </div>
      </header>
      <main
        className="pos-main"
        style={{ maxWidth: "36rem", margin: "0 auto" }}
        id="pos-main-content"
        tabIndex={-1}
        role="main"
      >
        <h2 className="pos-page-title">Bán tại chi nhánh nào?</h2>
        <p className="pos-hint">
          Tồn kho và thao tác bán hàng gắn với đúng chi nhánh. Bạn cần chọn
          trước khi vào màn hình bán hàng.
        </p>

        {loadError ? (
          <div className="pos-panel" role="alert">
            {loadError}
          </div>
        ) : null}

        {loading ? (
          <p className="pos-hint" aria-live="polite">
            Đang tải danh sách chi nhánh…
          </p>
        ) : (
          <form className="pos-panel" onSubmit={submit} id={formId}>
            {branches.length > 0 ? (
              <fieldset className="pos-fieldset" style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className="pos-visually-hidden">Chi nhánh</legend>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
                >
                  {branches.map((b) => (
                    <label
                      key={b.id}
                      style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
                    >
                      <input
                        type="radio"
                        name="pos-branch"
                        value={b.id}
                        checked={selected === b.id}
                        onChange={() => {
                          setSelected(b.id);
                          setLoadError(null);
                        }}
                      />
                      <span>{b.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : !loadError ? (
              <p className="pos-hint">Không có chi nhánh nào.</p>
            ) : null}
            {branches.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  marginTop: "1rem",
                }}
              >
                <button type="submit" className="pos-btn pos-btn--primary">
                  Tiếp tục
                </button>
                <button
                  type="button"
                  className="pos-btn pos-btn--secondary"
                  onClick={() => {
                    clearBranch();
                    setLoadError(null);
                  }}
                >
                  Bỏ chọn đã lưu
                </button>
                <button
                  type="button"
                  className="pos-btn pos-btn--secondary"
                  onClick={() => void load()}
                >
                  Tải lại
                </button>
              </div>
            ) : null}
          </form>
        )}
      </main>
    </div>
  );
}
