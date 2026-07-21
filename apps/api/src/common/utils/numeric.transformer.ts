import { ValueTransformer } from 'typeorm';

/**
 * Postgres returns `numeric` columns as strings (node-postgres does not coerce,
 * because numeric can exceed IEEE-754 range). Without a transformer an entity
 * field declared `amount: number` actually holds a string at runtime, which
 * silently breaks any consumer that does not coerce — e.g. `Number.isFinite`
 * checks in money formatters.
 *
 * Apply to money columns whose magnitude is safely inside Number.MAX_SAFE_INTEGER
 * (VND amounts at numeric(18,2) are).
 */
export const numericTransformer: ValueTransformer = {
  to: (value?: number | string | null) => value,
  from: (value?: string | null): number | null =>
    value === null || value === undefined ? null : Number(value),
};
