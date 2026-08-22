import {
  permissionActionWeight,
  permissionResourceLabelVi,
  permissionShortLabelVi,
  resolvePermissionResource,
} from "@erp/shared-interfaces";
import type { PermissionModuleView } from "./role-management.types";

/** One checkbox in a permission card. */
export type PermissionItem = {
  key: string;
  /** Short action label ("Xem", "Ghi sổ"). */
  label: string;
  /** Full Vietnamese label, shown as tooltip. */
  fullLabel: string;
};

/** A resource card: one nghiệp vụ object with its actions. */
export type PermissionCard = {
  id: string;
  label: string;
  items: PermissionItem[];
};

/** A page in the left nav (level 2). */
export type PermissionPage = {
  id: string;
  label: string;
  cards: PermissionCard[];
  keys: string[];
};

/** A section in the left nav (level 1). */
export type PermissionSection = {
  id: string;
  label: string;
  pages: PermissionPage[];
  keys: string[];
};

/** Left-nav sections: which modules belong to which top-level group. */
const SECTIONS: { id: string; label: string; modules: string[] }[] = [
  { id: "sales", label: "Bán hàng", modules: ["pos", "promotion", "customer"] },
  {
    id: "warehouse",
    label: "Kho hàng & hàng hóa",
    modules: ["inventory", "product"],
  },
  { id: "accounting", label: "Kế toán", modules: ["accounting"] },
  { id: "reporting", label: "Báo cáo", modules: ["reporting"] },
  {
    id: "system",
    label: "Hệ thống",
    modules: [
      "iam",
      "branch",
      "assignment",
      "sales-hierarchy",
      "registration",
      "document-numbering",
      "crud",
      "admin",
      "events",
    ],
  },
];

/**
 * Splits a large module into several left-nav pages.
 * Resources not listed here fall into a trailing "Khác" page of the module.
 */
const MODULE_PAGES: Record<
  string,
  { id: string; label: string; resources: string[] }[]
> = {
  inventory: [
    {
      id: "inventory-overview",
      label: "Tổng quan kho",
      resources: ["inventory"],
    },
    {
      id: "inventory-catalog",
      label: "Danh mục kho",
      resources: [
        "inventory.item",
        "inventory.location",
        "inventory.storage",
        "inventory.showroom",
        "inventory.temp-warehouse",
      ],
    },
    {
      id: "inventory-receipt",
      label: "Nhập kho",
      resources: ["goods_receipt", "inventory.purchase-order"],
    },
    {
      id: "inventory-issue",
      label: "Xuất kho",
      resources: ["inventory.goods-issue"],
    },
    {
      id: "inventory-transfer",
      label: "Điều chuyển & điều chỉnh",
      resources: ["inventory.transfer", "inventory.adjustment"],
    },
  ],
  accounting: [
    {
      id: "accounting-cash",
      label: "Tiền mặt",
      resources: [
        "accounting.cash",
        "accounting.cash_receipt",
        "accounting.cash_payment",
        "accounting.cash_count",
        "accounting.cash_transfer",
        "accounting.cash_ledger",
        "accounting.cash_voucher_category",
        "accounting.cash_voucher_partner",
      ],
    },
    {
      id: "accounting-deposit",
      label: "Tiền gửi & ngân hàng",
      resources: [
        "accounting.bank",
        "accounting.payment_account",
        "accounting.deposit_account",
        "accounting.bank_receipt",
        "accounting.bank_payment",
        "accounting.deposit_transfer",
        "accounting.fund_swap",
        "accounting.deposit_recon",
        "accounting.deposit_period",
        "accounting.deposit_ledger",
        "accounting.deposit_payment_policy",
        "accounting.deposit_dashboard",
        "accounting.deposit_movement",
        "accounting.deposit_audit",
      ],
    },
    {
      id: "accounting-debt",
      label: "Công nợ",
      resources: ["accounting.receivables", "accounting.payables"],
    },
    {
      id: "accounting-expense",
      label: "Chi phí & sổ cái",
      resources: ["accounting.expenses", "accounting.journal"],
    },
  ],
};

const OTHER_SECTION_ID = "other";
const OTHER_PAGE_SUFFIX = "-other";

function buildCards(permissions: PermissionModuleView["permissions"]) {
  const cards = new Map<string, PermissionCard>();
  const weights = new Map<string, number>();
  for (const perm of permissions) {
    const { resourceId, action } = resolvePermissionResource(perm.key);
    const card = cards.get(resourceId) ?? {
      id: resourceId,
      label: permissionResourceLabelVi(resourceId),
      items: [],
    };
    card.items.push({
      key: perm.key,
      label: permissionShortLabelVi(perm.key, action, perm.label),
      fullLabel: perm.label,
    });
    weights.set(perm.key, permissionActionWeight(action));
    cards.set(resourceId, card);
  }
  for (const card of cards.values()) {
    card.items.sort((a, b) => weights.get(a.key)! - weights.get(b.key)!);
  }
  return cards;
}

function buildModulePages(mod: PermissionModuleView): PermissionPage[] {
  const cards = buildCards(mod.permissions);
  const layout = MODULE_PAGES[mod.module];

  if (!layout) {
    const allCards = [...cards.values()];
    return [
      {
        id: mod.module,
        label: mod.label,
        cards: allCards,
        keys: allCards.flatMap((c) => c.items.map((i) => i.key)),
      },
    ];
  }

  const used = new Set<string>();
  const pages: PermissionPage[] = [];
  for (const page of layout) {
    const pageCards = page.resources
      .map((resourceId) => {
        used.add(resourceId);
        return cards.get(resourceId);
      })
      .filter((card): card is PermissionCard => Boolean(card));
    if (pageCards.length === 0) continue;
    pages.push({
      id: page.id,
      label: page.label,
      cards: pageCards,
      keys: pageCards.flatMap((c) => c.items.map((i) => i.key)),
    });
  }

  // Resources added after this layout was written still get a home.
  const leftover = [...cards.entries()]
    .filter(([resourceId]) => !used.has(resourceId))
    .map(([, card]) => card);
  if (leftover.length > 0) {
    pages.push({
      id: `${mod.module}${OTHER_PAGE_SUFFIX}`,
      label: "Khác",
      cards: leftover,
      keys: leftover.flatMap((c) => c.items.map((i) => i.key)),
    });
  }
  return pages;
}

/** Groups the flat permission catalogue into the two-level nav used by the role editor. */
export function buildPermissionSections(
  modules: PermissionModuleView[],
): PermissionSection[] {
  const byModule = new Map(modules.map((mod) => [mod.module, mod]));
  const claimed = new Set<string>();
  const sections: PermissionSection[] = [];

  for (const section of SECTIONS) {
    const pages = section.modules.flatMap((moduleKey) => {
      const mod = byModule.get(moduleKey);
      if (!mod) return [];
      claimed.add(moduleKey);
      return buildModulePages(mod);
    });
    if (pages.length === 0) continue;
    sections.push({
      id: section.id,
      label: section.label,
      pages,
      keys: pages.flatMap((p) => p.keys),
    });
  }

  // Modules added after SECTIONS was written still get a home.
  const leftover = modules.filter((mod) => !claimed.has(mod.module));
  if (leftover.length > 0) {
    const pages = leftover.flatMap(buildModulePages);
    sections.push({
      id: OTHER_SECTION_ID,
      label: "Khác",
      pages,
      keys: pages.flatMap((p) => p.keys),
    });
  }

  return sections;
}
