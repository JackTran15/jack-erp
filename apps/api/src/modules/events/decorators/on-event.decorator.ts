import { SetMetadata } from '@nestjs/common';

export const ON_DOMAIN_EVENT_KEY = 'ON_DOMAIN_EVENT';

export interface OnDomainEventOptions {
  /**
   * Consumer-group SUFFIX, not the full name. `EventConsumerService` prepends
   * `KAFKA_CONSUMER_GROUP_PREFIX` (default `erp-api`), so the resulting group is
   * `${prefix}.${groupId}`. Omitted → `${prefix}.${topic}`. Never hardcode the
   * prefix here: a second instance with a different prefix (Jest e2e, a staging
   * replica) must get its own group, or it silently steals this one's events.
   */
  groupId?: string;
  fromBeginning?: boolean;
}

export interface DomainEventMetadata {
  topic: string;
  options?: OnDomainEventOptions;
}

export function OnDomainEvent(
  topic: string,
  options?: OnDomainEventOptions,
): MethodDecorator {
  return SetMetadata(ON_DOMAIN_EVENT_KEY, { topic, options } satisfies DomainEventMetadata);
}
