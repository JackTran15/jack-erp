import type { PushTemplateTable } from '../core/templates/template.types';

/**
 * Push text, Vietnamese. Keep the sentences aligned with the mobile l10n
 * `notifications.list.message.*` (jack-erp-mobile `apps/erp_manager/assets/locales/vi.json`):
 * same facts, same variables — the tray and the in-app list must say the same thing.
 */
export const vi: PushTemplateTable = {
  sales_order: {
    title: 'Đơn hàng mới {{code}}',
    body: 'Bạn vừa nhận được đơn hàng {{code}} có giá trị {{amount}} gửi từ {{channel}}.',
  },
  invoice: {
    title: 'Hoá đơn mới {{code}}',
    body: '{{actor}} đã lập hoá đơn {{code}} trị giá {{amount}} tại {{store}}.',
  },
  invoice_return: {
    title: 'Hoá đơn đổi trả {{code}}',
    body: '{{actor}} đã lập hoá đơn đổi trả {{code}} trị giá {{amount}} tại {{store}}.',
  },
  invoice_cancel: {
    title: 'Huỷ hoá đơn {{code}}',
    body: '{{actor}} đã huỷ hoá đơn {{code}} tại {{store}}.',
  },
  purchase: {
    title: 'Phiếu nhập hàng {{code}}',
    body: '{{actor}} đã lập phiếu nhập hàng {{code}} trị giá {{amount}}.',
  },
  stock_in: {
    title: 'Phiếu nhập kho {{code}}',
    body: '{{actor}} đã lập phiếu nhập kho {{code}} tại {{store}}.',
  },
  stock_out: {
    title: 'Phiếu xuất kho {{code}}',
    body: '{{actor}} đã lập phiếu xuất kho {{code}} tại {{store}}.',
  },
  revenue: {
    title: 'Doanh thu ngày {{date}}',
    body: 'Tổng doanh thu {{amount}} tại {{store}}.',
  },
  stock_alert: {
    title: 'Cảnh báo hết hàng tại {{store}}',
    body: '{{product}} và {{more}} mặt hàng khác đã hết hàng tại {{store}}.',
    plural: { key: 'more', one: { title: 'Cảnh báo hết hàng tại {{store}}', body: '{{product}} đã hết hàng tại {{store}}.' } },
  },
};
