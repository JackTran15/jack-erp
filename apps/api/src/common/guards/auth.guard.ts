import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { SessionStore } from '../../modules/redis/session.store';
import { IS_PUBLIC_KEY } from '../../modules/auth/decorators/public.decorator';
import type { JwtPayload } from '@erp/shared-interfaces';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  private readonly jwtSecret: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly sessionStore: SessionStore,
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

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);

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
}
