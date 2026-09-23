import type { Type } from '@nestjs/common';
import type { NotificationDefinition } from '../core/notification.types';
import { InvoiceCancelNotificationDefinition } from './invoice-cancel.definition';
import { InvoiceReturnNotificationDefinition } from './invoice-return.definition';
import { InvoiceNotificationDefinition } from './invoice.definition';
import { PurchaseNotificationDefinition } from './purchase.definition';
import { RevenueNotificationDefinition } from './revenue.definition';
import { StockAlertNotificationDefinition } from './stock-alert.definition';
import { StockInNotificationDefinition } from './stock-in.definition';
import { StockOutNotificationDefinition } from './stock-out.definition';

/**
 * Every notification type of the system. Adding a type = one class in this
 * folder + one line here + templates in `templates/`. The core never changes.
 *
 * Wire codes are permanent (stored in `notifications.type`, user settings and
 * pushes already sent). The mobile app maps them 1-1 to its `NotificationKind`.
 *
 * Not here on purpose: `invoice_edit`, `purchase_return`,
 * `near_expiry` — no business module to listen to yet. Absent from this list =
 * absent from `availableTypes` = "Sắp có" on the mobile settings screen.
 */
export const NOTIFICATION_DEFINITION_CLASSES: Type<NotificationDefinition>[] = [
  InvoiceNotificationDefinition,
  InvoiceReturnNotificationDefinition,
  InvoiceCancelNotificationDefinition,
  PurchaseNotificationDefinition,
  StockInNotificationDefinition,
  StockOutNotificationDefinition,
  RevenueNotificationDefinition,
  StockAlertNotificationDefinition,
];
