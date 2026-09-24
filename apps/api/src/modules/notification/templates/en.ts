import type { PushTemplateTable } from '../core/templates/template.types';

/** Push text, English. Mirrors `vi.ts` — see the note there. */
export const en: PushTemplateTable = {
  sales_order: {
    title: 'New order {{code}}',
    body: 'You have received order {{code}} worth {{amount}} from {{channel}}.',
  },
  invoice: {
    title: 'New invoice {{code}}',
    body: '{{actor}} created invoice {{code}} worth {{amount}} at {{store}}.',
  },
  invoice_return: {
    title: 'Return invoice {{code}}',
    body: '{{actor}} created return invoice {{code}} worth {{amount}} at {{store}}.',
  },
  invoice_cancel: {
    title: 'Invoice {{code}} cancelled',
    body: '{{actor}} cancelled invoice {{code}} at {{store}}.',
  },
  purchase: {
    title: 'Purchase receipt {{code}}',
    body: '{{actor}} created purchase receipt {{code}} worth {{amount}}.',
  },
  stock_in: {
    title: 'Stock-in voucher {{code}}',
    body: '{{actor}} created stock-in voucher {{code}} at {{store}}.',
  },
  stock_out: {
    title: 'Stock-out voucher {{code}}',
    body: '{{actor}} created stock-out voucher {{code}} at {{store}}.',
  },
  revenue: {
    title: 'Revenue for {{date}}',
    body: 'Total revenue {{amount}} at {{store}}.',
  },
  stock_alert: {
    title: 'Out of stock at {{store}}',
    body: '{{product}} and {{more}} other items are out of stock at {{store}}.',
    plural: { key: 'more', one: { title: 'Out of stock at {{store}}', body: '{{product}} is out of stock at {{store}}.' } },
  },
};
