import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export interface HandoffPayload {
  userId: string;
  organizationId: string;
  /** Branch the receiving app should activate; absent = first assigned branch. */
  branchId?: string;
}

const NAMESPACE = 'auth-handoff';

/**
 * Short-lived, single-use codes that let an already-signed-in app hand a user to
 * a sibling app (backoffice → POS) without a second login. Only the code travels
 * in the URL — never a token — and it dies on first use.
 */
@Injectable()
export class HandoffStore {
  private readonly logger = new Logger(HandoffStore.name);

  constructor(private readonly redis: RedisService) {}

  async issue(
    code: string,
    payload: HandoffPayload,
    ttlSeconds: number,
  ): Promise<void> {
    await this.redis.setex(
      NAMESPACE,
      code,
      ttlSeconds,
      JSON.stringify(payload),
    );
    this.logger.debug(`Handoff code issued for user ${payload.userId}`);
  }

  /** GETDEL, not GET+DEL: two tabs racing the same code must not both win. */
  async consume(code: string): Promise<HandoffPayload | null> {
    const raw = await this.redis.getdel(NAMESPACE, code);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as HandoffPayload;
    } catch {
      this.logger.warn('Corrupt handoff payload, discarded');
      return null;
    }
  }
}
