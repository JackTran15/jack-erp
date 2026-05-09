import { useState } from "react";
import { Link } from "react-router-dom";
import { HttpError } from "../../lib/http";
import { erpApi, requireErpData } from "../../lib/erp-api";
import { getStoredOrganizationId } from "../../lib/auth-storage";
import { Button, Input, FormField, Card, CardContent, CardHeader, CardTitle } from "@erp/ui";
import { AdminPageShell } from "../../components/layout/AdminPageShell";

export function TenantSetupPage() {
  const orgId = getStoredOrganizationId();
  const [branchName, setBranchName] = useState("");
  const [parentBranchId, setParentBranchId] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const createBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    const name = branchName.trim();
    if (!name) {
      setError("Vui lòng nhập tên chi nhánh.");
      return;
    }
    setLoading(true);
    try {
      const body: { name: string; parentBranchId?: string } = { name };
      const parent = parentBranchId.trim();
      if (parent) {
        body.parentBranchId = parent;
      }
      const created = requireErpData(
        await erpApi.POST<{ id: string; name: string }>("/branches", {
          body,
        }),
      );
      setMessage(`Đã tạo chi nhánh "${created.name}" (id: ${created.id}).`);
      setBranchName("");
      setParentBranchId("");
    } catch (err: unknown) {
      if (err instanceof HttpError) {
        setError(err.error.message);
      } else {
        setError(err instanceof Error ? err.message : "Yêu cầu thất bại");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AdminPageShell>
      <h1 className="mb-2 text-2xl font-bold text-foreground">Thiết lập tenant</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Tổ chức đang đăng nhập: <strong>{orgId ?? "—"}</strong>
      </p>

      <Card className="mb-7">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Khởi tạo dữ liệu (nên dùng khi dev)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Chạy <code className="rounded bg-muted px-1.5 py-0.5 text-xs">make seed-inventory</code> một
            lần với cơ sở dữ liệu của bạn. Lệnh tạo tổ chức, tài khoản admin, chi nhánh chính, kho, vị
            trí, mặt hàng mẫu và tồn kho. Sau đó đăng nhập tại{" "}
            <Link to="/login" className="font-medium text-primary hover:underline">
              trang đăng nhập
            </Link>{" "}
            bằng thông tin đã seed.
          </p>
        </CardContent>
      </Card>

      <Card className="mb-7">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Thêm chi nhánh</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm leading-relaxed text-muted-foreground">
            Tạo chi nhánh trong tổ chức hiện tại. Chi nhánh đầu tiên trong tổ chức trống sẽ tự động trở
            thành chi nhánh chính.
          </p>
          <form className="flex max-w-[400px] flex-col gap-3" onSubmit={(e) => void createBranch(e)}>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {message && <p className="text-sm text-green-700">{message}</p>}
            <FormField label="Tên chi nhánh">
              <Input
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="Ví dụ: Kho Miền Đông"
              />
            </FormField>
            <FormField label="ID chi nhánh cha (tuỳ chọn)">
              <Input
                value={parentBranchId}
                onChange={(e) => setParentBranchId(e.target.value)}
                placeholder="UUID chi nhánh cha"
                spellCheck={false}
              />
            </FormField>
            <Button type="submit" className="self-start" disabled={loading}>
              {loading ? "Đang tạo…" : "Tạo chi nhánh"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Kho, mặt hàng và tồn</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-sm leading-relaxed text-muted-foreground">
            Dùng màn hình kho để thêm, sửa, xoá kho lưu trữ, mặt hàng và số dư tồn (API admin chung).
          </p>
          <Link
            to="/inventory-management"
            className="inline-block text-sm font-semibold text-primary no-underline hover:underline"
          >
            Mở quản lý kho →
          </Link>
        </CardContent>
      </Card>
    </AdminPageShell>
  );
}
