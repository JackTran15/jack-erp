import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@erp/ui";
import { AdminPageShell } from "../components/layout/AdminPageShell";

export function DashboardPage() {
  return (
    <AdminPageShell>
      <Card>
        <CardHeader>
          <CardTitle>Bảng điều khiển</CardTitle>
          <CardDescription>Chào mừng đến ERP Backoffice.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Dùng menu phía trên cho kho hàng, báo cáo và quy trình onboarding. Để khởi tạo chi nhánh và
            dữ liệu kho, mở{" "}
            <Link to="/setup" className="font-medium text-primary hover:underline">
              Thiết lập tenant
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </AdminPageShell>
  );
}
