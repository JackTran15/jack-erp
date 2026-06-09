import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import {
  CompareFilterDto,
  CompareOperator,
  DateRangeFilterDto,
  StringFilterDto,
  StringOperator,
} from './filter.dto';

let _seq = 0;

export class FilterBuilder<T extends ObjectLiteral> {
  constructor(private readonly qb: SelectQueryBuilder<T>) {}

  private key(col: string): string {
    // `col` may be a full SQL expression (COALESCE(...), a correlated
    // subquery, etc.), so strip every non-alphanumeric char to keep the bound
    // parameter name valid. The trailing counter guarantees uniqueness.
    return `p_${col.replace(/[^a-zA-Z0-9]/g, '_')}_${++_seq}`;
  }

  applyString(col: string, filter?: StringFilterDto): this {
    if (!filter?.value?.trim()) return this;

    const key = this.key(col);

    const sqlMap: Record<StringOperator, string> = {
      [StringOperator.CONTAINS]:     `${col} ILIKE :${key}`,
      [StringOperator.EQUALS]:       `${col} = :${key}`,
      [StringOperator.STARTS_WITH]:  `${col} ILIKE :${key}`,
      [StringOperator.ENDS_WITH]:    `${col} ILIKE :${key}`,
      [StringOperator.NOT_CONTAINS]: `${col} NOT ILIKE :${key}`,
    };

    const valMap: Record<StringOperator, string> = {
      [StringOperator.CONTAINS]:     `%${filter.value}%`,
      [StringOperator.EQUALS]:       filter.value,
      [StringOperator.STARTS_WITH]:  `${filter.value}%`,
      [StringOperator.ENDS_WITH]:    `%${filter.value}`,
      [StringOperator.NOT_CONTAINS]: `%${filter.value}%`,
    };

    this.qb.andWhere(sqlMap[filter.operator], { [key]: valMap[filter.operator] });
    return this;
  }

  applyCompare(col: string, filter?: CompareFilterDto): this {
    if (
      !filter ||
      filter.value === undefined ||
      filter.value === null ||
      filter.value === ''
    ) {
      return this;
    }

    const key = this.key(col);

    const opMap: Record<CompareOperator, string> = {
      [CompareOperator.EQUALS]: '=',
      [CompareOperator.LT]:     '<',
      [CompareOperator.LTE]:    '<=',
      [CompareOperator.GT]:     '>',
      [CompareOperator.GTE]:    '>=',
    };

    this.qb.andWhere(`${col} ${opMap[filter.operator]} :${key}`, {
      [key]: filter.value,
    });
    return this;
  }

  /**
   * Compare a date/timestamp column against a single date with an operator
   * (=, <, <=, >, >=) — both sides cast to `::date` so the time component is
   * ignored. Mirrors the single-date "date-compare" filter cell on the FE.
   */
  applyDateCompare(col: string, filter?: CompareFilterDto): this {
    if (
      !filter ||
      filter.value === undefined ||
      filter.value === null ||
      filter.value === ''
    ) {
      return this;
    }

    const key = this.key(col);

    const opMap: Record<CompareOperator, string> = {
      [CompareOperator.EQUALS]: '=',
      [CompareOperator.LT]:     '<',
      [CompareOperator.LTE]:    '<=',
      [CompareOperator.GT]:     '>',
      [CompareOperator.GTE]:    '>=',
    };

    this.qb.andWhere(`(${col})::date ${opMap[filter.operator]} :${key}::date`, {
      [key]: filter.value,
    });
    return this;
  }

  applyDateRange(col: string, filter?: DateRangeFilterDto): this {
    if (!filter) return this;

    if (filter.from) {
      const k = this.key(`${col}_from`);
      this.qb.andWhere(`${col} >= :${k}`, { [k]: filter.from });
    }

    if (filter.to) {
      const k = this.key(`${col}_to`);
      // Inclusive of the whole `to` day even when the column carries a time
      // component (e.g. `to = '2026-05-26'` must match rows at 2026-05-26 18:48).
      this.qb.andWhere(`${col} < (:${k}::date + INTERVAL '1 day')`, {
        [k]: filter.to,
      });
    }

    return this;
  }

  applyEnum(col: string, value?: string | null): this {
    if (!value) return this;
    const key = this.key(col);
    this.qb.andWhere(`${col} = :${key}`, { [key]: value });
    return this;
  }

  build(): SelectQueryBuilder<T> {
    return this.qb;
  }
}
