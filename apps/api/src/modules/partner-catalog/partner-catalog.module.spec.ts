import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StockBalanceEntity } from '../inventory/ledger/stock-balance.entity';
import { ItemCategoryEntity } from '../inventory/location/item-category.entity';
import { ItemEntity } from '../inventory/location/item.entity';
import { ItemAttributeValueEntity } from '../inventory/product/item-attribute-value.entity';
import { ProductAttributeDefinitionEntity } from '../inventory/product/product-attribute-definition.entity';
import { ProductAttributeOptionEntity } from '../inventory/product/product-attribute-option.entity';
import { ProductEntity } from '../inventory/product/product.entity';
import {
  ATTRIBUTE_COLOR,
  ATTRIBUTE_SIZE,
  PARTNER_CATALOG_PERMISSION,
  matchesAttributeDimension,
} from './partner-catalog.constants';
import { PartnerCatalogModule } from './partner-catalog.module';

// The repositories are overridden rather than connected: this asserts the
// module graph compiles and every entity it declares is actually resolvable,
// without standing up a database.
const ENTITIES = [
  ItemCategoryEntity,
  ProductEntity,
  ItemEntity,
  StockBalanceEntity,
  ProductAttributeDefinitionEntity,
  ProductAttributeOptionEntity,
  ItemAttributeValueEntity,
];

describe('PartnerCatalogModule', () => {
  let moduleRef: TestingModule;

  beforeAll(async () => {
    const builder = Test.createTestingModule({
      imports: [PartnerCatalogModule],
    });
    for (const entity of ENTITIES) {
      builder.overrideProvider(getRepositoryToken(entity)).useValue({});
    }
    moduleRef = await builder.compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  it('compiles', () => {
    expect(moduleRef.get(PartnerCatalogModule)).toBeInstanceOf(
      PartnerCatalogModule,
    );
  });

  it('resolves a repository for every entity it declares', () => {
    for (const entity of ENTITIES) {
      expect(moduleRef.get(getRepositoryToken(entity))).toBeDefined();
    }
  });
});

describe('partner-catalog constants', () => {
  it('pins the permission key the whole surface authorises on', () => {
    expect(PARTNER_CATALOG_PERMISSION).toBe('partner.catalog.read');
  });

  it('matches attribute dimensions case-insensitively', () => {
    expect(matchesAttributeDimension('Color', ATTRIBUTE_COLOR)).toBe(true);
    expect(matchesAttributeDimension('  color ', ATTRIBUTE_COLOR)).toBe(true);
    expect(matchesAttributeDimension('Màu sắc', ATTRIBUTE_COLOR)).toBe(true);
    expect(matchesAttributeDimension('Size', ATTRIBUTE_SIZE)).toBe(true);
    expect(matchesAttributeDimension('Kích thước', ATTRIBUTE_SIZE)).toBe(true);
  });

  it('does not match an unrelated dimension', () => {
    expect(matchesAttributeDimension('Size', ATTRIBUTE_COLOR)).toBe(false);
    expect(matchesAttributeDimension('Brand', ATTRIBUTE_SIZE)).toBe(false);
  });
});
