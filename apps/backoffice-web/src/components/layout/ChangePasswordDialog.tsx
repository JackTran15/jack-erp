import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from "@erp/ui";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { erpApi, requireErpSuccess } from "../../lib/erp-api";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Mirrors the server DTO (@MinLength(8)), so the user is told before the round trip. */
const MIN_LENGTH = 8;

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  hint?: string;
  onEnter?: () => void;
}

/** Text input with its own show/hide toggle — each field reveals independently. */
function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
  onEnter,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          className="pr-10"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEnter?.();
          }}
        />
        <button
          type="button"
          // Not focusable: tabbing through the form should go field to field,
          // and the toggle is reachable by click for anyone who wants it.
          tabIndex={-1}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none"
        >
          <Icon className="h-4 w-4" />
        </button>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Self-service password change, reachable from the account menu by every role.
 * Staff hold no `iam.*` permission, so the admin employee screen is not an
 * option for them — this is their only way to rotate their own password.
 */
export function ChangePasswordDialog({ open, onClose }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const validate = (): string | null => {
    if (!currentPassword) return "Nhập mật khẩu hiện tại.";
    if (newPassword.length < MIN_LENGTH)
      return `Mật khẩu mới phải có ít nhất ${MIN_LENGTH} ký tự.`;
    if (newPassword !== confirmPassword)
      return "Xác nhận mật khẩu không khớp.";
    if (newPassword === currentPassword)
      return "Mật khẩu mới phải khác mật khẩu hiện tại.";
    return null;
  };

  const handleSubmit = async () => {
    const error = validate();
    if (error) {
      toast.error(error);
      return;
    }
    setSubmitting(true);
    try {
      requireErpSuccess(
        await erpApi.POST("/auth/change-password", {
          body: { currentPassword, newPassword },
        }),
      );
      toast.success("Đã đổi mật khẩu.");
      reset();
      onClose();
    } catch {
      // 401 is the server refusing the current password — the only failure the
      // user can act on, and the server will not say which half was wrong.
      toast.error("Không đổi được mật khẩu. Kiểm tra lại mật khẩu hiện tại.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Đổi mật khẩu</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <PasswordField
            id="current-password"
            label="Mật khẩu hiện tại"
            autoComplete="current-password"
            value={currentPassword}
            onChange={setCurrentPassword}
          />
          <PasswordField
            id="new-password"
            label="Mật khẩu mới"
            autoComplete="new-password"
            value={newPassword}
            onChange={setNewPassword}
            hint={`Tối thiểu ${MIN_LENGTH} ký tự.`}
          />
          <PasswordField
            id="confirm-password"
            label="Xác nhận mật khẩu mới"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            onEnter={() => void handleSubmit()}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Huỷ
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={submitting}>
            {submitting ? "Đang lưu..." : "Đổi mật khẩu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
