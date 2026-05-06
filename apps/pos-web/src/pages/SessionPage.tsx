import { useId, useState, type FormEvent } from "react";
import {
  Button,
  Card,
  CardContent,
  FormField,
  Input,
  MoneyInput,
} from "@erp/ui";
import { formatCurrencyVnd } from "../lib/formatCurrency";

export function SessionPage() {
  const openingCashId = useId();
  const noteId = useId();
  const [openingCash, setOpeningCash] = useState<number | "">("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const handleOpenSession = (e: FormEvent) => {
    e.preventDefault();
    const amount = openingCash === "" ? NaN : openingCash;
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Nhập số tiền quỹ mở ca hợp lệ (không âm).");
      setStatus("");
      return;
    }
    setError("");
    setStatus(
      `Đã ghi nhận mở ca với quỹ tiền mặt ${formatCurrencyVnd(amount)}. Đây là bản demo giao diện; chưa gọi API.`,
    );
  };

  return (
    <>
      <h2 className="text-2xl font-bold mb-4">Ca bán hàng</h2>

      <p className="text-sm text-muted-foreground mb-4">
        Màn hình mở ca: nhãn gắn với ô nhập, thông báo lỗi ở vùng cảnh báo, kết
        quả ở vùng trạng thái (phù hợp WCAG 2.1).
      </p>

      {error ? (
        <Card className="mb-4 border-destructive" role="alert">
          <CardContent className="py-3 text-sm">{error}</CardContent>
        </Card>
      ) : null}

      {status ? (
        <Card className="mb-4" role="status" aria-live="polite">
          <CardContent className="py-3 text-sm">{status}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleOpenSession} noValidate>
            <fieldset className="mb-4 rounded-lg border-2 border-border p-4">
              <legend className="font-bold px-1">Mở ca</legend>

              <FormField
                label="Quỹ tiền mặt đầu ca (VND)"
                htmlFor={openingCashId}
                hint="Nhập số tiền có trong ngăn kéo khi bắt đầu ca."
                className="mb-4"
              >
                <MoneyInput
                  id={openingCashId}
                  autoComplete="off"
                  placeholder="Ví dụ: 500.000"
                  className="max-w-md"
                  value={openingCash}
                  onChange={(v) => {
                    setOpeningCash(v);
                    setError("");
                  }}
                  aria-describedby={`${openingCashId}-hint`}
                />
              </FormField>

              <FormField
                label="Ghi chú (tuỳ chọn)"
                htmlFor={noteId}
              >
                <Input
                  id={noteId}
                  type="text"
                  autoComplete="off"
                  className="max-w-md"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </FormField>
            </fieldset>

            <Button type="submit">Mở ca bán hàng</Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
