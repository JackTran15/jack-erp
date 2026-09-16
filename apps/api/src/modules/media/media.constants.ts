/**
 * Presigned POST ticket lifetime (`media-upload.service.ts`, ADR-02).
 *
 * Also the floor for the ADR-05 invariant enforced in `media-link.service.ts`
 * and `media-cleanup.job.ts`: `object_removed_at` may only be stamped once a
 * row's `created_at` is older than this many seconds. Until then, the ticket
 * holder can still POST to the object's key — stamping earlier would let a
 * fresh upload landing on that key go untracked forever (cleanup's step 2
 * only ever looks at `object_removed_at IS NULL`).
 */
export const UPLOAD_TICKET_TTL_SECONDS = 10 * 60;

/**
 * Added on top of `UPLOAD_TICKET_TTL_SECONDS` everywhere the ADR-05 invariant
 * above is enforced with a DB-clock comparison. The app server, MinIO and
 * Postgres are three separate clocks; none of the "past TTL" checks compares
 * a wall-clock reading from one against a timestamp written by another
 * without this margin absorbing their skew.
 */
export const UPLOAD_TICKET_GRACE_SECONDS = 60;
