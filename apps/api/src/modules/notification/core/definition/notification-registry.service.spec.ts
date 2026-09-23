import { NotificationRegistry } from './notification-registry.service';
import type { NotificationDefinition } from '../notification.types';

const def = (overrides: Partial<NotificationDefinition> = {}): NotificationDefinition =>
  ({
    type: 'invoice',
    trigger: { kind: 'event', topic: 'erp.sale.posted' },
    permissions: ['pos.invoice.read'],
    excludeActor: true,
    targetApps: ['erp_manager'],
    channels: ['fcm_push'],
    priority: 'high',
    defaultEnabled: true,
    build: async () => ({ data: {} }),
    ...overrides,
  }) as NotificationDefinition;

describe('NotificationRegistry', () => {
  it('indexes by type and topic; one topic may fan out to several types', () => {
    const registry = new NotificationRegistry([
      def({ type: 'purchase', trigger: { kind: 'event', topic: 'erp.gr.posted' } }),
      def({ type: 'stock_in', trigger: { kind: 'event', topic: 'erp.gr.posted' } }),
      def({ type: 'invoice' }),
    ]);

    expect(registry.byType('invoice')?.type).toBe('invoice');
    expect(registry.byTopic('erp.gr.posted').map((d) => d.type)).toEqual(['purchase', 'stock_in']);
    expect(registry.topics().sort()).toEqual(['erp.gr.posted', 'erp.sale.posted']);
  });

  it('lists types per app — the source of availableTypes', () => {
    const registry = new NotificationRegistry([
      def({ type: 'invoice' }),
      def({ type: 'sales_order', targetApps: ['erp_sales'] }),
    ]);
    expect(registry.typesForApp('erp_manager')).toEqual(['invoice']);
    expect(registry.typesForApp('erp_sales')).toEqual(['sales_order']);
  });

  it.each([
    ['duplicate type', [def(), def()]],
    ['non snake_case type', [def({ type: 'invoiceReturn' })]],
    ['no permission', [def({ permissions: [] })]],
    ['no target app', [def({ targetApps: [] })]],
  ])('fails the boot on %s', (_label, definitions) => {
    expect(() => new NotificationRegistry(definitions as NotificationDefinition[])).toThrow();
  });
});
