import type { NotificationLocale } from '../notification.types';

/** Text shown by the OS in the notification tray. */
export interface PushTemplate {
  title: string;
  body: string;
  /**
   * Singular variant: when `data[key]` is 0 / missing, render `one` instead
   * ("X đã hết hàng" rather than "X và 0 mặt hàng khác đã hết hàng").
   */
  plural?: { key: string; one: { title: string; body: string } };
}

/** `type` → push template, one table per locale. */
export type PushTemplateTable = Record<string, PushTemplate>;

export type PushTemplateCatalog = Record<NotificationLocale, PushTemplateTable>;
