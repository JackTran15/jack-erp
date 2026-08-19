import {
  computeVoucherDelta,
  VoucherLineSnapshot,
} from './voucher-delta.util';

const ITEM_A = '11111111-1111-1111-1111-111111111111';
const ITEM_B = '22222222-2222-2222-2222-222222222222';
const LOC_1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const LOC_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function line(
  itemId: string,
  locationId: string,
  quantity: number | string,
  unitPrice: number | string,
): VoucherLineSnapshot {
  return { itemId, locationId, quantity, unitPrice };
}

describe('computeVoucherDelta', () => {
  it('reports nothing when the lines did not move', () => {
    const lines = [line(ITEM_A, LOC_1, 10, 100), line(ITEM_B, LOC_1, 2, 50)];

    expect(computeVoucherDelta(lines, lines)).toEqual([]);
  });

  it('reports a quantity decrease with the value that goes with it', () => {
    const delta = computeVoucherDelta(
      [line(ITEM_A, LOC_1, 10, 100)],
      [line(ITEM_A, LOC_1, 7, 100)],
    );

    expect(delta).toEqual([
      {
        itemId: ITEM_A,
        locationId: LOC_1,
        quantityDelta: -3,
        valueDelta: -300,
        unitCostForDelta: 100,
      },
    ]);
  });

  it('reports a quantity increase', () => {
    const delta = computeVoucherDelta(
      [line(ITEM_A, LOC_1, 5, 80)],
      [line(ITEM_A, LOC_1, 8, 80)],
    );

    expect(delta).toEqual([
      {
        itemId: ITEM_A,
        locationId: LOC_1,
        quantityDelta: 3,
        valueDelta: 240,
        unitCostForDelta: 80,
      },
    ]);
  });

  it('reports a pure price change as a value-only adjustment', () => {
    const delta = computeVoucherDelta(
      [line(ITEM_A, LOC_1, 10, 100)],
      [line(ITEM_A, LOC_1, 10, 120)],
    );

    expect(delta).toEqual([
      {
        itemId: ITEM_A,
        locationId: LOC_1,
        quantityDelta: 0,
        valueDelta: 200,
        unitCostForDelta: 120,
      },
    ]);
  });

  it('reports quantity and price moving together', () => {
    const delta = computeVoucherDelta(
      [line(ITEM_A, LOC_1, 10, 100)],
      [line(ITEM_A, LOC_1, 7, 120)],
    );

    // 7 × 120 = 840 against 10 × 100 = 1000.
    expect(delta).toEqual([
      {
        itemId: ITEM_A,
        locationId: LOC_1,
        quantityDelta: -3,
        valueDelta: -160,
        unitCostForDelta: 53.33,
      },
    ]);
  });

  it('reports an added line as a full increase', () => {
    const delta = computeVoucherDelta(
      [line(ITEM_A, LOC_1, 10, 100)],
      [line(ITEM_A, LOC_1, 10, 100), line(ITEM_B, LOC_2, 4, 25)],
    );

    expect(delta).toEqual([
      {
        itemId: ITEM_B,
        locationId: LOC_2,
        quantityDelta: 4,
        valueDelta: 100,
        unitCostForDelta: 25,
      },
    ]);
  });

  it('reports a removed line as a full reversal', () => {
    const delta = computeVoucherDelta(
      [line(ITEM_A, LOC_1, 10, 100), line(ITEM_B, LOC_2, 4, 25)],
      [line(ITEM_B, LOC_2, 4, 25)],
    );

    expect(delta).toEqual([
      {
        itemId: ITEM_A,
        locationId: LOC_1,
        quantityDelta: -10,
        valueDelta: -1000,
        unitCostForDelta: 100,
      },
    ]);
  });

  it('treats the same item at the same location on two rows as one pair', () => {
    const delta = computeVoucherDelta(
      [line(ITEM_A, LOC_1, 6, 100), line(ITEM_A, LOC_1, 4, 100)],
      [line(ITEM_A, LOC_1, 10, 100)],
    );

    expect(delta).toEqual([]);
  });

  it('keeps the same item at different locations apart', () => {
    const delta = computeVoucherDelta(
      [line(ITEM_A, LOC_1, 10, 100)],
      [line(ITEM_A, LOC_2, 10, 100)],
    );

    expect(delta).toEqual([
      {
        itemId: ITEM_A,
        locationId: LOC_1,
        quantityDelta: -10,
        valueDelta: -1000,
        unitCostForDelta: 100,
      },
      {
        itemId: ITEM_A,
        locationId: LOC_2,
        quantityDelta: 10,
        valueDelta: 1000,
        unitCostForDelta: 100,
      },
    ]);
  });

  it('reverses everything when the voucher is emptied — the delete path', () => {
    const delta = computeVoucherDelta(
      [line(ITEM_A, LOC_1, 10, 100), line(ITEM_B, LOC_2, 4, 25)],
      [],
    );

    expect(delta).toEqual([
      {
        itemId: ITEM_A,
        locationId: LOC_1,
        quantityDelta: -10,
        valueDelta: -1000,
        unitCostForDelta: 100,
      },
      {
        itemId: ITEM_B,
        locationId: LOC_2,
        quantityDelta: -4,
        valueDelta: -100,
        unitCostForDelta: 25,
      },
    ]);
  });

  it('accepts the numeric strings TypeORM hands back', () => {
    const delta = computeVoucherDelta(
      [line(ITEM_A, LOC_1, '10.000', '100.00')],
      [line(ITEM_A, LOC_1, '7.500', '100.00')],
    );

    expect(delta).toEqual([
      {
        itemId: ITEM_A,
        locationId: LOC_1,
        quantityDelta: -2.5,
        valueDelta: -250,
        unitCostForDelta: 100,
      },
    ]);
  });

  it('rounds money to two places and quantity to three', () => {
    const delta = computeVoucherDelta(
      [line(ITEM_A, LOC_1, 3, 33.333)],
      [line(ITEM_A, LOC_1, 3.0001, 33.333)],
    );

    expect(delta).toEqual([]);
  });

  it('rejects a line whose numbers cannot be parsed', () => {
    expect(() =>
      computeVoucherDelta([line(ITEM_A, LOC_1, 'abc', 100)], []),
    ).toThrow(/non-numeric/);
  });
});
