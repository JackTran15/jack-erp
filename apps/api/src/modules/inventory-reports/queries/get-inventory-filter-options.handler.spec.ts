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

/**
 * The pickers are organization-wide, matching the reports they feed (ADR-04,
 * extended to the whole stock/transfer family on 2026-09-04). Clamping the list
 * to `actor.branchIds` would leave stores the user is allowed to report on
 * unreachable. `organizationId` is the only boundary here.
 */
describe('GetInventoryFilterOptionsHandler (organization-wide pickers)', () => {
  it('stores: every branch of the organization, not just the assigned ones', async () => {
    const { handler, branches } = build();
    await handler.execute(query({ type: ReportFilterOptionType.STORE }));
    expect(branches.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1' } }),
    );
  });

  it('stores: an actor with no branch assignment still gets the full list', async () => {
    const { handler, branches } = build();
    const noAssignment = { ...actor, branchIds: [] } as unknown as ActorContext;
    await handler.execute(
      query({ type: ReportFilterOptionType.STORE }, noAssignment),
    );
    expect(branches.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1' } }),
    );
  });

  it('warehouses: requested branchIds are honored as-is', async () => {
    const { handler, storages } = build();
    await handler.execute(
      query({
        type: ReportFilterOptionType.WAREHOUSE,
        branchIds: ['b2', 'b3'],
      }),
    );
    expect(storages.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          branchId: In(['b2', 'b3']),
        }),
      }),
    );
  });

  it('warehouses: no branchIds requested → no branch predicate at all', async () => {
    const { handler, storages } = build();
    await handler.execute(query({ type: ReportFilterOptionType.WAREHOUSE }));
    expect(storages.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1' } }),
    );
  });

  it('warehouses: a branch of another organization simply matches nothing', async () => {
    const { handler, storages } = build();
    const result = await handler.execute(
      query({
        type: ReportFilterOptionType.WAREHOUSE,
        branchIds: ['b-foreign'],
      }),
    );
    // organizationId is still in the predicate, so a foreign id returns no
    // rows rather than leaking another tenant's storages.
    expect(storages.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-1' }),
      }),
    );
    expect(result).toEqual([]);
  });
});
