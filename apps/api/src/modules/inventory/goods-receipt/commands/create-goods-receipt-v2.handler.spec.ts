import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { DocCounterpartyKind, GoodsReceiptStatus } from '@erp/shared-interfaces';
import { CreateGoodsReceiptV2Handler } from './create-goods-receipt-v2.handler';
import { CreateGoodsReceiptV2Command } from './create-goods-receipt-v2.command';

const actor = { organizationId: 'org1', branchId: 'b1', userId: 'u1', roles: [] } as never;

function makeHandler(opts: {
  items: { id: string; productId: string | null }[];
  counterparty?: unknown;
}) {
  const manager = {
    find: jest.fn(async () => opts.items),
    findOne: jest.fn(async () => opts.counterparty ?? null),
    create: jest.fn((_entity: unknown, obj: unknown) => obj),
    save: jest.fn(async (r: Record<string, unknown>) => ({ ...r, id: 'gr1' })),
  };
  const documentNumbering = { generate: jest.fn(async () => 'PNK-1') };
  const handler = new CreateGoodsReceiptV2Handler(
    { manager } as never,
    documentNumbering as never,
  );
  return { handler, manager, documentNumbering };
}

const line = (itemId: string, locationId: string) => ({
  itemId,
  locationId,
  uomCode: 'cái',
  quantity: 2,
  unitPrice: 10,
});

describe('CreateGoodsReceiptV2Handler', () => {
  it('creates a DRAFT, mirrors a supplier counterparty into provider_id', async () => {
    const { handler, manager } = makeHandler({
      items: [
        { id: 'v1', productId: 'p1' },
        { id: 'v2', productId: 'p1' },
      ],
      counterparty: { id: 'prov1' },
    });

    const res = await handler.execute(
      new CreateGoodsReceiptV2Command(
        {
          counterpartyKind: DocCounterpartyKind.SUPPLIER,
          counterpartyId: 'prov1',
          receivedAt: '2026-06-18T00:00:00.000Z',
          lines: [line('v1', 'L1'), line('v2', 'L1')],
        } as never,
        actor,
      ),
    );

    expect(res).toEqual({ id: 'gr1', documentNumber: 'PNK-1' });
    const saved = manager.save.mock.calls[0][0] as Record<string, unknown>;
    expect(saved.status).toBe(GoodsReceiptStatus.DRAFT);
    expect(saved.providerId).toBe('prov1');
    expect(saved.counterpartyKind).toBe(DocCounterpartyKind.SUPPLIER);
    expect(saved.counterpartyId).toBe('prov1');
    expect(saved.locationId).toBe('L1'); // header derived from first line
    expect((saved.lines as unknown[]).length).toBe(2);
  });

  it('rejects two variants of one product on different locations', async () => {
    const { handler, documentNumbering } = makeHandler({
      items: [
        { id: 'v1', productId: 'p1' },
        { id: 'v2', productId: 'p1' },
      ],
    });

    await expect(
      handler.execute(
        new CreateGoodsReceiptV2Command(
          {
            receivedAt: '2026-06-18T00:00:00.000Z',
            lines: [line('v1', 'L1'), line('v2', 'L2')],
          } as never,
          actor,
        ),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(documentNumbering.generate).not.toHaveBeenCalled();
  });

  it('rejects an unknown supplier counterparty', async () => {
    const { handler } = makeHandler({
      items: [{ id: 'v1', productId: 'p1' }],
      counterparty: null,
    });

    await expect(
      handler.execute(
        new CreateGoodsReceiptV2Command(
          {
            counterpartyKind: DocCounterpartyKind.SUPPLIER,
            counterpartyId: 'missing',
            receivedAt: '2026-06-18T00:00:00.000Z',
            lines: [line('v1', 'L1')],
          } as never,
          actor,
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires an active branch', async () => {
    const { handler } = makeHandler({ items: [] });
    await expect(
      handler.execute(
        new CreateGoodsReceiptV2Command(
          { receivedAt: '2026-06-18T00:00:00.000Z', lines: [line('v1', 'L1')] } as never,
          { organizationId: 'org1', userId: 'u1', roles: [] } as never,
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
