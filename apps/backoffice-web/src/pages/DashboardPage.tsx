import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@erp/ui";

export function DashboardPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6">
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
    </div>
  );
}
