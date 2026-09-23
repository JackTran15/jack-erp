import { v5 as uuidv5 } from 'uuid';

/** Namespace of the deterministic event ids of daily notification runs. */
const SCHEDULED_NOTIFICATION_NS = 'b3f1c8a2-5d4e-4f6a-9b7c-2e1d0a9f8c63';

/**
 * Same (type, org, date, subject) → same uuid, so a rerun of the same day's
 * job hits the `notifications` unique key instead of pushing twice.
 * `processed_events.event_id` / `notifications.source_event_id` are `uuid`
 * columns — a readable string id would not even insert.
 */
export function scheduledEventId(parts: {
  type: string;
  organizationId: string;
  date: string;
  subject: string;
}): string {
  return uuidv5(`${parts.type}:${parts.organizationId}:${parts.date}:${parts.subject}`, SCHEDULED_NOTIFICATION_NS);
}
