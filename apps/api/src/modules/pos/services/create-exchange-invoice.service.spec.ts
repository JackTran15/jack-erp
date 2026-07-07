import { EntityManager, FindOperator } from 'typeorm';
import { CreateExchangeInvoiceService } from './create-exchange-invoice.service';
import { ItemEntity } from '../../inventory/location/item.entity';
import { StorageEntity } from '../../inventory/location/storage.entity';
import { LocationEntity } from '../../inventory/location/location.entity';
import { ItemStorageLocationEntity } from '../../inventory/product/item-storage-location.entity';
import { InvoiceItemEntity, ItemDirection } from '../entities/invoice-item.entity';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const ORG = 'org-1';
const BRANCH = 'branch-b';
const ITEM = 'item-1';
const STORAGE_MAIN = 'storage-main'; // showroom
const STORAGE_WAREHOUSE = 'storage-warehouse';
const LOC_WAREHOUSE = 'loc-warehouse'; // FE-supplied shelf on the new line
const LOC_SHOWROOM_DEFAULT = 'loc-showroom-default';

/** Honours plain equality and `In(...)` conditions, mirroring TypeORM findBy. */
function matches(
  row: Record<string, unknown>,
  where: Record<string, unknown>,
): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (cond instanceof FindOperator) {
      return (cond.value as unknown[]).includes(row[key]);
    }
    return row[key] === cond;
  });
}

function makeManager(opts: {
  catalog: Record<string, unknown>[];
  storages: Record<string, unknown>[];
  isl: Record<string, unknown>[];
  locations: Record<string, unknown>[];
}) {
  const findBy = jest.fn(
    async (entity: unknown, where: Record<string, unknown>) => {
      if (entity === ItemEntity)
        return opts.catalog.filter((r) => matches(r, where));
      if (entity === StorageEntity)
        return opts.storages.filter((r) => matches(r, where));
      if (entity === ItemStorageLocationEntity)
        return opts.isl.filter((r) => matches(r, where));
      return [];
    },
  );
  const findOne = jest.fn(
    async (entity: unknown, options: { where: Record<string, unknown> }) => {
      if (entity === LocationEntity)
        return opts.locations.find((r) => matches(r, options.where)) ?? null;
      return null;
    },
  );
  // create() just echoes the constructed entity so we can assert on its fields.
  const create = jest.fn((_entity: unknown, obj: unknown) => obj);
  return { findBy, findOne, create } as unknown as EntityManager;
}

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: ORG,
  branchId: BRANCH,
  roles: [],
};

const newLine = {
  itemId: ITEM,
  locationId: LOC_WAREHOUSE, // a warehouse shelf the FE happened to send
  itemCode: 'SKU-1',
  itemName: 'Áo thun',
  unit: 'cái',
  quantity: 1,
  unitPrice: 100,
};

describe('CreateExchangeInvoiceService.buildNewLineEntities — showroom location', () => {
  const service = new CreateExchangeInvoiceService(
    {} as never,
    {} as never,
    {} as never,
  );

  it('resolves a new ("Mua thêm") line to the showroom default, not the FE warehouse shelf', async () => {
    const manager = makeManager({
      catalog: [
        { id: ITEM, organizationId: ORG, sellingPrice: 100, purchasePrice: 60 },
      ],
      storages: [
        { id: STORAGE_MAIN, branchId: BRANCH, organizationId: ORG, isMainStorage: true },
        { id: STORAGE_WAREHOUSE, branchId: BRANCH, organizationId: ORG, isMainStorage: false },
      ],
      // Item shelved only in the warehouse (non-main) storage.
      isl: [
        { itemId: ITEM, storageId: STORAGE_WAREHOUSE, locationId: LOC_WAREHOUSE, organizationId: ORG },
      ],
      locations: [
        { id: LOC_SHOWROOM_DEFAULT, storageId: STORAGE_MAIN, organizationId: ORG, isDefault: true },
      ],
    });

    const [entity] = (await (service as never as {
      buildNewLineEntities: (
        m: EntityManager,
        invoiceId: string,
        lines: unknown[],
        a: ActorContext,
        offset: number,
      ) => Promise<InvoiceItemEntity[]>;
    }).buildNewLineEntities(manager, 'inv-1', [newLine], actor, 0)) as InvoiceItemEntity[];

    expect(entity.locationId).toBe(LOC_SHOWROOM_DEFAULT);
    expect(entity.locationId).not.toBe(LOC_WAREHOUSE);
    expect(entity.direction).toBe(ItemDirection.OUT);
  });

  it('falls back to the FE-supplied locationId when the showroom cannot be resolved', async () => {
    const manager = makeManager({
      catalog: [
        { id: ITEM, organizationId: ORG, sellingPrice: 100, purchasePrice: 60 },
      ],
      // No main storage and no default location → resolver returns nothing.
      storages: [
        { id: STORAGE_WAREHOUSE, branchId: BRANCH, organizationId: ORG, isMainStorage: false },
      ],
      isl: [],
      locations: [],
    });

    const [entity] = (await (service as never as {
      buildNewLineEntities: (
        m: EntityManager,
        invoiceId: string,
        lines: unknown[],
        a: ActorContext,
        offset: number,
      ) => Promise<InvoiceItemEntity[]>;
    }).buildNewLineEntities(manager, 'inv-1', [newLine], actor, 0)) as InvoiceItemEntity[];

    expect(entity.locationId).toBe(LOC_WAREHOUSE);
  });
});
