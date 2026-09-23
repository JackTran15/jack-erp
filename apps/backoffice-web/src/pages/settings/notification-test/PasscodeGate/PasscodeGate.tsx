import { useState } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { Button, Input } from "@erp/ui";
import {
  NOTIFICATION_TEST_PASSCODE,
  NOTIFICATION_TEST_UNLOCK_TTL_MS,
} from "../../../../store/page-stores/notification-test/notification-test.constant";
import {
  isUnlockValid,
  useNotificationTestActions,
  useNotificationTestStore,
} from "../../../../store/page-stores/notification-test/notification-test.store";

/**
 * Chắn trang Test thông báo bằng một mã ngắn.
 *
 * **Không phải bảo mật** — mã nằm trong bundle, mở DevTools là thấy. Nó chắn
 * việc bấm nhầm vào một trang gửi thông báo THẬT tới điện thoại nhân viên.
 */
export function PasscodeGate({ children }: { children: React.ReactNode }) {
  const unlockedAt = useNotificationTestStore((s) => s.unlockedAt);
  const { unlock } = useNotificationTestActions();
  const [code, setCode] = useState("");

  if (isUnlockValid(unlockedAt)) return <>{children}</>;

  const submit = () => {
    if (code.trim() !== NOTIFICATION_TEST_PASSCODE) {
      toast.error("Mã không đúng.");
      setCode("");
      return;
    }
    unlock();
    setCode("");
  };

  const hours = Math.round(NOTIFICATION_TEST_UNLOCK_TTL_MS / 3_600_000);

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Test thông báo</h1>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Trang này gửi thông báo THẬT tới điện thoại đang đăng nhập. Nhập mã để mở khoá
          — mở một lần dùng được {hours} giờ trên trình duyệt này.
        </p>
        <Input
          type="password"
          value={code}
          autoFocus
          placeholder="Mã mở khoá"
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        <Button className="mt-4 w-full" onClick={submit} disabled={!code}>
          Mở khoá
        </Button>
      </div>
    </div>
  );
}
