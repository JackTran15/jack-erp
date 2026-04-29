import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

describe('Idempotency (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const headers = (idempotencyKey?: string) => {
    const h: Record<string, string> = {
      Authorization: authHeader(seed.accessToken),
      'X-Branch-Id': seed.branchId,
    };
    if (idempotencyKey) {
      h['X-Idempotency-Key'] = idempotencyKey;
    }
    return h;
  };

  const customerPayload = {
  name: 'Idemp Test',
    phone: '+9999999999',
  };

  // ─── Same key + same payload → replayed response ──────────────────

  describe('Same key + same payload → replayed response', () => {
    const key = uuidv4();

    it('should create on first request', async () => {
      const res = await request(app.getHttpServer())
        .post('/customers')
        .set(headers(key))
        .send(customerPayload)
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.headers['x-idempotency-status']).toBe('CREATED');
    });

    it('should return replayed response on second identical request', async () => {
      const res = await request(app.getHttpServer())
        .post('/customers')
        .set(headers(key))
        .send(customerPayload)
        .expect(201);

      expect(res.body).toHaveProperty('id');
      expect(res.headers['x-idempotency-status']).toBe('REPLAYED');
    });
  });

  // ─── Same key + different payload → 409 conflict ──────────────────

  describe('Same key + different payload → 409 conflict', () => {
    const key = uuidv4();

    it('should create on first request', async () => {
      await request(app.getHttpServer())
        .post('/customers')
        .set(headers(key))
        .send({
          name: 'Conflict First',
          phone: '+8888888888',
        })
        .expect(201);
    });

    it('should return 409 when same key used with different payload', async () => {
      const res = await request(app.getHttpServer())
        .post('/customers')
        .set(headers(key))
        .send({
          name: 'Conflict Different',
          phone: '+7777777777',
        })
        .expect(409);

      expect(res.body.code || res.body.message).toBeDefined();
    });
  });

  // ─── Different key → new request ──────────────────────────────────

  describe('Different key → new request', () => {
    it('should create a new resource with a different idempotency key', async () => {
      const key1 = uuidv4();
      const key2 = uuidv4();

      const res1 = await request(app.getHttpServer())
        .post('/customers')
        .set(headers(key1))
        .send({
          name: 'KeyA Test',
          phone: '+1010101010',
        })
        .expect(201);

      const res2 = await request(app.getHttpServer())
        .post('/customers')
        .set(headers(key2))
        .send({
          name: 'KeyB Test',
          phone: '+2020202020',
        })
        .expect(201);

      expect(res1.body.id).not.toBe(res2.body.id);
    });
  });

  // ─── No key → normal processing (no idempotency tracking) ────────

  describe('No key → normal processing', () => {
    it('should process normally without idempotency header', async () => {
      const res = await request(app.getHttpServer())
        .post('/customers')
        .set(headers())
        .send({
          name: 'NoKey Test',
          phone: '+3030303030',
        })
        .expect(201);

      expect(res.headers['x-idempotency-status']).toBeUndefined();
    });
  });
});
