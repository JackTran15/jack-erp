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
  type SubmitOrgRegistrationData,
  type RegistrationRequestRecord,
} from "../../hooks/useRegistration";

const PERMISSION = "org.registration.submit";

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

export function OrgRegistrationPage() {
  const { submitOrgRegistration } = useRegistration();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegistrationRequestRecord | null>(null);

  const [form, setForm] = useState<SubmitOrgRegistrationData>({
    organizationName: "",
    contactEmail: "",
    contactPhone: "",
    ownerName: "",
    ownerEmail: "",
  });

  if (!hasPermission(PERMISSION)) {
    return (
      <AdminPageShell>
        <div className="p-6">
          <div className="max-w-xl rounded-lg border border-border bg-card p-5 shadow-sm">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Đăng ký tổ chức
            </h1>
            <p className="mt-2 text-sm font-medium text-destructive">
              Bạn không có quyền gửi đăng ký tổ chức.
            </p>
          </div>
        </div>
      </AdminPageShell>
    );
  }

  const handleChange = (
    field: keyof SubmitOrgRegistrationData,
    value: string,
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const data = { ...form };
      if (!data.contactPhone) delete data.contactPhone;
      const res = await submitOrgRegistration(data);
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
              Đăng ký tổ chức
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Gửi yêu cầu tạo tổ chức mới trong hệ thống.
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
                  organizationName: "",
                  contactEmail: "",
                  contactPhone: "",
                  ownerName: "",
                  ownerEmail: "",
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
            Đăng ký tổ chức
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nhập thông tin liên hệ và chủ sở hữu để gửi yêu cầu phê duyệt.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid max-w-5xl gap-4 border border-border bg-card p-4 md:grid-cols-2"
        >
          <label className="grid gap-1 text-sm font-medium text-foreground">
            Tên tổ chức *
            <input
              className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              type="text"
              required
              minLength={2}
              maxLength={200}
              value={form.organizationName}
              onChange={(e) => handleChange("organizationName", e.target.value)}
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-foreground">
            Email liên hệ *
            <input
              className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              type="email"
              required
              value={form.contactEmail}
              onChange={(e) => handleChange("contactEmail", e.target.value)}
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-foreground">
            Điện thoại liên hệ
            <input
              className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              type="tel"
              maxLength={30}
              value={form.contactPhone}
              onChange={(e) => handleChange("contactPhone", e.target.value)}
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-foreground">
            Tên chủ sở hữu *
            <input
              className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              type="text"
              required
              minLength={2}
              value={form.ownerName}
              onChange={(e) => handleChange("ownerName", e.target.value)}
            />
          </label>

          <label className="grid gap-1 text-sm font-medium text-foreground">
            Email chủ sở hữu *
            <input
              className="h-9 rounded-md border border-input bg-background px-3 text-sm font-normal outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/20"
              type="email"
              required
              value={form.ownerEmail}
              onChange={(e) => handleChange("ownerEmail", e.target.value)}
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
