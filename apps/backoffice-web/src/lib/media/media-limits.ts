export type MediaOwnerType =
  | "PRODUCT"
  | "ITEM"
  | "EMPLOYEE_PROFILE"
  | "GOODS_RECEIPT"
  | "TRANSFER_ORDER"
  | "STOCK_TRANSFER"
  | "CASH_RECEIPT"
  | "CASH_PAYMENT"
  | "BANK_RECEIPT"
  | "BANK_PAYMENT";

export interface MediaOwnerLimits {
  readonly maxBytes: number;
  readonly contentTypes: readonly string[];
  readonly maxCount: number;
}

const MiB = 1024 * 1024;

const GOODS_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const PROFILE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/csv",
];

const ATTACHMENT_LIMITS: MediaOwnerLimits = {
  maxBytes: 10 * MiB,
  contentTypes: ATTACHMENT_TYPES,
  maxCount: 10,
};

/**
 * Client-side copy of the server's per-ownerType limits
 * (apps/api/src/modules/media/media-owner-policies.ts, A-09). Only for early
 * feedback before any request goes out; the server re-checks everything and
 * stays the source of truth.
 */
export const MEDIA_OWNER_LIMITS: Readonly<Record<MediaOwnerType, MediaOwnerLimits>> = {
  PRODUCT: { maxBytes: 2 * MiB, contentTypes: GOODS_IMAGE_TYPES, maxCount: 10 },
  ITEM: { maxBytes: 2 * MiB, contentTypes: GOODS_IMAGE_TYPES, maxCount: 10 },
  EMPLOYEE_PROFILE: { maxBytes: 5 * MiB, contentTypes: PROFILE_IMAGE_TYPES, maxCount: 1 },
  GOODS_RECEIPT: ATTACHMENT_LIMITS,
  TRANSFER_ORDER: ATTACHMENT_LIMITS,
  STOCK_TRANSFER: ATTACHMENT_LIMITS,
  CASH_RECEIPT: ATTACHMENT_LIMITS,
  CASH_PAYMENT: ATTACHMENT_LIMITS,
  BANK_RECEIPT: ATTACHMENT_LIMITS,
  BANK_PAYMENT: ATTACHMENT_LIMITS,
};

export function validateFileAgainstLimits(ownerType: MediaOwnerType, file: File): string | null {
  const limits = MEDIA_OWNER_LIMITS[ownerType];
  if (file.size === 0) {
    return "Tệp rỗng, không thể tải lên.";
  }
  if (!limits.contentTypes.includes(file.type)) {
    return "Loại tệp không được hỗ trợ.";
  }
  if (file.size > limits.maxBytes) {
    return `Tệp vượt quá dung lượng tối đa ${Math.floor(limits.maxBytes / MiB)}MB.`;
  }
  return null;
}
