import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { PublicMedia } from '../media/media-query.service';
import { PartnerCategoryNodeDto } from './dto/partner-category-tree.dto';
import { PartnerProductDetailDto } from './dto/partner-product-detail.dto';
import { PartnerProductRowDto } from './dto/partner-product-search.dto';
import { SearchPartnerProductsHandler } from './queries/search-partner-products.handler';
import { SearchPartnerProductsQuery } from './queries/search-partner-products.query';

/**
 * The partner surface exists to publish a CLOSED list of fields. ADR-01 argues
 * that a separate module is worth the duplication precisely because that list
 * can then be reviewed in one place — which is only true if something watches
 * it. This is that something.
 *
 * These tests are deliberately rigid. Adding a field to a partner response
 * SHOULD fail here and force a decision, rather than slip out to a third party
 * because a shared DTO grew a column.
 */
const DTO_DIR = join(__dirname, 'dto');

/** Names that must never reach a third party. */
const FORBIDDEN = [
  'purchasePrice',
  'purchase_price',
  'costPrice',
  'isPosVisible',
  'is_pos_visible',
  'createdBy',
  'created_by',
  'organizationId',
  'branchId',
  'quantity',
];

/** Strips comments so prose that merely mentions a field is not a false alarm. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const dtoFiles = readdirSync(DTO_DIR).filter(
  (f) => f.endsWith('.dto.ts') && !f.endsWith('.spec.ts'),
);

describe('partner catalog published contract', () => {
  it('ships the DTO files this test knows about', () => {
    // Guards against the scan silently passing because it found nothing.
    expect(dtoFiles.sort()).toEqual([
      'partner-category-tree.dto.ts',
      'partner-product-detail.dto.ts',
      'partner-product-search.dto.ts',
    ]);
  });

  // AC-19
  describe.each(dtoFiles)('%s', (file) => {
    const source = code(readFileSync(join(DTO_DIR, file), 'utf8'));

    it.each(FORBIDDEN)('does not declare %s', (name) => {
      expect(source).not.toContain(name);
    });
  });
});

/**
 * Key-set locks. `toEqual` on a sorted key list, not `toContain` — the point is
 * to catch an ADDED field, and a containment check would let one through.
 */
describe('partner catalog response shapes', () => {
  it('locks the category node', () => {
    const node: PartnerCategoryNodeDto = {
      id: 'c1',
      code: '01',
      name: 'GIÀY DÉP',
      parentId: null,
      productCount: 40,
      children: [],
    };
    expect(Object.keys(node).sort()).toEqual([
      'children',
      'code',
      'id',
      'name',
      'parentId',
      'productCount',
    ]);
  });

  it('locks the product listing row', () => {
    const row: PartnerProductRowDto = {
      id: 'p1',
      code: 'MY88610',
      name: 'Giày búp bê',
      categoryId: 'c1',
      categoryName: 'Giày nữ',
      priceMin: 495000,
      priceMax: 750000,
      colors: ['BA'],
      sizes: ['38'],
      inStock: true,
      images: [],
    };
    expect(Object.keys(row).sort()).toEqual([
      'categoryId',
      'categoryName',
      'code',
      'colors',
      'id',
      'images',
      'inStock',
      'name',
      'priceMax',
      'priceMin',
      'sizes',
    ]);
  });

  it('locks the product detail', () => {
    const detail: PartnerProductDetailDto = {
      id: 'p1',
      code: 'MY88610',
      name: 'Giày búp bê',
      categoryId: 'c1',
      categoryName: 'Giày nữ',
      priceMin: 495000,
      priceMax: 750000,
      colors: ['BA'],
      sizes: ['38'],
      inStock: true,
      images: [],
      description: null,
      attributes: [],
      variants: [],
    };
    expect(Object.keys(detail).sort()).toEqual([
      'attributes',
      'categoryId',
      'categoryName',
      'code',
      'colors',
      'description',
      'id',
      'images',
      'inStock',
      'name',
      'priceMax',
      'priceMin',
      'sizes',
      'variants',
    ]);
  });
});

// AC-06 — `images` now carries real public URLs from MediaQueryService,
// resolved for the whole search page in one call.
describe('partner catalog search — image resolution', () => {
  const actor: ActorContext = {
    userId: 'partner-shadow-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
  };

  const RAW = {
    id: 'p1',
    code: 'MY88610',
    name: 'Giày búp bê MY88610',
    categoryId: null,
    categoryName: null,
    priceMin: 495000,
    priceMax: 750000,
    inStock: true,
  };

  const buildHandler = (
    query: jest.Mock,
    resolvePublicUrls: jest.Mock,
  ): SearchPartnerProductsHandler =>
    new SearchPartnerProductsHandler(
      { manager: { query } } as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      { resolvePublicUrls } as any,
    );

  it('returns image URLs in sort order for a product with two images', async () => {
    const media: PublicMedia[] = [
      {
        id: 'm1',
        url: 'https://cdn.example.com/erp-media-public/org/o1/product/p1/aaa.jpg',
        fileName: 'front.jpg',
      },
      {
        id: 'm2',
        url: 'https://cdn.example.com/erp-media-public/org/o1/product/p1/bbb.jpg',
        fileName: 'back.jpg',
      },
    ];
    const resolvePublicUrls = jest.fn().mockResolvedValue(new Map([['p1', media]]));
    const query = jest
      .fn()
      .mockResolvedValueOnce([RAW])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([]);

    const res = await buildHandler(query, resolvePublicUrls).execute(
      new SearchPartnerProductsQuery({}, actor),
    );

    expect(res.data[0]!.images).toEqual([
      'https://cdn.example.com/erp-media-public/org/o1/product/p1/aaa.jpg',
      'https://cdn.example.com/erp-media-public/org/o1/product/p1/bbb.jpg',
    ]);
  });

  it('returns an empty array for a product without images', async () => {
    const resolvePublicUrls = jest.fn().mockResolvedValue(new Map());
    const query = jest
      .fn()
      .mockResolvedValueOnce([RAW])
      .mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValueOnce([]);

    const res = await buildHandler(query, resolvePublicUrls).execute(
      new SearchPartnerProductsQuery({}, actor),
    );

    expect(res.data[0]!.images).toEqual([]);
  });

  it('resolves images for the whole page with exactly one media query', async () => {
    const resolvePublicUrls = jest.fn().mockResolvedValue(new Map());
    const query = jest
      .fn()
      .mockResolvedValueOnce([RAW, { ...RAW, id: 'p2' }])
      .mockResolvedValueOnce([{ total: 2 }])
      .mockResolvedValueOnce([]);

    await buildHandler(query, resolvePublicUrls).execute(
      new SearchPartnerProductsQuery({}, actor),
    );

    expect(resolvePublicUrls).toHaveBeenCalledTimes(1);
    expect(resolvePublicUrls).toHaveBeenCalledWith(['p1', 'p2'], 'org-1');
  });
});
