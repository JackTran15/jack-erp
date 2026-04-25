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

export function ExchangePage() {
  const saleRefId = useId();
  const replacementId = useId();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
  };

  return (
    <>
      <h2 className="text-2xl font-bold mb-4">Đổi hàng</h2>

      <Card className="mb-4" aria-labelledby="exchange-intro">
        <CardHeader>
          <CardTitle id="exchange-intro" className="text-lg">
            Hướng dẫn
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Tham chiếu hóa đơn gốc, khai báo hàng trả và hàng thay thế. Chênh lệch
            giá sẽ quyết định thu thêm hoặc hoàn tiền theo chính sách chi nhánh.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={onSubmit} aria-label="Biểu mẫu đổi hàng">
            <fieldset className="mb-4 rounded-lg border-2 border-border p-4">
              <legend className="font-bold px-1">Thông tin đổi hàng</legend>

              <FormField
                label="Mã bán hàng gốc"
                htmlFor={saleRefId}
                className="mb-4"
              >
                <Input
                  id={saleRefId}
                  type="text"
                  autoComplete="off"
                  placeholder="Ví dụ: HD-20260425-00001"
                  className="max-w-md"
                />
              </FormField>

              <FormField
                label="Mã hàng thay thế (SKU)"
                htmlFor={replacementId}
                hint="Sau khi nhập đủ thông tin, nhân viên xác nhận tồn kho và chênh lệch giá trước khi ghi nhận."
              >
                <Input
                  id={replacementId}
                  type="text"
                  autoComplete="off"
                  placeholder="Quét hoặc nhập SKU"
                  className="max-w-md"
                  aria-describedby={`${replacementId}-hint`}
                />
              </FormField>
            </fieldset>

            <Button type="button" variant="outline" disabled>
              Kiểm tra điều kiện (demo)
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
