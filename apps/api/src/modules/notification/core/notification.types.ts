/**
 * Core contracts of the notification module.
 *
 * Rule of the module: NOTHING under `core/` knows which notification types
 * exist. Adding a type = a new file in `definitions/` + templates in
 * `templates/` + one line in `definitions/index.ts`. If adding a type ever
 * requires editing `core/`, the abstraction is wrong — stop and fix it.
 */

/** Mobile apps that can receive notifications. */
export type NotificationApp = 'erp_manager' | 'erp_sales';
export const NOTIFICATION_APPS: readonly NotificationApp[] = ['erp_manager', 'erp_sales'];

/**
 * Channels a definition can opt into. `in_app` (the inbox row) is implicit and
 * always on — every notification lands in `notifications`.
 */
export type NotificationChannelKey = 'fcm_push' | 'websocket';

export type NotificationLocale = 'vi' | 'en';
export const NOTIFICATION_LOCALES: readonly NotificationLocale[] = ['vi', 'en'];
export const DEFAULT_NOTIFICATION_LOCALE: NotificationLocale = 'vi';

/**
 * Semantic deep-link target. The backend NEVER sends route paths: each app maps
 * a target to its own router, so erp_sales can open the same target elsewhere.
 */
export interface NotificationTarget {
  type:
    | 'sales_order'
    | 'invoice'
    | 'stock_document'
    | 'store'
    | 'overview'
    | 'inventory_store'
    | 'product'
    | 'notifications';
  id?: string;
  /** stock_document only: goods-receipt | purchase-return | stock-in | stock-out. */
  slug?: string;
  branchId?: string;
}

/** Template variables + display data. Values stay RAW (numbers unformatted). */
export type NotificationData = Record<string, string | number | null>;

/** One "firing" of a definition — a domain event or one unit of a scheduled run. */
export interface NotificationContext<P = unknown> {
  /** uuid; idempotency key. Scheduled runs use a deterministic uuidv5. */
  eventId: string;
  organizationId: string;
  /** Branch the event happened in; undefined = organization-level. */
  branchId?: string;
  actorId?: string;
  occurredAt: Date;
  payload: P;
  /**
   * Recipients decided by the definition itself (e.g. one chain-wide revenue
   * summary per user, computed over that user's own branches). When set, the
   * resolver is skipped; the preference filter still applies.
   */
  recipientUserIds?: string[];
  /**
   * Which "Thiết lập thông báo" scopes this firing is meant for:
   * - `any` (default): chain-scoped users get every branch, branch-scoped users their branch;
   * - `branchOnly`: only users scoped to exactly `branchId`;
   * - `chainOnly`: only users scoped to the whole chain (incl. never-saved settings).
   */
  scope?: NotificationScope;
}

export type NotificationScope = 'any' | 'branchOnly' | 'chainOnly';

export interface BuiltNotification {
  data: NotificationData;
  target?: NotificationTarget;
}

export interface EventTrigger {
  kind: 'event';
  topic: string;
}

/**
 * Once a day at `at` (`HH:mm`), in BUSINESS time (Asia/Ho_Chi_Minh — see
 * `common/utils/business-timezone.util.ts`). Daily wall-clock times are all the
 * catalogue needs; a cron expression would need the `cron` package, which
 * `apps/api` does not declare.
 */
export interface ScheduleTrigger {
  kind: 'schedule';
  at: string;
}

interface BaseNotificationDefinition<P> {
  /** Wire code (`invoice`, `invoice_return`…). Permanent once shipped. */
  readonly type: string;
  /** Recipient must hold ANY of these (the read permission of the document). */
  readonly permissions: readonly string[];
  /**
   * Skip the user who caused the event.
   *
   * **Every definition currently sets this to `false`** — decided 23/09/2026,
   * reversing the original default. The person who posts a document now also
   * gets the notification about it.
   *
   * The old rule ("a cashier does not need a push telling them what they just
   * did") holds only where the poster and the recipients are different people.
   * In a one-person organisation — or whenever a manager rings up a sale from
   * the account their phone is signed in with — it deleted the notification
   * entirely and left no trace to read: the row lands in `notifications` for
   * somebody else, deliveries are zero, nothing errors. That cost a full
   * debugging session; see the diagnosis in
   * `local/services/notifications/introduce/` of the mobile repo.
   *
   * The mechanism stays wired (dispatcher passes `excludeUserId` to the
   * resolver) because a future type may genuinely need it — e.g. "someone
   * EDITED your invoice". Seeing `false` everywhere is the decision, not an
   * oversight; `event-definitions.spec.ts` locks it.
   */
  readonly excludeActor: boolean;
  readonly targetApps: readonly NotificationApp[];
  readonly channels: readonly NotificationChannelKey[];
  readonly priority: 'high' | 'normal';
  /** Used when the user has never saved notification settings. */
  readonly defaultEnabled: boolean;

  /** Optional gate evaluated before resolving recipients. */
  shouldSend?(ctx: NotificationContext<P>): boolean | Promise<boolean>;

  /** Builds the shared payload once for every recipient. `null` = skip. */
  build(ctx: NotificationContext<P>): Promise<BuiltNotification | null>;
}

export interface EventNotificationDefinition<P = unknown> extends BaseNotificationDefinition<P> {
  readonly trigger: EventTrigger;
  /** Who caused the event. Default: `payload.actorId`. */
  actorIdOf?(payload: P): string | undefined;
}

export interface ScheduledNotificationDefinition<P = unknown> extends BaseNotificationDefinition<P> {
  readonly trigger: ScheduleTrigger;
  /** Produces the firings of one daily run — typically one per (organization × branch). */
  collect(tickAt: Date): Promise<NotificationContext<P>[]>;
}

export type NotificationDefinition<P = unknown> =
  | EventNotificationDefinition<P>
  | ScheduledNotificationDefinition<P>;

/** DI token for the array of every definition instance (see `definitions/index.ts`). */
export const NOTIFICATION_DEFINITIONS = Symbol('NOTIFICATION_DEFINITIONS');

/** DI token for the array of queued channel strategies. */
export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Event envelopes carry ids as plain strings, and some producers use sentinels
 * like `'system'`. Anything written to a `uuid` column goes through this.
 */
export function asUuid(value: unknown): string | undefined {
  return typeof value === 'string' && UUID_RE.test(value) ? value : undefined;
}
