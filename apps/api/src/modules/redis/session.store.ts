import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

export interface SessionPayload {
  userId: string;
  organizationId: string;
  branchIds: string[];
  roles: string[];
  issuedAt: number;
  expiresAt: number;
}

const NAMESPACE = 'session';

@Injectable()
export class SessionStore {
  private readonly logger = new Logger(SessionStore.name);

  constructor(private readonly redis: RedisService) {}

  async createSession(
    sessionId: string,
    payload: SessionPayload,
    ttlSeconds: number,
  ): Promise<void> {
    await this.redis.setex(
      NAMESPACE,
      sessionId,
      ttlSeconds,
      JSON.stringify(payload),
    );
    this.logger.debug(`Session created: ${sessionId}`);
  }

  async getSession(sessionId: string): Promise<SessionPayload | null> {
    const raw = await this.redis.get(NAMESPACE, sessionId);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as SessionPayload;
    } catch {
      this.logger.warn(`Corrupt session data for ${sessionId}, removing`);
      await this.revokeSession(sessionId);
      return null;
    }
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.redis.del(NAMESPACE, sessionId);
    this.logger.debug(`Session revoked: ${sessionId}`);
  }

  async isSessionActive(sessionId: string): Promise<boolean> {
    return this.redis.exists(NAMESPACE, sessionId);
  }
}
