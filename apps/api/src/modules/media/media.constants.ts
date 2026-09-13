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
