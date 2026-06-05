import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import {
  Avatar,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@erp/ui";
import { useAuth } from "../../hooks/useAuth";
import { useCurrentUser } from "../../hooks/iam/useCurrentUser";

export function UserMenu() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { data: user } = useCurrentUser();

  const displayName = user
    ? `${user.firstName} ${user.lastName}`.trim()
    : "Unknown";
  const subtitle = user?.roles.map((r) => r.name).join(", ") ?? "";

  const handleLogout = () => {
    void logout().then(() => navigate("/login", { replace: true }));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-full outline-none ring-2 ring-transparent transition-all hover:ring-white/30 focus-visible:ring-white/50"
          aria-label="Tài khoản người dùng"
        >
          <Avatar name={displayName} size="sm" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="font-normal">
          <p className="text-xs font-semibold text-foreground">{displayName}</p>
          {subtitle && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {subtitle}
            </p>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleLogout}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
