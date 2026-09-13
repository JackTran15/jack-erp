import { MobileRevenueTimeUnit } from '../dto/mobile-revenue-report.query.dto';
import { MobileRevenuePointDto } from '../dto/mobile-revenue-report.response.dto';

/**
 * Lấp đủ mốc cho chuỗi thời gian của `GET /mobile/reports/revenue/timeline`.
 *
 * Làm ở TS chứ không `generate_series` trong SQL, vì ba lý do: (1) `hour` và
 * `weekday` không phải chuỗi liên tục nên SQL cũng phải rẽ nhánh; (2) spec
 * mock `query` kiểm được toàn bộ luật lấp/sắp mà không cần Postgres; (3) cùng
 * cách `chartMonthsOf` của báo cáo kinh doanh đã làm.
 *
 * KHOÁ của một mốc là chuỗi do `TIME_BUCKET_SQL` (`mobile-revenue-report.sql.ts`)
 * sinh ra ở phía SQL — hai bên phải cùng định dạng, và test khoá điều đó:
 * `hour` → `'0'..'23'`, `weekday` → `'1'..'7'` (ISO, 1 = thứ Hai), bốn mức còn
 * lại → chính chuỗi `start` dạng `yyyy-MM-ddTHH:mm:ss`.
 *
 * Mọi phép cuộn ngày đi qua `Date.UTC` để không dính múi giờ của tiến trình
 * Node — ngày ở đây là ngày TRẦN (`yyyy-MM-dd`), không phải một thời điểm.
 */

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** `yyyy-MM-dd` → `Date` tại 00:00 UTC của ngày đó. */
function utcDateOf(isoDate: string): Date {
  return new Date(
    Date.UTC(
      Number(isoDate.slice(0, 4)),
      Number(isoDate.slice(5, 7)) - 1,
      Number(isoDate.slice(8, 10)),
    ),
  );
}

/** `Date` (đọc theo UTC) → `yyyy-MM-dd`. */
function isoDateOf(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

/** Thứ theo ISO: 1 = thứ Hai … 7 = Chủ nhật (JS `getUTCDay` thì 0 = Chủ nhật). */
function isoWeekdayOf(date: Date): number {
  return ((date.getUTCDay() + 6) % 7) + 1;
}

function addDays(date: Date, days: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days),
  );
}

const startOfDay = (isoDate: string): string => `${isoDate}T00:00:00`;

/** Mọi khoá mốc của kỳ theo mức, tăng dần. Kỳ ngược (`from > to`) → rỗng ở bốn mức liên tục. */
export function bucketKeysOf(params: {
  unit: MobileRevenueTimeUnit;
  from: string;
  to: string;
}): string[] {
  const { unit, from, to } = params;
  const first = utcDateOf(from);
  const last = utcDateOf(to);

  switch (unit) {
    case MobileRevenueTimeUnit.HOUR:
      return Array.from({ length: 24 }, (_, hour) => String(hour));

    case MobileRevenueTimeUnit.WEEKDAY:
      return Array.from({ length: 7 }, (_, index) => String(index + 1));

    case MobileRevenueTimeUnit.DAY: {
      const keys: string[] = [];
      for (let d = first; d <= last; d = addDays(d, 1)) {
        keys.push(startOfDay(isoDateOf(d)));
      }
      return keys;
    }

    case MobileRevenueTimeUnit.WEEK: {
      // Thứ Hai của tuần chứa `from` — có thể TRƯỚC `from`, đúng cách
      // `date_trunc('week')` của Postgres gán dòng hoá đơn vào tuần.
      const keys: string[] = [];
      for (
        let d = addDays(first, 1 - isoWeekdayOf(first));
        d <= last;
        d = addDays(d, 7)
      ) {
        keys.push(startOfDay(isoDateOf(d)));
      }
      return keys;
    }

    case MobileRevenueTimeUnit.MONTH: {
      const keys: string[] = [];
      const lastMonth = last.getUTCFullYear() * 12 + last.getUTCMonth();
      for (
        let m = first.getUTCFullYear() * 12 + first.getUTCMonth();
        m <= lastMonth;
        m++
      ) {
        keys.push(startOfDay(`${Math.floor(m / 12)}-${pad2((m % 12) + 1)}-01`));
      }
      return keys;
    }

    case MobileRevenueTimeUnit.YEAR: {
      const keys: string[] = [];
      for (let y = first.getUTCFullYear(); y <= last.getUTCFullYear(); y++) {
        keys.push(startOfDay(`${y}-01-01`));
      }
      return keys;
    }
  }
}

/**
 * Chuỗi `start` mà app nhận cho một khoá.
 *
 * `hour`: ngày `from` lúc giờ đó — ngày nào không quan trọng, app chỉ đọc
 * `.hour`. `weekday`: ngày ĐẦU TIÊN kể từ `from` có thứ đó — app chỉ đọc
 * `.weekday`, nhưng chọn một ngày thật trong kỳ để giá trị không vô nghĩa.
 * Bốn mức còn lại: khoá đã là `start`.
 */
export function bucketStartOf(params: {
  unit: MobileRevenueTimeUnit;
  key: string;
  from: string;
}): string {
  const { unit, key, from } = params;

  switch (unit) {
    case MobileRevenueTimeUnit.HOUR:
      return `${from}T${pad2(Number(key))}:00:00`;

    case MobileRevenueTimeUnit.WEEKDAY: {
      const first = utcDateOf(from);
      const offset = (Number(key) - isoWeekdayOf(first) + 7) % 7;
      return startOfDay(isoDateOf(addDays(first, offset)));
    }

    default:
      return key;
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Ghép các ô đã gộp từ SQL vào danh sách ĐỦ mốc của kỳ: mốc vắng = 0, thứ tự
 * theo `bucketKeysOf`. Ô có khoá ngoài kỳ (không xảy ra vì SQL đã lọc theo kỳ,
 * nhưng nếu có) bị bỏ, không được cộng lén vào mốc nào.
 */
export function fillBuckets(params: {
  unit: MobileRevenueTimeUnit;
  from: string;
  to: string;
  rows: { bucket: string; revenue: number }[];
}): MobileRevenuePointDto[] {
  const { unit, from, to, rows } = params;
  const byKey = new Map(rows.map((r) => [r.bucket, Number(r.revenue ?? 0)]));

  return bucketKeysOf({ unit, from, to }).map((key) => ({
    start: bucketStartOf({ unit, key, from }),
    revenue: round2(byKey.get(key) ?? 0),
  }));
}
