import { Test, TestingModule } from '@nestjs/testing';

import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  PosCatalogSearchMode,
  PosCatalogSearchQueryDto,
  PosCatalogSearchView,
} from '../dto/pos-catalog-search.query.dto';
import {
  PosCatalogLineDto,
  PosCatalogService,
} from '../services/pos-catalog.service';
import { SearchPosCatalogHandler } from './search-pos-catalog.handler';
import { SearchPosCatalogQuery } from './search-pos-catalog.query';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['cashier'],
};

const line = (over: Partial<PosCatalogLineDto> = {}): PosCatalogLineDto => ({
  itemId: 'I1',
  productId: 'P1',
  code: 'SKU-1',
  name: 'Hàng thử',
  unit: 'cái',
  sellingPrice: 100,
  quantityOnHand: 9,
  sellableQuantity: 4,
  locations: [{ locationId: 'L1', name: 'Kệ A', quantity: 9 }],
  defaultLocationId: 'L1',
  ...over,
});

const dto = (over: Partial<PosCatalogSearchQueryDto> = {}) =>
  ({ q: '235', ...over }) as PosCatalogSearchQueryDto;

describe('SearchPosCatalogHandler', () => {
  let handler: SearchPosCatalogHandler;
  let searchCatalog: jest.Mock;

  beforeEach(async () => {
    searchCatalog = jest.fn().mockResolvedValue({ exact: null, suggestions: [] });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchPosCatalogHandler,
        { provide: PosCatalogService, useValue: { searchCatalog } },
      ],
    }).compile();
    handler = module.get(SearchPosCatalogHandler);
  });

  const run = (d: PosCatalogSearchQueryDto) =>
    handler.execute(new SearchPosCatalogQuery('branch-1', d, actor));

  describe('row cap', () => {
    it('defaults to 20 when the caller asks for none', async () => {
      await run(dto());
      expect(searchCatalog.mock.calls[0][2]).toMatchObject({ limit: 20 });
    });

    it('honours a limit under the ceiling', async () => {
      await run(dto({ limit: 8 }));
      expect(searchCatalog.mock.calls[0][2]).toMatchObject({ limit: 8 });
    });

    it('clamps an oversized limit to 100 instead of rejecting it', async () => {
      await run(dto({ limit: 5000 }));
      expect(searchCatalog.mock.calls[0][2]).toMatchObject({ limit: 100 });
    });
  });

  describe('mode', () => {
    it('asks for the exact arm only when mode=exact', async () => {
      await run(dto({ mode: PosCatalogSearchMode.EXACT }));
      expect(searchCatalog.mock.calls[0][2]).toMatchObject({ exactOnly: true });
    });

    it('asks for both arms by default', async () => {
      await run(dto());
      expect(searchCatalog.mock.calls[0][2]).toMatchObject({ exactOnly: false });
    });
  });

  describe('exact hit', () => {
    it('passes a unique match straight through', async () => {
      searchCatalog.mockResolvedValue({ exact: line(), suggestions: [] });

      const res = await run(dto());

      expect(res.exact).toMatchObject({ itemId: 'I1', code: 'SKU-1' });
    });

    it('keeps the full shape of the exact hit even under view=suggest', async () => {
      // It goes into the cart, not into a list; the caller may need the
      // location the sale will deduct from.
      searchCatalog.mockResolvedValue({ exact: line(), suggestions: [] });

      const res = await run(dto({ view: PosCatalogSearchView.SUGGEST }));

      expect(res.exact).toHaveProperty('locations');
      expect(res.exact).toHaveProperty('quantityOnHand');
    });

    it('reports null when the service found no unique match', async () => {
      searchCatalog.mockResolvedValue({ exact: null, suggestions: [line()] });

      const res = await run(dto());

      expect(res.exact).toBeNull();
      expect(res.suggestions).toHaveLength(1);
    });
  });

  describe('view', () => {
    it('keeps locations and quantityOnHand when view is full or absent', async () => {
      searchCatalog.mockResolvedValue({ exact: null, suggestions: [line()] });

      const res = await run(dto());

      expect(res.suggestions[0]).toHaveProperty('locations');
      expect(res.suggestions[0]).toHaveProperty('quantityOnHand');
    });

    it('drops locations and quantityOnHand when view=suggest', async () => {
      searchCatalog.mockResolvedValue({ exact: null, suggestions: [line()] });

      const res = await run(dto({ view: PosCatalogSearchView.SUGGEST }));

      expect(res.suggestions[0]).not.toHaveProperty('locations');
      expect(res.suggestions[0]).not.toHaveProperty('quantityOnHand');
    });

    it('keeps sellableQuantity under view=suggest — it is the oversell-warning basis', async () => {
      searchCatalog.mockResolvedValue({
        exact: null,
        suggestions: [line({ sellableQuantity: 0 })],
      });

      const res = await run(dto({ view: PosCatalogSearchView.SUGGEST }));

      expect(res.suggestions[0]).toMatchObject({ sellableQuantity: 0 });
      // Everything the dropdown renders or hands to addProductByItem.
      expect(Object.keys(res.suggestions[0]!).sort()).toEqual([
        'code',
        'defaultLocationId',
        'itemId',
        'name',
        'productId',
        'sellableQuantity',
        'sellingPrice',
        'unit',
      ]);
    });
  });

  it('scopes the query to the branch and the actor', async () => {
    await run(dto({ includeUntracked: true }));

    const [branchId, passedActor, params] = searchCatalog.mock.calls[0];
    expect(branchId).toBe('branch-1');
    expect(passedActor).toBe(actor);
    expect(params).toMatchObject({ term: '235', includeUntracked: true });
  });
});
