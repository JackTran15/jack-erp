import { Gender } from "../customer.entity";
import { MembershipTier } from "../membership-card.entity";

/**
 * Single source for the gender/tier ↔ Vietnamese label mapping shared by the
 * customer Excel import (parse) and export (format). The parse maps are
 * derived from the export labels, so exported files always round-trip.
 */

export const GENDER_EXPORT_LABELS: Record<Gender, string> = {
  [Gender.MALE]: "Nam",
  [Gender.FEMALE]: "Nữ",
  [Gender.UNSPECIFIED]: "Không xác định",
};

export const TIER_EXPORT_LABELS: Record<MembershipTier, string> = {
  [MembershipTier.NONE]: "Thường",
  [MembershipTier.SILVER]: "Bạc",
  [MembershipTier.GOLD]: "Vàng",
  [MembershipTier.DIAMOND]: "Kim cương",
};

export function normalizeVietnameseText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .trim()
    .toLowerCase();
}

function buildNormalizedMap<T extends string>(
  exportLabels: Record<T, string>,
  aliases: Record<string, T>,
): Record<string, T> {
  const map: Record<string, T> = { ...aliases };
  for (const [value, label] of Object.entries(exportLabels) as [T, string][]) {
    map[normalizeVietnameseText(label)] = value;
  }
  return map;
}

export const GENDER_BY_NORMALIZED: Record<string, Gender> =
  buildNormalizedMap(GENDER_EXPORT_LABELS, {});

export const TIER_BY_NORMALIZED: Record<string, MembershipTier> =
  buildNormalizedMap(TIER_EXPORT_LABELS, {
    silver: MembershipTier.SILVER,
    gold: MembershipTier.GOLD,
    diamond: MembershipTier.DIAMOND,
    none: MembershipTier.NONE,
  });
