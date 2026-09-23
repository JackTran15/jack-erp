import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DEFAULT_NOTIFICATION_LOCALE,
  NOTIFICATION_LOCALES,
  NotificationData,
  NotificationLocale,
} from '../notification.types';
import type { PushTemplate, PushTemplateCatalog } from './template.types';

/** DI token for the template catalog (`templates/index.ts`); tests pass their own. */
export const PUSH_TEMPLATE_CATALOG = Symbol('PUSH_TEMPLATE_CATALOG');

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

const NUMBER_LOCALE: Record<NotificationLocale, string> = { vi: 'vi-VN', en: 'en-US' };
const BUSINESS_TIME_ZONE = 'Asia/Ho_Chi_Minh';

/**
 * Renders the push text (title/body) for one type in one locale.
 *
 * Only the PUSH is rendered server-side: the OS shows it while no Dart code
 * runs. The in-app list is rendered by the app from the raw `data`, so its
 * sentences follow the app language and number format.
 *
 * Formatting is by variable name, the same convention the app uses:
 * `amount*` → money, `date` → dd/MM/yyyy, other numbers → grouped.
 * A missing variable renders as empty text and logs a warning — never a raw
 * `{{code}}` in someone's notification tray.
 */
@Injectable()
export class TemplateRenderer {
  private readonly logger = new Logger(TemplateRenderer.name);

  constructor(@Inject(PUSH_TEMPLATE_CATALOG) private readonly catalog: PushTemplateCatalog) {}

  normalizeLocale(locale: string | null | undefined): NotificationLocale {
    const short = (locale ?? '').slice(0, 2).toLowerCase();
    return (NOTIFICATION_LOCALES as readonly string[]).includes(short)
      ? (short as NotificationLocale)
      : DEFAULT_NOTIFICATION_LOCALE;
  }

  hasTemplate(type: string, locale: NotificationLocale): boolean {
    return Boolean(this.catalog[locale]?.[type]);
  }

  render(type: string, localeInput: string | null | undefined, data: NotificationData): PushTemplate | null {
    const locale = this.normalizeLocale(localeInput);
    const template = this.catalog[locale]?.[type] ?? this.catalog[DEFAULT_NOTIFICATION_LOCALE]?.[type];
    if (!template) {
      this.logger.warn(`No push template for type=${type} locale=${locale}`);
      return null;
    }
    const count = template.plural ? Number(data[template.plural.key] ?? 0) : 1;
    const chosen = template.plural && !(count > 0) ? template.plural.one : template;
    return {
      title: this.fill(chosen.title, { type, locale, data }),
      body: this.fill(chosen.body, { type, locale, data }),
    };
  }

  private fill(
    text: string,
    { type, locale, data }: { type: string; locale: NotificationLocale; data: NotificationData },
  ): string {
    return text
      .replace(PLACEHOLDER, (_match, key: string) => {
        const value = data[key];
        if (value === undefined || value === null || value === '') {
          this.logger.warn(`Missing template variable "${key}" for type=${type}`);
          return '';
        }
        return this.format(key, value, locale);
      })
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private format(key: string, value: string | number, locale: NotificationLocale): string {
    if (key.startsWith('amount')) {
      const amount = Number(value);
      if (Number.isFinite(amount)) {
        return `${new Intl.NumberFormat(NUMBER_LOCALE[locale], { maximumFractionDigits: 0 }).format(amount)} ₫`;
      }
    }
    if (key === 'date' && typeof value === 'string') {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return new Intl.DateTimeFormat('en-GB', {
          timeZone: BUSINESS_TIME_ZONE,
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }).format(date);
      }
    }
    if (typeof value === 'number') {
      return new Intl.NumberFormat(NUMBER_LOCALE[locale]).format(value);
    }
    return value;
  }
}
