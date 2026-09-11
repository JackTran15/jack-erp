import { BadRequestException, NotFoundException } from '@nestjs/common';
import { StorageEntity } from '../storage.entity';
import { SetDefaultIssuingWarehouseHandler } from './set-default-issuing-warehouse.handler';
import { SetDefaultIssuingWarehouseCommand } from './set-default-issuing-warehouse.command';

function makeHandler(storage: unknown) {
  const manager = {
    findOne: jest.fn(async () => storage),
    update: jest.fn(async (..._args: unknown[]) => ({})),
  };
  const dataSource = {
    transaction: async (cb: (m: unknown) => unknown) => cb(manager),
  };
  return {
    handler: new SetDefaultIssuingWarehouseHandler(dataSource as never),
    manager,
  };
}

describe('SetDefaultIssuingWarehouseHandler', () => {
  const actor = { organizationId: 'org1', branchId: 'b1', userId: 'u1', roles: [] } as never;

  it('clears the previous default then sets the new one', async () => {
    const { handler, manager } = makeHandler({ id: 'S2' });

    const res = await handler.execute(
      new SetDefaultIssuingWarehouseCommand('S2', actor),
    );

    expect(res).toEqual({ storageId: 'S2' });
    expect(manager.update).toHaveBeenCalledTimes(2);
    // First call clears existing defaults in the branch...
    expect(manager.update).toHaveBeenNthCalledWith(
      1,
      StorageEntity,
      { organizationId: 'org1', branchId: 'b1', isDefaultIssuing: true },
      { isDefaultIssuing: false },
    );
    // ...then flags the target storage.
    expect(manager.update).toHaveBeenNthCalledWith(
      2,
      StorageEntity,
      { id: 'S2' },
      { isDefaultIssuing: true },
    );
  });

  it('never writes isDefaultReceiving', async () => {
    const { handler, manager } = makeHandler({ id: 'S2' });

    await handler.execute(new SetDefaultIssuingWarehouseCommand('S2', actor));

    for (const call of manager.update.mock.calls) {
      const [, , payload] = call;
      expect(payload).not.toHaveProperty('isDefaultReceiving');
    }
  });

  it('rejects when there is no active branch', async () => {
    const { handler } = makeHandler({ id: 'S2' });
    await expect(
      handler.execute(
        new SetDefaultIssuingWarehouseCommand('S2', {
          organizationId: 'org1',
          userId: 'u1',
          roles: [],
        } as never),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('404s when the storage is not in the active branch', async () => {
    const { handler } = makeHandler(null);
    await expect(
      handler.execute(new SetDefaultIssuingWarehouseCommand('missing', actor)),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
