import { useId, type FormEvent } from "react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Input,
} from "@erp/ui";

export function ReturnsPage() {
  const saleRefId = useId();
  const reasonId = useId();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
  };

  return (
    <>
      <h2 className="text-2xl font-bold mb-4">Trả hàng</h2>

      <Card className="mb-4" aria-labelledby="returns-intro">
        <CardHeader>
          <CardTitle id="returns-intro" className="text-lg">
            Hướng dẫn
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Tra cứu giao dịch gốc, chọn dòng cần trả và phương thức hoàn tiền.
            Trên môi trường thật, các bước sẽ gọi API theo quy trình POS đã mô tả
            trong tài liệu nghiệp vụ.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={onSubmit} aria-label="Biểu mẫu trả hàng">
            <fieldset className="mb-4 rounded-lg border-2 border-border p-4">
              <legend className="font-bold px-1">Thông tin trả hàng</legend>

              <FormField
                label="Số chứng từ / mã bán hàng"
                htmlFor={saleRefId}
                hint="Nhập mã tham chiếu tới hóa đơn gốc để hệ thống kiểm tra điều kiện trả."
                className="mb-4"
              >
                <Input
                  id={saleRefId}
                  type="text"
                  autoComplete="off"
                  placeholder="Ví dụ: HD-20260425-00001"
                  className="max-w-md"
                  aria-describedby={`${saleRefId}-hint`}
                />
              </FormField>

              <FormField label="Lý do trả" htmlFor={reasonId}>
                <select
                  id={reasonId}
                  className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  defaultValue=""
                >
                  <option value="" disabled>
                    — Chọn lý do —
                  </option>
                  <option value="DEFECT">Hàng lỗi / không đạt</option>
                  <option value="CUSTOMER">Khách đổi ý</option>
                  <option value="OTHER">Khác</option>
                </select>
              </FormField>
            </fieldset>

            <Button type="button" variant="outline" disabled>
              Tra cứu (demo)
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
