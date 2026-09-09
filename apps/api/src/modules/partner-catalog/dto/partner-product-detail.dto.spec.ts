import {
  PartnerAttributeDto,
  PartnerProductDetailDto,
  PartnerVariantDto,
} from './partner-product-detail.dto';
import { PartnerProductRowDto } from './partner-product-search.dto';

const variant = (): PartnerVariantDto => ({
  id: 'i1',
  code: 'MY88610-BA-38',
  variantLabel: '38 · BA',
  price: 750000,
  inStock: true,
  attributes: { Size: '38', Color: 'BA' },
});

const detail = (): PartnerProductDetailDto => ({
  id: 'p1',
  code: 'MY88610',
  name: 'Giày búp bê MY88610',
  categoryId: 'c1',
  categoryName: 'Giày nữ',
  priceMin: 750000,
  priceMax: 750000,
  colors: ['BA'],
  sizes: ['38', '39'],
  inStock: true,
  images: [],
  description: 'Da bò thật',
  attributes: [
    { name: 'Size', options: ['38', '39'] },
    { name: 'Color', options: ['BA'] },
  ],
  variants: [variant()],
});

describe('PartnerProductDetailDto', () => {
  // AC-15
  it('publishes exactly the documented field set', () => {
    expect(Object.keys(detail()).sort()).toEqual([
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

  it('extends the listing row so both surfaces share field names', () => {
    const row: PartnerProductRowDto = detail();
    expect(row.priceMin).toBe(750000);
    expect(row.images).toEqual([]);
  });

  it('keeps images empty — there is nowhere to store one', () => {
    expect(detail().images).toEqual([]);
  });

  it('describes a variant with a numeric price and a structured attribute map', () => {
    const v = variant();
    expect(typeof v.price).toBe('number');
    expect(v.attributes).toEqual({ Size: '38', Color: 'BA' });
  });

  // A-11: the label is taken verbatim from items.variant_label rather than
  // rebuilt, but the structured map ships alongside so nobody has to parse it.
  it('carries both the stored label and the parsed attributes', () => {
    const v = variant();
    expect(v.variantLabel).toBe('38 · BA');
    expect(Object.keys(v.attributes).sort()).toEqual(['Color', 'Size']);
  });

  it('exposes no cost price or internal flag', () => {
    const keys = JSON.stringify(detail());
    for (const forbidden of [
      'purchasePrice',
      'purchase_price',
      'isPosVisible',
      'branchId',
      'createdBy',
      'organizationId',
      'quantity',
    ]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it('allows a dimension with a single option', () => {
    const attr: PartnerAttributeDto = { name: 'Color', options: ['BA'] };
    expect(attr.options).toHaveLength(1);
  });
});
