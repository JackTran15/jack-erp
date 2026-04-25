import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { HttpError } from "../../lib/http";
import { useAuth } from "../../hooks/useAuth";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Input,
  Button,
  FormField,
} from "@erp/ui";

const DEFAULT_DEV_ORG_ID = "10000000-0000-4000-8000-000000000001";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, login } = useAuth();

  const rawFrom =
    typeof location.state === "object" &&
    location.state !== null &&
    "from" in location.state &&
    typeof (location.state as { from: unknown }).from === "string"
      ? (location.state as { from: string }).from
      : "/";
  const from = rawFrom === "/login" ? "/" : rawFrom;

  const [email, setEmail] = useState(
    import.meta.env.VITE_DEV_LOGIN_EMAIL ?? "inventory.admin@erp.local",
  );
  const [password, setPassword] = useState(
    import.meta.env.VITE_DEV_LOGIN_PASSWORD ?? "password123",
  );
  const [organizationId, setOrganizationId] = useState(
    import.meta.env.VITE_DEV_ORG_ID ?? DEFAULT_DEV_ORG_ID,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, from, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password, organizationId.trim());
      navigate(from, { replace: true });
    } catch (err: unknown) {
      if (err instanceof HttpError) {
        setError(err.error.message);
      } else {
        setError(err instanceof Error ? err.message : "Đăng nhập thất bại");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted">
      <Card className="w-full max-w-[420px]">
        <CardHeader>
          <CardTitle>ERP Backoffice</CardTitle>
          <CardDescription>
            Đăng nhập bằng tài khoản tổ chức của bạn.
          </CardDescription>
        </CardHeader>

        <CardContent>
          {import.meta.env.DEV && (
            <p className="mb-4 p-3 text-[13px] text-foreground bg-muted rounded-lg border leading-relaxed">
              Môi trường dev: chạy{" "}
              <code className="text-xs bg-background px-1 rounded">make seed-inventory</code>{" "}
              (hoặc{" "}
              <code className="text-xs bg-background px-1 rounded">pnpm seed:dev-admin</code>
              ), sau đó dùng giá trị mặc định bên dưới trừ khi bạn đã đổi trong{" "}
              <code className="text-xs bg-background px-1 rounded">.env</code>.
            </p>
          )}

          <form className="flex flex-col gap-3.5" onSubmit={(e) => void handleSubmit(e)}>
            {error && <p className="text-sm text-destructive">{error}</p>}

            <FormField label="ID tổ chức" htmlFor="login-org-id">
              <Input
                id="login-org-id"
                value={organizationId}
                onChange={(e) => setOrganizationId(e.target.value)}
                autoComplete="organization"
                spellCheck={false}
              />
            </FormField>

            <FormField label="Email đăng nhập" htmlFor="login-email">
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </FormField>

            <FormField label="Mật khẩu" htmlFor="login-password">
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </FormField>

            <Button type="submit" className="mt-1 w-full" disabled={loading}>
              {loading ? "Đang đăng nhập…" : "Đăng nhập"}
            </Button>
          </form>

          <p className="mt-5 text-[13px] text-muted-foreground leading-relaxed">
            Sau khi đăng nhập, mở{" "}
            <Link to="/setup" className="text-primary font-medium hover:underline">
              Thiết lập tenant
            </Link>{" "}
            để thêm chi nhánh, rồi vào{" "}
            <Link to="/inventory-management" className="text-primary font-medium hover:underline">
              Kho hàng
            </Link>{" "}
            để quản lý kho, mặt hàng và tồn.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
