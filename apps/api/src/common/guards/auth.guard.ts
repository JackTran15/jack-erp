import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { SessionStore } from '../../modules/redis/session.store';
import { IS_PUBLIC_KEY } from '../../modules/auth/decorators/public.decorator';
import { ApiKeyAuthService } from '../../modules/api-key/api-key-auth.service';
import type { JwtPayload } from '@erp/shared-interfaces';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  private readonly jwtSecret: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly sessionStore: SessionStore,
    private readonly apiKeyAuth: ApiKeyAuthService,
  ) {
    this.jwtSecret = this.config.get<string>('JWT_SECRET', 'change-me-secret');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers?.authorization;

    if (authHeader?.startsWith('Bearer ')) {
      return this.authenticateJwt(request, authHeader.slice(7));
    }

    const apiKey = request.headers?.['x-api-key'];
    if (typeof apiKey === 'string' && apiKey.length > 0) {
      return this.authenticateApiKey(request, apiKey);
    }

    throw new UnauthorizedException('Missing or invalid Authorization header');
  }

  private async authenticateJwt(request: any, token: string): Promise<boolean> {
    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, this.jwtSecret) as JwtPayload;
    } catch (err: any) {
      this.logger.debug(`JWT verification failed: ${err.message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }

    const sessionActive = await this.sessionStore.isSessionActive(payload.jti);
    if (!sessionActive) {
      this.logger.debug(`Session revoked or expired: jti=${payload.jti}`);
      throw new UnauthorizedException('Session revoked or expired');
    }

    request.user = payload;
    return true;
  }

  /**
   * Alternate credential (ADR-01, .ai/features/api-key-auth/03-logical-design.md):
   * lets a third-party integration authenticate without a user JWT. Only
   * reached when no `Authorization: Bearer` header was sent — the JWT path
   * always wins if both are present.
   */
  private async authenticateApiKey(
    request: any,
    apiKey: string,
  ): Promise<boolean> {
    const result = await this.apiKeyAuth.validate(apiKey, request.ip);

    switch (result.kind) {
      case 'not_found':
        throw new UnauthorizedException('Invalid API key');
      case 'ip_denied':
        throw new ForbiddenException(
          'This IP address is not whitelisted for this API key',
        );
      case 'ok':
        // userId is the key's real shadow user (ADR-04) — PermissionGuard/
        // RbacService resolve permissions from a DB user_roles lookup keyed
        // on this id, unmodified, exactly as for a JWT request. apiKeyId
        // rides along only for logging/observability, not for authorization.
        request.user = {
          userId: result.actor.userId,
          organizationId: result.actor.organizationId,
          branchIds: result.actor.branchIds,
          apiKeyId: result.actor.apiKeyId,
        };
        return true;
    }
  }
}
