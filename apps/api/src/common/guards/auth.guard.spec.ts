import * as jwt from 'jsonwebtoken';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from './auth.guard';
import { SessionStore } from '../../modules/redis/session.store';
import { ApiKeyAuthService } from '../../modules/api-key/api-key-auth.service';

const JWT_SECRET = 'test-secret';

function contextWith(request: any, isPublic = false): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let config: { get: jest.Mock };
  let sessionStore: { isSessionActive: jest.Mock };
  let apiKeyAuth: { validate: jest.Mock };
  let guard: AuthGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    config = { get: jest.fn().mockReturnValue(JWT_SECRET) };
    sessionStore = { isSessionActive: jest.fn().mockResolvedValue(true) };
    apiKeyAuth = { validate: jest.fn() };
    guard = new AuthGuard(
      reflector as unknown as Reflector,
      config as unknown as ConfigService,
      sessionStore as unknown as SessionStore,
      apiKeyAuth as unknown as ApiKeyAuthService,
    );
  });

  it('allows @Public() through with no credential at all', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const request: any = { headers: {} };

    await expect(guard.canActivate(contextWith(request))).resolves.toBe(true);
    expect(apiKeyAuth.validate).not.toHaveBeenCalled();
  });

  it('rejects with 401 when neither Authorization nor X-Api-Key is present (unchanged today)', async () => {
    const request: any = { headers: {} };

    await expect(guard.canActivate(contextWith(request))).rejects.toThrow(
      UnauthorizedException,
    );
    expect(apiKeyAuth.validate).not.toHaveBeenCalled();
  });

  describe('JWT path (regression — unchanged behaviour)', () => {
    it('accepts a valid Bearer token and sets request.user from the payload', async () => {
      const payload = {
        userId: 'user-1',
        organizationId: 'org-1',
        roles: ['admin'],
        branchIds: ['branch-1'],
        jti: 'session-1',
      };
      const token = jwt.sign(payload, JWT_SECRET);
      const request: any = { headers: { authorization: `Bearer ${token}` } };

      const allowed = await guard.canActivate(contextWith(request));

      expect(allowed).toBe(true);
      expect(request.user).toMatchObject({
        userId: 'user-1',
        organizationId: 'org-1',
      });
      expect(apiKeyAuth.validate).not.toHaveBeenCalled();
    });

    it('rejects an invalid/expired token with 401', async () => {
      const request: any = {
        headers: { authorization: 'Bearer not-a-real-token' },
      };

      await expect(guard.canActivate(contextWith(request))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a valid token whose session was revoked', async () => {
      sessionStore.isSessionActive.mockResolvedValue(false);
      const token = jwt.sign(
        { userId: 'user-1', organizationId: 'org-1', roles: [], jti: 's-1' },
        JWT_SECRET,
      );
      const request: any = { headers: { authorization: `Bearer ${token}` } };

      await expect(guard.canActivate(contextWith(request))).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('API key path', () => {
    it('accepts a valid key and sets request.user in the Actor()-compatible shape', async () => {
      apiKeyAuth.validate.mockResolvedValue({
        kind: 'ok',
        actor: {
          apiKeyId: 'key-1',
          organizationId: 'org-1',
          userId: 'shadow-user-1',
          branchIds: ['branch-1', 'branch-2'],
        },
      });
      const request: any = {
        headers: { 'x-api-key': 'raw-secret' },
        ip: '203.0.113.5',
      };

      const allowed = await guard.canActivate(contextWith(request));

      expect(allowed).toBe(true);
      expect(apiKeyAuth.validate).toHaveBeenCalledWith(
        'raw-secret',
        '203.0.113.5',
      );
      expect(request.user).toEqual({
        userId: 'shadow-user-1',
        organizationId: 'org-1',
        branchIds: ['branch-1', 'branch-2'],
        apiKeyId: 'key-1',
      });
    });

    it('rejects an unknown key with 401', async () => {
      apiKeyAuth.validate.mockResolvedValue({ kind: 'not_found' });
      const request: any = {
        headers: { 'x-api-key': 'wrong' },
        ip: '203.0.113.5',
      };

      await expect(guard.canActivate(contextWith(request))).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a valid key from a non-whitelisted IP with 403, not 401', async () => {
      apiKeyAuth.validate.mockResolvedValue({ kind: 'ip_denied' });
      const request: any = {
        headers: { 'x-api-key': 'raw-secret' },
        ip: '10.0.0.1',
      };

      await expect(guard.canActivate(contextWith(request))).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  it('Bearer takes precedence when both Authorization and X-Api-Key are present', async () => {
    const token = jwt.sign(
      { userId: 'user-1', organizationId: 'org-1', roles: [], jti: 's-1' },
      JWT_SECRET,
    );
    const request: any = {
      headers: {
        authorization: `Bearer ${token}`,
        'x-api-key': 'raw-secret',
      },
    };

    await guard.canActivate(contextWith(request));

    expect(apiKeyAuth.validate).not.toHaveBeenCalled();
    expect(request.user.userId).toBe('user-1');
  });
});
