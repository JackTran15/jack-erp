import { useState, type FormEvent } from "react";
import { Button } from "@erp/ui";
import { hasPermission } from "../../lib/permissions";
import { AdminPageShell } from "../../components/layout/AdminPageShell";
import {
  StatusBadge as AppStatusBadge,
  type StatusBadgeVariant,
} from "../../components/status/StatusBadge";
import {
  useRegistration,
  RegistrationStatus,
  type SubmitBranchRegistrationData,
  type RegistrationRequestRecord,
} from "../../hooks/useRegistration";

const PERMISSION = "branch.registration.submit";

const STATUS_LABELS: Record<RegistrationStatus, string> = {
  [RegistrationStatus.PENDING_APPROVAL]: "Chờ phê duyệt",
  [RegistrationStatus.APPROVED]: "Đã duyệt",
  [RegistrationStatus.REJECTED]: "Đã từ chối",
  [RegistrationStatus.RESUBMITTED]: "Đã gửi lại",
};

function getStatusVariant(status: RegistrationStatus): StatusBadgeVariant {
  if (status === RegistrationStatus.APPROVED) {
    return "success";
  }
  if (status === RegistrationStatus.REJECTED) {
    return "danger";
  }
  if (status === RegistrationStatus.RESUBMITTED) {
    return "info";
  }
  return "warning";
}

function StatusBadge({ status }: { status: RegistrationStatus }) {
  return (
    <AppStatusBadge variant={getStatusVariant(status)}>
      {STATUS_LABELS[status]}
    </AppStatusBadge>
  );
}

export function BranchRegistrationPage() {
  const { submitBranchRegistration } = useRegistration();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegistrationRequestRecord | null>(null);

  const [form, setForm] = useState<SubmitBranchRegistrationData>({
    branchName: "",
    address: "",
    phone: "",
    email: "",
    parentBranchId: "",
  });

  if (!hasPermission(PERMISSION)) {
    return (
      <AdminPageShell>
        <div className="p-6">
          <div className="max-w-xl rounded-lg border border-border bg-card p-5 shadow-sm">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Đăng ký chi nhánh
            </h1>
            <p className="mt-2 text-sm font-medium text-destructive">
              Bạn không có quyền gửi đăng ký chi nhánh.
            </p>
          </div>
        </div>
      </AdminPageShell>
    );
  }

  const handleChange = (
    field: keyof SubmitBranchRegistrationData,
    value: string,
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const data: Record<string, unknown> = { branchName: form.branchName };
      if (form.address) data.address = form.address;
      if (form.phone) data.phone = form.phone;
      if (form.email) data.email = form.email;
      if (form.parentBranchId) data.parentBranchId = form.parentBranchId;
      const res = await submitBranchRegistration(
        data as unknown as SubmitBranchRegistrationData,
      );
      setResult(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gửi thất bại");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <AdminPageShell>
        <div className="flex flex-col p-4">
          <div className="mb-3">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Đăng ký chi nhánh
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Gửi yêu cầu tạo hoặc bổ sung chi nhánh mới.
            </p>
          </div>

          <div className="border border-border bg-card p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-foreground">
                Đã gửi yêu cầu
              </h2>
              <StatusBadge status={result.status} />
            </div>
            <dl className="grid gap-4 text-sm md:grid-cols-[minmax(0,2fr)_minmax(160px,1fr)]">
              <div className="grid gap-1">
                <dt className="font-medium text-muted-foreground">Mã</dt>
                <dd className="break-all text-foreground">{result.id}</dd>
              </div>
              <div className="grid gap-1">
                <dt className="font-medium text-muted-foreground">Gửi lúc</dt>
                <dd className="text-foreground">
                  {new Date(result.createdAt).toLocaleString("vi-VN")}
                </dd>
              </div>
            </dl>
            <Button
              type="button"
              className="mt-4"
              onClick={() => {
                setResult(null);
                setForm({
                  branchName: "",
                  address: "",
                  phone: "",
                  email: "",
                  parentBranchId: "",
                });
              }}
            >
              Gửi thêm yêu cầu
            </Button>
          </div>
        </div>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell>
      <div className="flex flex-col p-4">
        <div className="mb-3">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Đăng ký chi nhánh
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nhập thông tin chi nhánh để gửi yêu cầu phê duyệt.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid max-w-5xl gap-4 border border-border bg-card p-4 md:grid-cols-2"
        >
          <label className="grid gap-1 text-sm font-medium text-foreground">
            Tên chi nhánh *
            <input
              className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              type="text"
              required
              minLength={2}
              maxLength={200}
              value={form.branchName}
              onChange={(e) => handleChange("branchName", e.target.value)}
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-foreground">
            Địa chỉ
            <input
              className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              type="text"
              maxLength={500}
              value={form.address}
              onChange={(e) => handleChange("address", e.target.value)}
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-foreground">
            Điện thoại
            <input
              className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              type="tel"
              maxLength={30}
              value={form.phone}
              onChange={(e) => handleChange("phone", e.target.value)}
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-foreground">
            Email liên hệ
            <input
              className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              type="email"
              value={form.email}
              onChange={(e) => handleChange("email", e.target.value)}
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-foreground">
            ID chi nhánh cha
            <input
              className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              type="text"
              placeholder="UUID chi nhánh cha (tuỳ chọn)"
              value={form.parentBranchId}
              onChange={(e) => handleChange("parentBranchId", e.target.value)}
            />
          </label>

          {error && (
            <p className="m-0 text-sm font-medium text-destructive md:col-span-2">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={submitting}
            className="justify-self-start md:col-span-2"
          >
            {submitting ? "Đang gửi…" : "Gửi đăng ký"}
          </Button>
        </form>
      </div>
    </AdminPageShell>
  );
}
