import type { ThemeId, ThemeOption } from "./theme.interface";

/** Khoá localStorage — trùng với khoá đọc trong inline script ở index.html. */
export const THEME_STORAGE_KEY = "bo-theme";

/** Thuộc tính gắn trên <html>; khớp selector [data-theme="..."] trong index.css. */
export const THEME_ATTRIBUTE = "theme";

export const DEFAULT_THEME_ID: ThemeId = "misa";

/**
 * Danh mục theme. Thêm theme mới = thêm khối [data-theme="id"] trong index.css
 * + một entry ở đây. Không khai mã màu tại đây: thẻ preview render bằng chính
 * token của theme nên không bao giờ lệch với CSS.
 */
export const THEMES: ThemeOption[] = [
  {
    id: "misa",
    label: "MISA",
    description:
      "Bám bảng màu MISA eShop: navy #223065 cho sidebar và toolbar, nền bảng trắng, link SKU xanh #516AD3.",
  },
  {
    id: "dark",
    label: "MISA tối",
    description:
      "Bản tối cùng họ navy: nền than xanh, chữ off-white, link sáng. Hợp phòng thiếu sáng hoặc làm đêm.",
  },
  {
    id: "classic",
    label: "Cổ điển",
    description:
      "Nền trắng, chữ gần đen, chrome đen xám. Độ nét cao nhất, cũng chói nhất.",
  },
];

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}
