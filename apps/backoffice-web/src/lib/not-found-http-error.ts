import { HttpError } from "./http";

const ENTITY_NOT_REGISTERED = /is not registered/i;

/**
 * True when the failure should be shown as an HTTP 404-style screen (missing route,
 * unregistered CRUD entity, missing record, …).
 */
export function isNotFoundHttpError(error: unknown): boolean {
  if (error instanceof HttpError) {
    const status = error.error.status;
    if (status === 404) {
      return true;
    }
    if (status === 0 && ENTITY_NOT_REGISTERED.test(error.message)) {
      return true;
    }
  }
  if (error instanceof Error && ENTITY_NOT_REGISTERED.test(error.message)) {
    return true;
  }
  return false;
}
