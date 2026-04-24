import { SetMetadata } from '@nestjs/common';

export const ON_DOMAIN_EVENT_KEY = 'ON_DOMAIN_EVENT';

export interface OnDomainEventOptions {
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
