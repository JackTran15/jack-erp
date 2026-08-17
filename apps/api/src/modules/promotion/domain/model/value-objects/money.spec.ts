import { roundVnd } from './money';

describe('roundVnd', () => {
  it('rounds a fractional amount to the nearest dong', () => {
    expect(roundVnd(479_500.4)).toBe(479_500);
  });

  it('rounds 685_000 * 30% to 205_500', () => {
    expect(roundVnd(685_000 * 0.3)).toBe(205_500);
  });

  it('rounds .5 up', () => {
    expect(roundVnd(100.5)).toBe(101);
  });

  it('leaves a whole number unchanged', () => {
    expect(roundVnd(100_000)).toBe(100_000);
  });
});
