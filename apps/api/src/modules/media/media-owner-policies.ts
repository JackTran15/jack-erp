import { MediaOwnerType } from './media-object.entity';

export interface MediaOwnerPolicy {
  /** Decides public vs private access. Never infer "public" from an empty `readPermissions`. */
  readonly bucket: 'public' | 'private';
  readonly maxBytes: number;
  readonly contentTypes: readonly string[];
  readonly maxPerOwner: number;
  readonly writePermissions: readonly string[];
  readonly readPermissions: readonly string[];
}

const GOODS_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const PROFILE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
];

const MiB = 1024 * 1024;

// Policies are shared by reference across owner types (PRODUCT/ITEM, the seven
// vouchers), so freeze them: a caller mutating one array must not silently
// change the rules for every other owner type.
function policy(p: MediaOwnerPolicy): MediaOwnerPolicy {
  return Object.freeze({
    ...p,
    contentTypes: Object.freeze([...p.contentTypes]),
    writePermissions: Object.freeze([...p.writePermissions]),
    readPermissions: Object.freeze([...p.readPermissions]),
  });
}

function attachmentPolicy(
  writePermissions: string[],
  readPermissions: string[],
): MediaOwnerPolicy {
  return policy({
    bucket: 'private',
    maxBytes: 10 * MiB,
    contentTypes: ATTACHMENT_TYPES,
    maxPerOwner: 10,
    writePermissions,
    readPermissions,
  });
}

const GOODS_POLICY = policy({
  bucket: 'public',
  maxBytes: 2 * MiB,
  contentTypes: GOODS_IMAGE_TYPES,
  maxPerOwner: 10,
  writePermissions: ['inventory.write'],
  readPermissions: [],
});

/**
 * Static lookup by `ownerType`: bucket, limits, and the RBAC permission keys
 * checked when issuing upload tickets and download links (03-logical-design.md,
 * Domain model > Owner policies). Deliberately imports no business service:
 * owner modules register their readers with `MediaOwnerReaderRegistry` instead,
 * which avoids a media <-> inventory/accounting import cycle.
 */
export const MEDIA_OWNER_POLICIES: Readonly<Record<MediaOwnerType, MediaOwnerPolicy>> =
  Object.freeze({
    [MediaOwnerType.PRODUCT]: GOODS_POLICY,
    [MediaOwnerType.ITEM]: GOODS_POLICY,

    [MediaOwnerType.EMPLOYEE_PROFILE]: policy({
      bucket: 'private',
      maxBytes: 5 * MiB,
      contentTypes: PROFILE_IMAGE_TYPES,
      maxPerOwner: 1,
      writePermissions: ['iam.user.write'],
      readPermissions: ['iam.user.read'],
    }),

    [MediaOwnerType.GOODS_RECEIPT]: attachmentPolicy(
      ['goods_receipt.post', 'goods_receipt.write'],
      ['goods_receipt.read'],
    ),
    [MediaOwnerType.TRANSFER_ORDER]: attachmentPolicy(
      ['inventory.transfer.create'],
      ['inventory.transfer.read'],
    ),
    [MediaOwnerType.STOCK_TRANSFER]: attachmentPolicy(
      ['inventory.transfer.create'],
      ['inventory.transfer.read'],
    ),
    [MediaOwnerType.CASH_RECEIPT]: attachmentPolicy(
      ['accounting.cash_receipt.create', 'accounting.cash_receipt.update'],
      ['accounting.cash_receipt.read'],
    ),
    [MediaOwnerType.CASH_PAYMENT]: attachmentPolicy(
      ['accounting.cash_payment.create', 'accounting.cash_payment.update'],
      ['accounting.cash_payment.read'],
    ),
    [MediaOwnerType.BANK_RECEIPT]: attachmentPolicy(
      ['accounting.bank_receipt.create', 'accounting.bank_receipt.update'],
      ['accounting.bank_receipt.read'],
    ),
    [MediaOwnerType.BANK_PAYMENT]: attachmentPolicy(
      ['accounting.bank_payment.create', 'accounting.bank_payment.update'],
      ['accounting.bank_payment.read'],
    ),
  });
