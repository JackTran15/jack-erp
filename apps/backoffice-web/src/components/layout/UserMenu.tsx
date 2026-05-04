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

function getDisplayName(): string {
  const orgId = localStorage.getItem("organization_id");
  if (orgId) return orgId;
  return "Admin";
}

export function UserMenu() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const displayName = getDisplayName();

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
          <p className="text-xs font-semibold text-foreground">Tài khoản</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{displayName}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
          <LogOut className="h-4 w-4" />
          Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
