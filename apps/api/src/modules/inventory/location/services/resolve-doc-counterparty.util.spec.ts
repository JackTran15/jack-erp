import type { EntityManager } from 'typeorm';
import { DocCounterpartyKind } from '@erp/shared-interfaces';
import { resolveDocCounterparty } from './resolve-doc-counterparty.util';

describe('resolveDocCounterparty', () => {
  const org = 'org-1';
  const makeManager = (found: unknown) =>
    ({ findOne: jest.fn().mockResolvedValue(found) }) as unknown as EntityManager & {
      findOne: jest.Mock;
    };

  it('passes a bare providerId through unchanged (legacy, no validation)', async () => {
    const manager = makeManager(null);
    const r = await resolveDocCounterparty(manager, { providerId: 'prov-1' }, org);
    expect(r).toEqual({
      providerId: 'prov-1',
      counterpartyKind: null,
      counterpartyId: null,
    });
    expect((manager as any).findOne).not.toHaveBeenCalled();
  });

  it('routes supplier → provider_id + counterparty cols', async () => {
    const manager = makeManager({ id: 'prov-1' });
    const r = await resolveDocCounterparty(
      manager,
      { counterpartyKind: DocCounterpartyKind.SUPPLIER, counterpartyId: 'prov-1' },
      org,
    );
    expect(r).toEqual({
      providerId: 'prov-1',
      counterpartyKind: DocCounterpartyKind.SUPPLIER,
      counterpartyId: 'prov-1',
    });
  });

  it('routes customer → counterparty cols, provider_id undefined', async () => {
    const manager = makeManager({ id: 'cust-1' });
    const r = await resolveDocCounterparty(
      manager,
      { counterpartyKind: DocCounterpartyKind.CUSTOMER, counterpartyId: 'cust-1' },
      org,
    );
    expect(r).toEqual({
      providerId: undefined,
      counterpartyKind: DocCounterpartyKind.CUSTOMER,
      counterpartyId: 'cust-1',
    });
  });

  it('routes employee → counterparty cols, provider_id undefined', async () => {
    const manager = makeManager({ id: 'emp-1' });
    const r = await resolveDocCounterparty(
      manager,
      { counterpartyKind: DocCounterpartyKind.EMPLOYEE, counterpartyId: 'emp-1' },
      org,
    );
    expect(r).toEqual({
      providerId: undefined,
      counterpartyKind: DocCounterpartyKind.EMPLOYEE,
      counterpartyId: 'emp-1',
    });
  });

  it('throws when the counterparty does not exist in the org', async () => {
    const manager = makeManager(null);
    await expect(
      resolveDocCounterparty(
        manager,
        { counterpartyKind: DocCounterpartyKind.CUSTOMER, counterpartyId: 'missing' },
        org,
      ),
    ).rejects.toThrow('Customer counterparty not found in organization');
  });

  it('throws when counterpartyId is missing', async () => {
    const manager = makeManager(null);
    await expect(
      resolveDocCounterparty(
        manager,
        { counterpartyKind: DocCounterpartyKind.SUPPLIER },
        org,
      ),
    ).rejects.toThrow('counterpartyId is required');
  });
});
