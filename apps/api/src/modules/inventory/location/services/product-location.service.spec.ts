import { UnprocessableEntityException } from '@nestjs/common';
import { ProductLocationService } from './product-location.service';

describe('ProductLocationService.assertProductUniformLocation', () => {
  // assert* is pure; the injected DataSource is unused for this path.
  const service = new ProductLocationService({} as never);

  it('accepts variants of the same product sharing one location', () => {
    expect(() =>
      service.assertProductUniformLocation([
        { itemId: 'a', productId: 'p1', locationId: 'loc1' },
        { itemId: 'b', productId: 'p1', locationId: 'loc1' },
        { itemId: 'c', productId: 'p2', locationId: 'loc2' },
      ]),
    ).not.toThrow();
  });

  it('rejects two variants of one product on different locations', () => {
    expect(() =>
      service.assertProductUniformLocation([
        { itemId: 'a', productId: 'p1', locationId: 'loc1' },
        { itemId: 'b', productId: 'p1', locationId: 'loc2' },
      ]),
    ).toThrow(UnprocessableEntityException);
  });

  it('does not constrain orphan items without a product', () => {
    expect(() =>
      service.assertProductUniformLocation([
        { itemId: 'a', productId: null, locationId: 'loc1' },
        { itemId: 'b', productId: null, locationId: 'loc2' },
        { itemId: 'c', productId: undefined, locationId: 'loc3' },
      ]),
    ).not.toThrow();
  });
});
