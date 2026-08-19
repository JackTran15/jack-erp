import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { AuthErrorCode } from '@erp/shared-interfaces';
import { AuthGuard } from './auth.guard';
import { AuthException } from '../exceptions/auth.exception';
import { SessionStore } from '../../modules/redis/session.store';

jest.mock('jsonwebtoken');

function contextFor(authHeader: string | undefined): ExecutionContext {
  const request = {
    headers: authHeader ? { authorization: authHeader } : {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  let reflector: Reflector;
  let config: ConfigService;
  let sessionStore: SessionStore;
  let guard: AuthGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) } as unknown as Reflector;
    config = { get: jest.fn().mockReturnValue('test-secret') } as unknown as ConfigService;
    sessionStore = { isSessionActive: jest.fn() } as unknown as SessionStore;
    guard = new AuthGuard(reflector, config, sessionStore);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('throws AuthException with TOKEN_EXPIRED when jwt.verify throws TokenExpiredError', async () => {
    (jwt.verify as jest.Mock).mockImplementation(() => {
      throw new jwt.TokenExpiredError('jwt expired', new Date());
    });

    const ctx = contextFor('Bearer some.expired.token');
    let caught: unknown;
    try {
      await guard.canActivate(ctx);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AuthException);
    expect((caught as AuthException).code).toBe(AuthErrorCode.TOKEN_EXPIRED);
  });

  it('throws AuthException with TOKEN_MALFORMED when jwt.verify throws JsonWebTokenError', async () => {
    (jwt.verify as jest.Mock).mockImplementation(() => {
      throw new jwt.JsonWebTokenError('invalid signature');
    });

    const ctx = contextFor('Bearer garbage.token.here');
    let caught: unknown;
    try {
      await guard.canActivate(ctx);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AuthException);
    expect((caught as AuthException).code).toBe(AuthErrorCode.TOKEN_MALFORMED);
  });

  it('throws AuthException with TOKEN_MALFORMED when jwt.verify throws NotBeforeError', async () => {
    (jwt.verify as jest.Mock).mockImplementation(() => {
      throw new jwt.NotBeforeError('jwt not active', new Date());
    });

    const ctx = contextFor('Bearer not.yet.active');
    let caught: unknown;
    try {
      await guard.canActivate(ctx);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AuthException);
    expect((caught as AuthException).code).toBe(AuthErrorCode.TOKEN_MALFORMED);
  });

  it('throws AuthException with SESSION_REVOKED when the session is no longer active', async () => {
    (jwt.verify as jest.Mock).mockReturnValue({ jti: 'jti-1' });
    (sessionStore.isSessionActive as jest.Mock).mockResolvedValue(false);

    const ctx = contextFor('Bearer structurally.valid.token');
    let caught: unknown;
    try {
      await guard.canActivate(ctx);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(AuthException);
    expect((caught as AuthException).code).toBe(AuthErrorCode.SESSION_REVOKED);
  });
});
