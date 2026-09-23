import { ERP_TOPICS } from '@erp/shared-kafka-client';
import { InvoiceNotificationDefinition } from './invoice.definition';

describe('InvoiceNotificationDefinition', () => {
  const lookup = {
    userName: jest.fn().mockResolvedValue('Nguyễn Văn A'),
    branchName: jest.fn().mockResolvedValue('Cửa hàng Q1'),
  };
  const definition = new InvoiceNotificationDefinition(lookup as any);

  it('listens to SALE_POSTED (checkout), not draft creation', () => {
    expect(definition.trigger).toEqual({ kind: 'event', topic: ERP_TOPICS.SALE_POSTED });
    expect(definition.permissions).toEqual(['pos.invoice.read']);
  });

  it('builds every variable the push template uses + an invoice target', async () => {
    const built = await definition.build({
      eventId: 'e',
      organizationId: 'o',
      branchId: 'b',
      actorId: 'a',
      occurredAt: new Date(),
      payload: { invoiceId: 'inv-1', documentNumber: '2609220001', totalAmount: 1250000 },
    });

    expect(built).toEqual({
      data: { code: '2609220001', amount: 1250000, actor: 'Nguyễn Văn A', store: 'Cửa hàng Q1' },
      target: { type: 'invoice', id: 'inv-1' },
    });
    expect(lookup.branchName).toHaveBeenCalledWith('b');
  });

  it('skips a malformed payload', async () => {
    await expect(
      definition.build({ eventId: 'e', organizationId: 'o', occurredAt: new Date(), payload: {} as any }),
    ).resolves.toBeNull();
  });
});
