import { useEffect, useId, useState, type FormEvent } from "react";
import {
  AppModal,
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  FormField,
  Input,
  Separator,
} from "@erp/ui";
import {
  createCustomer,
  formatCustomerDisplay,
  generateCustomerCode,
  searchCustomers,
  type CustomerRow,
} from "@erp/pos/lib/common/customerApi";

type Props = {
  open: boolean;
  onClose: () => void;
  onSelected: (customer: CustomerRow) => void;
};

function userFacingError(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message;
    if (m.startsWith("HTTP 403")) {
      return "Không có quyền truy cập danh sách khách (customer.read / customer.write). Đăng nhập lại hoặc cấp quyền.";
    }
    if (m.startsWith("HTTP 401")) {
      return "Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.";
    }
    return m.replace(/^HTTP \d+: /, "").slice(0, 400) || "Đã xảy ra lỗi.";
  }
  return "Đã xảy ra lỗi không xác định.";
}

export function PosCustomerSelectDialog({ open, onClose, onSelected }: Props) {
  const searchInputId = useId();
  const nameId = useId();
  const phoneId = useId();
  const emailId = useId();

  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<CustomerRow[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setSearchText("");
    setResults([]);
    setSearchLoading(false);
    setCreateLoading(false);
    setCreateOpen(false);
    setFormName("");
    setFormPhone("");
    setFormEmail("");
    setError("");
  }, [open]);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    const q = searchText.trim();
    if (q.length < 2) {
      setError("Nhập ít nhất 2 ký tự (tên, email hoặc số điện thoại) để tìm.");
      setResults([]);
      return;
    }
    setError("");
    setSearchLoading(true);
    try {
      const res = await searchCustomers(q);
      setResults(res.data);
      if (res.data.length === 0) {
        setError("Không tìm thấy khách phù hợp. Có thể tạo khách mới bên dưới.");
      }
    } catch (err) {
      setResults([]);
      setError(userFacingError(err));
    } finally {
      setSearchLoading(false);
    }
  };

  const pickCustomer = (c: CustomerRow) => {
    setError("");
    onSelected(c);
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    const name = formName.trim();
    if (!name) {
      setError("Tên khách hàng là bắt buộc.");
      return;
    }
    setError("");
    setCreateLoading(true);
    try {
      const phone = formPhone.trim() || undefined;
      const email = formEmail.trim() || undefined;
      const created = await createCustomer({
        code: generateCustomerCode(),
        name,
        phone,
        email,
      });
      onSelected(created);
    } catch (err) {
      setError(userFacingError(err));
    } finally {
      setCreateLoading(false);
    }
  };

  return (
    <AppModal
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title="Chọn hoặc tạo khách hàng"
      cancelLabel="Đóng"
      onCancel={onClose}
      className="max-w-xl"
    >
      <div className="space-y-4">
        {error ? (
          <div
            className="rounded-md border-2 border-destructive bg-destructive/10 px-3 py-2 text-sm"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSearch} className="space-y-2">
          <FormField
            label="Tìm theo tên, email hoặc số điện thoại"
            htmlFor={searchInputId}
            hint="Tối thiểu 2 ký tự. Kết quả lấy từ máy chủ (quyền customer.read)."
          >
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={searchInputId}
                type="search"
                autoComplete="off"
                placeholder="Ví dụ: Nguyễn hoặc 09"
                className="flex-1 min-w-[12rem]"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                aria-describedby={`${searchInputId}-hint`}
              />
              <Button type="submit" disabled={searchLoading}>
                {searchLoading ? "Đang tìm…" : "Tìm khách"}
              </Button>
            </div>
          </FormField>
        </form>

        <section aria-label="Kết quả tìm khách">
          <p className="text-xs text-muted-foreground">
            {searchLoading
              ? "Đang tải danh sách…"
              : results.length > 0
                ? `Tìm thấy ${results.length} khách (trang đầu).`
                : "Chưa có kết quả. Nhấn «Tìm khách» sau khi nhập."}
          </p>
          {results.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1 list-none p-0">
              {results.map((c) => {
                const label = formatCustomerDisplay(c);
                const extra = [c.phone, c.email].filter(Boolean).join(" · ");
                return (
                  <li key={c.id}>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full flex-col items-start text-left h-auto min-h-[2.75rem] py-2"
                      onClick={() => pickCustomer(c)}
                      aria-label={`Chọn khách ${label}${extra ? `, ${extra}` : ""}`}
                    >
                      <span className="font-semibold">{label}</span>
                      {extra ? (
                        <span className="text-xs font-normal text-muted-foreground">
                          {extra}
                        </span>
                      ) : null}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>

        <Separator />

        <Collapsible open={createOpen} onOpenChange={setCreateOpen}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline" className="w-full">
              {createOpen ? "Ẩn biểu mẫu tạo khách" : "Tạo khách mới"}
            </Button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <section className="mt-4 space-y-3" aria-label="Tạo khách hàng mới">
              <h3 className="text-base font-bold">Thông tin khách mới</h3>
              <form onSubmit={handleCreate} noValidate className="space-y-3">
                <FormField label="Tên khách hàng" htmlFor={nameId} required>
                  <Input
                    id={nameId}
                    type="text"
                    autoComplete="name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    required
                  />
                </FormField>
                <FormField label="Số điện thoại (tuỳ chọn)" htmlFor={phoneId}>
                  <Input
                    id={phoneId}
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                  />
                </FormField>
                <FormField label="Email (tuỳ chọn)" htmlFor={emailId}>
                  <Input
                    id={emailId}
                    type="email"
                    autoComplete="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                  />
                </FormField>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createLoading}
                >
                  {createLoading ? "Đang lưu…" : "Lưu và chọn khách này"}
                </Button>
              </form>
            </section>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </AppModal>
  );
}
