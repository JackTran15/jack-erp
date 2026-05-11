import {
  BarChartUpIcon,
  BookOpenIcon,
  BrandMarkIcon,
  CartIcon,
  CoinDollarIcon,
  ExchangeClipboardIcon,
  FileTextIcon,
  GearIcon,
  GlobeIcon,
  InfoCircleIcon,
  MultiDisplayIcon,
  NotebookEditIcon,
  PackageSendIcon,
  PrinterIcon,
  QuestionBubbleIcon,
  TruckIcon,
  WarehouseOutIcon,
  type IconProps,
} from "@erp/pos/components/icons/Icon";
import { APP_MENU_ITEMS } from "@erp/pos/constants/pos-menu.constant";
import type { ComponentType } from "react";

export interface AppMenuItem {
  id: string;
  label: string;
  /** Squircle background fill. */
  iconBgColor: string;
  Icon: ComponentType<IconProps>;
  /** Present ⇒ click navigates here; otherwise click is a close-only no-op. */
  route?: string;
  badge?: "new";
  /** When true, the popover renders a pin icon at the top-right of the tile. */
  pinnable?: boolean;
}

/**
 * Static config for the POS application menu (17 modules).
 * Order matches the row/column layout in `task/MainMenuPOS_description.md §4.6`.
 */


const CHECKOUT_PATHS = new Set(["/"]);

export function resolveSelectedAppMenuItemId(pathname: string): string {
  const match = APP_MENU_ITEMS.find(
    (item) => item.route && item.route !== "/" && pathname.startsWith(item.route),
  );
  if (match) return match.id;
  if (CHECKOUT_PATHS.has(pathname)) return "ban-hang";
  return "";
}
