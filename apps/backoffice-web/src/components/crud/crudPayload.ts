import type { FieldDefinition } from "@erp/shared-interfaces";

/**
 * Field types whose column is NOT text in Postgres (uuid / date / numeric / enum).
 * An empty string is a valid value for a text column but a cast error for these —
 * and the generic CRUD endpoint takes `Record<string, any>` with no DTO, so the
 * blank would reach the driver and fail with 22P02 (a 500, not a 400).
 */
const NON_TEXT_FIELD_TYPES = new Set<FieldDefinition["type"]>([
  "relation",
  "date",
  "number",
  "enum",
]);

function isBlank(value: unknown): boolean {
  return value === "" || value === undefined || value === null;
}

/**
 * Normalize a blank value for one field.
 *
 * Create omits the key entirely (let the column default apply); update sends
 * `null` so clearing a previously-set FK/date actually clears it rather than
 * silently keeping the old value.
 */
export type CrudPayloadMode = "create" | "update";

/**
 * Build the request body for the generic CRUD endpoints from a form's value map.
 *
 * Blank values on non-text fields are dropped (create) or nulled (update);
 * everything else is passed through unchanged.
 */
export function buildCrudPayload(
  fields: FieldDefinition[],
  values: Record<string, unknown>,
  mode: CrudPayloadMode,
  readValue: (field: FieldDefinition) => unknown = (field) => values[field.key],
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  fields.forEach((field) => {
    const value = readValue(field);
    if (NON_TEXT_FIELD_TYPES.has(field.type) && isBlank(value)) {
      if (mode === "update") payload[field.key] = null;
      return;
    }
    payload[field.key] = value;
  });
  return payload;
}

/**
 * Same normalization for payloads assembled elsewhere (custom forms that manage
 * keys outside `fields`): strips/nulls blanks on the declared non-text fields and
 * leaves unknown keys untouched.
 */
export function sanitizeCrudPayload(
  fields: FieldDefinition[],
  payload: Record<string, unknown>,
  mode: CrudPayloadMode,
): Record<string, unknown> {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    const field = byKey.get(key);
    if (field && NON_TEXT_FIELD_TYPES.has(field.type) && isBlank(value)) {
      if (mode === "update") next[key] = null;
      continue;
    }
    next[key] = value;
  }
  return next;
}
