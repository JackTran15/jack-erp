import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { CreateStockTransferV2Handler } from './create-stock-transfer-v2.handler';
import { CreateStockTransferV2Command } from './create-stock-transfer-v2.command';

const actor = { organizationId: 'org1', branchId: 'b1', userId: 'u1', roles: [] } as never;

function makeHandler(items: { id: string; productId: string | null }[]) {
  const manager = { find: jest.fn(async () => items) };
  const service = { createAndPost: jest.fn(async () => ({ id: 'st1' })) };
  const handler = new CreateStockTransferV2Handler(
    { manager } as never,
    service as never,
  );
  return { handler, service };
}

const line = (itemId: string, sourceLocationId?: string) => ({
  itemId,
  quantity: 1,
  sourceStorageId: 'S1',
  destinationStorageId: 'S2',
  sourceLocationId,
});

describe('CreateStockTransferV2Handler', () => {
  it('delegates to createAndPost when source bins are uniform per product', async () => {
    const { handler, service } = makeHandler([
      { id: 'v1', productId: 'p1' },
      { id: 'v2', productId: 'p1' },
    ]);

    const res = await handler.execute(
      new CreateStockTransferV2Command(
        { lines: [line('v1', 'L1'), line('v2', 'L1')] } as never,
        actor,
      ),
    );

    expect(res).toEqual({ id: 'st1' });
    expect(service.createAndPost).toHaveBeenCalledTimes(1);
  });

  it('rejects two variants of one product leaving different source bins', async () => {
    const { handler, service } = makeHandler([
      { id: 'v1', productId: 'p1' },
      { id: 'v2', productId: 'p1' },
    ]);

    await expect(
      handler.execute(
        new CreateStockTransferV2Command(
          { lines: [line('v1', 'L1'), line('v2', 'L2')] } as never,
          actor,
        ),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(service.createAndPost).not.toHaveBeenCalled();
  });

  it('requires an active branch', async () => {
    const { handler } = makeHandler([]);
    await expect(
      handler.execute(
        new CreateStockTransferV2Command(
          { lines: [line('v1', 'L1')] } as never,
          { organizationId: 'org1', userId: 'u1', roles: [] } as never,
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
