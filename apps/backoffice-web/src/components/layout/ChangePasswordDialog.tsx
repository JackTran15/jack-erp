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
import { toast } from "sonner";
import { erpApi, requireErpSuccess } from "../../lib/erp-api";

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Mirrors the server DTO (@MinLength(8)), so the user is told before the round trip. */
const MIN_LENGTH = 8;

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
          <div className="space-y-1.5">
            <Label htmlFor="current-password">Mật khẩu hiện tại</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Mật khẩu mới</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Tối thiểu {MIN_LENGTH} ký tự.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Xác nhận mật khẩu mới</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSubmit();
              }}
            />
          </div>
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
