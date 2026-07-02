import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { DocCounterpartyKind } from '@erp/shared-interfaces';
import { CreateGoodsIssueV2Handler } from './create-goods-issue-v2.handler';
import { CreateGoodsIssueV2Command } from './create-goods-issue-v2.command';

const actor = { organizationId: 'org1', branchId: 'b1', userId: 'u1', roles: [] } as never;

function makeHandler(opts: {
  items: { id: string; productId: string | null }[];
  counterparty?: unknown;
}) {
  const manager = {
    find: jest.fn(async () => opts.items),
    findOne: jest.fn(async () => opts.counterparty ?? null),
    update: jest.fn(async () => ({})),
  };
  const service = {
    create: jest.fn(async () => ({ id: 'gi1', documentNumber: null })),
  };
  const handler = new CreateGoodsIssueV2Handler(
    { manager } as never,
    service as never,
  );
  return { handler, manager, service };
}

const line = (itemId: string, locationId?: string) => ({
  itemId,
  locationId,
  quantity: 1,
});

describe('CreateGoodsIssueV2Handler', () => {
  it('delegates to the service and stamps the counterparty', async () => {
    const { handler, manager, service } = makeHandler({
      items: [
        { id: 'v1', productId: 'p1' },
        { id: 'v2', productId: 'p1' },
      ],
      counterparty: { id: 'prov1' },
    });

    const res = await handler.execute(
      new CreateGoodsIssueV2Command(
        {
          locationId: 'L1',
          counterpartyKind: DocCounterpartyKind.SUPPLIER,
          counterpartyId: 'prov1',
          lines: [line('v1', 'L1'), line('v2', 'L1')],
        } as never,
        actor,
      ),
    );

    expect(res).toEqual({ id: 'gi1', documentNumber: null });
    // Supplier counterparty flows into provider_id of the mapped service dto.
    const mapped = (service.create as jest.Mock).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(mapped.providerId).toBe('prov1');
    expect(mapped.locationId).toBe('L1');
    // Counterparty columns are stamped after the DRAFT is created.
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      { id: 'gi1' },
      { counterpartyKind: DocCounterpartyKind.SUPPLIER, counterpartyId: 'prov1' },
    );
  });

  it('rejects two variants of one product on different effective locations', async () => {
    const { handler, service } = makeHandler({
      items: [
        { id: 'v1', productId: 'p1' },
        { id: 'v2', productId: 'p1' },
      ],
    });

    await expect(
      handler.execute(
        new CreateGoodsIssueV2Command(
          { locationId: 'H', lines: [line('v1', 'L1'), line('v2', 'L2')] } as never,
          actor,
        ),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('rejects an unknown customer counterparty', async () => {
    const { handler } = makeHandler({
      items: [{ id: 'v1', productId: 'p1' }],
      counterparty: null,
    });

    await expect(
      handler.execute(
        new CreateGoodsIssueV2Command(
          {
            locationId: 'L1',
            counterpartyKind: DocCounterpartyKind.CUSTOMER,
            counterpartyId: 'missing',
            lines: [line('v1', 'L1')],
          } as never,
          actor,
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts an active employee counterparty', async () => {
    const { handler, manager, service } = makeHandler({
      items: [{ id: 'v1', productId: 'p1' }],
      counterparty: { id: 'emp1', isActive: true },
    });

    await handler.execute(
      new CreateGoodsIssueV2Command(
        {
          locationId: 'L1',
          counterpartyKind: DocCounterpartyKind.EMPLOYEE,
          counterpartyId: 'emp1',
          lines: [line('v1', 'L1')],
        } as never,
        actor,
      ),
    );

    const mapped = (service.create as jest.Mock).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(mapped.providerId).toBeUndefined();
    expect(manager.update).toHaveBeenCalledWith(
      expect.anything(),
      { id: 'gi1' },
      { counterpartyKind: DocCounterpartyKind.EMPLOYEE, counterpartyId: 'emp1' },
    );
  });
});
