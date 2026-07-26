import { AdminPageShell } from "../../../components/layout/AdminPageShell";
import { THEMES } from "../../../store/common/theme/theme.constant";
import { useThemeStore } from "../../../store/common/theme/theme.store";
import { ThemePreviewCard } from "./ThemePreviewCard/ThemePreviewCard";

export function AppearancePage() {
  const themeId = useThemeStore((s) => s.themeId);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <AdminPageShell>
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Giao diện</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chọn bảng màu cho backoffice. Áp dụng ngay khi chọn và chỉ lưu trên
          trình duyệt này — không ảnh hưởng người dùng khác.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {THEMES.map((theme) => (
          <ThemePreviewCard
            key={theme.id}
            theme={theme}
            selected={theme.id === themeId}
            onSelect={() => setTheme(theme.id)}
          />
        ))}
      </div>
    </AdminPageShell>
  );
}
