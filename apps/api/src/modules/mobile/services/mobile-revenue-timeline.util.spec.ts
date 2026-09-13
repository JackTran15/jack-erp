import { MobileRevenueTimeUnit } from '../dto/mobile-revenue-report.query.dto';
import {
  bucketKeysOf,
  bucketStartOf,
  fillBuckets,
} from './mobile-revenue-timeline.util';

describe('bucketKeysOf', () => {
  it('hour: 24 khoá "0".."23", không phụ thuộc kỳ', () => {
    const keys = bucketKeysOf({ unit: MobileRevenueTimeUnit.HOUR, from: '2026-09-01', to: '2026-09-30' });
    expect(keys).toHaveLength(24);
    expect(keys[0]).toBe('0');
    expect(keys[23]).toBe('23');
  });

  it('weekday: 7 khoá "1".."7" theo ISO', () => {
    expect(
      bucketKeysOf({ unit: MobileRevenueTimeUnit.WEEKDAY, from: '2026-09-01', to: '2026-09-07' }),
    ).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  });

  it('day: mỗi ngày của kỳ, vắt qua cuối tháng', () => {
    expect(
      bucketKeysOf({ unit: MobileRevenueTimeUnit.DAY, from: '2026-09-29', to: '2026-10-02' }),
    ).toEqual([
      '2026-09-29T00:00:00',
      '2026-09-30T00:00:00',
      '2026-10-01T00:00:00',
      '2026-10-02T00:00:00',
    ]);
  });

  it('week: bắt đầu từ thứ Hai của tuần chứa `from`, kể cả khi thứ Hai đó trước `from`', () => {
    // 2026-09-02 là thứ Tư; thứ Hai của tuần đó là 2026-08-31.
    expect(
      bucketKeysOf({ unit: MobileRevenueTimeUnit.WEEK, from: '2026-09-02', to: '2026-09-20' }),
    ).toEqual(['2026-08-31T00:00:00', '2026-09-07T00:00:00', '2026-09-14T00:00:00']);
  });

  it('month: ngày 1 của từng tháng, vắt qua giao thừa', () => {
    expect(
      bucketKeysOf({ unit: MobileRevenueTimeUnit.MONTH, from: '2025-11-15', to: '2026-02-03' }),
    ).toEqual([
      '2025-11-01T00:00:00',
      '2025-12-01T00:00:00',
      '2026-01-01T00:00:00',
      '2026-02-01T00:00:00',
    ]);
  });

  it('year: 01/01 của từng năm', () => {
    expect(
      bucketKeysOf({ unit: MobileRevenueTimeUnit.YEAR, from: '2024-06-01', to: '2026-01-01' }),
    ).toEqual(['2024-01-01T00:00:00', '2025-01-01T00:00:00', '2026-01-01T00:00:00']);
  });

  it('kỳ ngược → rỗng ở mức liên tục, vẫn đủ ô ở hour/weekday', () => {
    expect(bucketKeysOf({ unit: MobileRevenueTimeUnit.DAY, from: '2026-09-10', to: '2026-09-01' })).toEqual([]);
    expect(bucketKeysOf({ unit: MobileRevenueTimeUnit.HOUR, from: '2026-09-10', to: '2026-09-01' })).toHaveLength(24);
  });
});

describe('bucketStartOf', () => {
  it('hour: ngày `from` lúc giờ đó, giờ hai chữ số, không offset', () => {
    expect(
      bucketStartOf({ unit: MobileRevenueTimeUnit.HOUR, key: '9', from: '2026-09-01' }),
    ).toBe('2026-09-01T09:00:00');
  });

  it('weekday: ngày đầu tiên kể từ `from` có thứ đó', () => {
    // 2026-09-04 là thứ Sáu (ISO 5): thứ Hai kế tiếp là 07/09, thứ Sáu là chính nó.
    expect(
      bucketStartOf({ unit: MobileRevenueTimeUnit.WEEKDAY, key: '1', from: '2026-09-04' }),
    ).toBe('2026-09-07T00:00:00');
    expect(
      bucketStartOf({ unit: MobileRevenueTimeUnit.WEEKDAY, key: '5', from: '2026-09-04' }),
    ).toBe('2026-09-04T00:00:00');
    expect(
      bucketStartOf({ unit: MobileRevenueTimeUnit.WEEKDAY, key: '7', from: '2026-09-04' }),
    ).toBe('2026-09-06T00:00:00');
  });

  it('mức liên tục: khoá đã là start', () => {
    expect(
      bucketStartOf({ unit: MobileRevenueTimeUnit.MONTH, key: '2026-09-01T00:00:00', from: '2026-09-15' }),
    ).toBe('2026-09-01T00:00:00');
  });
});

describe('fillBuckets', () => {
  it('lấp mốc vắng bằng 0, giữ thứ tự, làm tròn hai chữ số', () => {
    const points = fillBuckets({
      unit: MobileRevenueTimeUnit.HOUR,
      from: '2026-09-01',
      to: '2026-09-30',
      rows: [
        { bucket: '9', revenue: 1500000.004 },
        { bucket: '21', revenue: -200000 },
      ],
    });

    expect(points).toHaveLength(24);
    expect(points[9]).toEqual({ start: '2026-09-01T09:00:00', revenue: 1500000 });
    expect(points[21]).toEqual({ start: '2026-09-01T21:00:00', revenue: -200000 });
    expect(points[0]).toEqual({ start: '2026-09-01T00:00:00', revenue: 0 });
  });

  it('bỏ ô có khoá ngoài kỳ, không cộng lén vào mốc nào', () => {
    const points = fillBuckets({
      unit: MobileRevenueTimeUnit.DAY,
      from: '2026-09-01',
      to: '2026-09-02',
      rows: [{ bucket: '2026-08-31T00:00:00', revenue: 999 }],
    });

    expect(points.map((p) => p.revenue)).toEqual([0, 0]);
  });
});
