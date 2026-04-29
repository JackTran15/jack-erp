import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

describe('Customer (E2E)', () => {
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

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });

  // ─── CRUD ─────────────────────────────────────────────────────────

  describe('CRUD operations', () => {
    let customerId: string;

    it('should create a customer', async () => {
      const res = await request(app.getHttpServer())
        .post('/customers')
        .set(headers())
        .send({
          name: 'John Doe',
          email: 'john.doe@example.com',
          phone: '+1234567890',
        })
        .expect(201);

      customerId = res.body.id;
      expect(res.body.name).toBe('John Doe');
    });

    it('should list customers', async () => {
      const res = await request(app.getHttpServer())
        .get('/customers')
        .set(headers())
        .expect(200);

      expect(res.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: customerId }),
        ]),
      );
    });

    it('should get customer by id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/customers/${customerId}`)
        .set(headers())
        .expect(200);

      expect(res.body.id).toBe(customerId);
    });

    it('should update a customer', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/customers/${customerId}`)
        .set(headers())
        .send({ name: 'Jane Doe' })
        .expect(200);

      expect(res.body.name).toBe('Jane Doe');
    });

    it('should delete a customer', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/customers')
        .set(headers())
        .send({
          name: 'Temp User',
          phone: '+0000000000',
        })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/customers/${createRes.body.id}`)
        .set(headers())
        .expect(200);
    });
  });

  // ─── Duplicate detection ──────────────────────────────────────────

  describe('Duplicate detection', () => {
    it('should reject duplicate email within same organization', async () => {
      await request(app.getHttpServer())
        .post('/customers')
        .set(headers())
        .send({
          name: 'Dup Test',
          email: 'unique-dup-test@example.com',
        })
        .expect(201);

      await request(app.getHttpServer())
        .post('/customers')
        .set(headers())
        .send({
          name: 'Another Person',
          email: 'unique-dup-test@example.com',
        })
        .expect(409);
    });
  });

  // ─── Merge flow ───────────────────────────────────────────────────

  describe('Merge flow', () => {
    let sourceId: string;
    let targetId: string;

    beforeAll(async () => {
      const sourceRes = await request(app.getHttpServer())
        .post('/customers')
        .set(headers())
        .send({ name: 'Source Customer', phone: '+1111111111' })
        .expect(201);
      sourceId = sourceRes.body.id;

      const targetRes = await request(app.getHttpServer())
        .post('/customers')
        .set(headers())
        .send({ name: 'Target Customer', phone: '+2222222222' })
        .expect(201);
      targetId = targetRes.body.id;
    });

    it('should merge source into target', async () => {
      const res = await request(app.getHttpServer())
        .post(`/customers/${sourceId}/merge`)
        .set(headers())
        .send({ targetCustomerId: targetId })
        .expect(201);

      expect(res.body.mergedIntoId || res.body.status).toBeDefined();
    });

    it('should make merged customer immutable (update fails)', async () => {
      await request(app.getHttpServer())
        .patch(`/customers/${sourceId}`)
        .set(headers())
        .send({ name: 'Renamed Customer' })
        .expect((res) => {
          expect([400, 403, 409, 422]).toContain(res.status);
        });
    });

    it('should redirect GET on merged customer to target', async () => {
      const res = await request(app.getHttpServer())
        .get(`/customers/${sourceId}`)
        .set(headers())
        .expect(200);

      expect(
        res.body.id === targetId || res.body.mergedIntoId === targetId,
      ).toBe(true);
    });
  });
});
