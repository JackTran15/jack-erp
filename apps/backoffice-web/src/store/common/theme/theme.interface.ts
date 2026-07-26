export type ThemeId = "misa" | "dark" | "classic";

export interface ThemeOption {
  id: ThemeId;
  label: string;
  description: string;
}

export interface ThemeState {
  themeId: ThemeId;
  setTheme: (id: ThemeId) => void;
}
