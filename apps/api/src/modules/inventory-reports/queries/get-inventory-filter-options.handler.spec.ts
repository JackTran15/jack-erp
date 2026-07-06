import { In } from 'typeorm';
import { ReportFilterOptionType } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InventoryFilterOptionsQueryDto } from '../dto/inventory-filter-options-query.dto';
import { GetInventoryFilterOptionsHandler } from './get-inventory-filter-options.handler';
import { GetInventoryFilterOptionsQuery } from './get-inventory-filter-options.query';

const actor = {
  userId: 'u1',
  organizationId: 'org-1',
  branchIds: ['b1', 'b2'],
  roles: [],
} as unknown as ActorContext;

function build() {
  const branches = { find: jest.fn().mockResolvedValue([]) };
  const storages = { find: jest.fn().mockResolvedValue([]) };
  const categories = { find: jest.fn().mockResolvedValue([]) };
  const items = { createQueryBuilder: jest.fn() };
  const handler = new GetInventoryFilterOptionsHandler(
    branches as never,
    storages as never,
    categories as never,
    items as never,
  );
  return { handler, branches, storages };
}

function query(dto: Partial<InventoryFilterOptionsQueryDto>, a = actor) {
  return new GetInventoryFilterOptionsQuery(
    dto as InventoryFilterOptionsQueryDto,
    a,
  );
}

describe('GetInventoryFilterOptionsHandler (branch permission clamp)', () => {
  it('stores: only the branches the actor manages', async () => {
    const { handler, branches } = build();
    await handler.execute(query({ type: ReportFilterOptionType.STORE }));
    expect(branches.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          id: In(['b1', 'b2']),
        }),
      }),
    );
  });

  it('stores: empty permission set → empty options, no query', async () => {
    const { handler, branches } = build();
    const noAccess = { ...actor, branchIds: [] } as unknown as ActorContext;
    const result = await handler.execute(
      query({ type: ReportFilterOptionType.STORE }, noAccess),
    );
    expect(result).toEqual([]);
    expect(branches.find).not.toHaveBeenCalled();
  });

  it('warehouses: requested branchIds are intersected with permitted', async () => {
    const { handler, storages } = build();
    await handler.execute(
      query({
        type: ReportFilterOptionType.WAREHOUSE,
        branchIds: ['b2', 'b-foreign'],
      }),
    );
    expect(storages.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          branchId: In(['b2']),
        }),
      }),
    );
  });

  it('warehouses: no branchIds requested → every permitted branch', async () => {
    const { handler, storages } = build();
    await handler.execute(query({ type: ReportFilterOptionType.WAREHOUSE }));
    expect(storages.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ branchId: In(['b1', 'b2']) }),
      }),
    );
  });

  it('warehouses: requested branches all outside permitted → empty, no query', async () => {
    const { handler, storages } = build();
    const result = await handler.execute(
      query({
        type: ReportFilterOptionType.WAREHOUSE,
        branchIds: ['b-foreign'],
      }),
    );
    expect(result).toEqual([]);
    expect(storages.find).not.toHaveBeenCalled();
  });
});
