import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

describe('Product Variants — EPIC-006 (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    await seedProductPermissions();
  });

  afterAll(async () => {
    await app.close();
  });

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });

  async function seedProductPermissions() {
    const roleId = 'd0000000-0000-4000-8000-000000000001';
    const perms = ['product.read', 'product.write'];
    for (const perm of perms) {
      await ds.query(
        `INSERT INTO permissions (id, code, description, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $1, NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [perm],
      );
      await ds.query(
        `INSERT INTO role_permissions (id, role_id, permission_id, created_at, updated_at)
         SELECT gen_random_uuid(), $1, p.id, NOW(), NOW()
         FROM permissions p WHERE p.code = $2
         ON CONFLICT DO NOTHING`,
        [roleId, perm],
      );
    }
  }

  async function createProvider(name: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/inventory/providers')
      .set(headers())
      .send({ name, code: name.toUpperCase().replace(/\s/g, '-') })
      .expect(201);
    return res.body.id;
  }

  async function createStorageAndLocation(
    storageName: string,
    locationName: string,
  ): Promise<{ storageId: string; locationId: string }> {
    const storageRes = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: storageName, branchId: seed.branchId })
      .expect(201);
    const storageId = storageRes.body.id;

    const locationRes = await request(app.getHttpServer())
      .post('/inventory/locations')
      .set(headers())
      .send({ name: locationName, storageId, branchId: seed.branchId })
      .expect(201);

    return { storageId, locationId: locationRes.body.id };
  }

  // ─── TKT-028: Product CRUD ──────────────────────────────────────────

  describe('TKT-028: Product CRUD', () => {
    let productId: string;

    it('POST /products — creates a product', async () => {
      const res = await request(app.getHttpServer())
        .post('/products')
        .set(headers())
        .send({
          name: 'Giày Gelli',
          description: 'Giày da thời trang',
          isActive: true,
        })
        .expect(201);

      productId = res.body.id;
      expect(res.body.name).toBe('Giày Gelli');
      expect(res.body.isActive).toBe(true);
    });

    it('GET /products — lists products with pagination', async () => {
      const res = await request(app.getHttpServer())
        .get('/products')
        .set(headers())
        .query({ page: 1, pageSize: 10 })
        .expect(200);

      expect(res.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Giày Gelli' }),
        ]),
      );
      expect(res.body.total).toBeGreaterThanOrEqual(1);
    });

    it('GET /products — search by name', async () => {
      const res = await request(app.getHttpServer())
        .get('/products')
        .set(headers())
        .query({ search: 'Gelli' })
        .expect(200);

      expect(res.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Giày Gelli' }),
        ]),
      );
    });

    it('GET /products/:id — gets product detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/products/${productId}`)
        .set(headers())
        .expect(200);

      expect(res.body.id).toBe(productId);
      expect(res.body.name).toBe('Giày Gelli');
    });

    it('PATCH /products/:id — updates product', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/products/${productId}`)
        .set(headers())
        .send({ description: 'Giày da cao cấp' })
        .expect(200);

      expect(res.body.description).toBe('Giày da cao cấp');
    });

    it('DELETE /products/:id — soft deletes product', async () => {
      const deleteProduct = await request(app.getHttpServer())
        .post('/products')
        .set(headers())
        .send({ name: 'Sản phẩm xóa', isActive: false })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/products/${deleteProduct.body.id}`)
        .set(headers())
        .expect(200);

      await request(app.getHttpServer())
        .get(`/products/${deleteProduct.body.id}`)
        .set(headers())
        .expect(404);
    });
  });

  // ─── TKT-029: Attribute API ──────────────────────────────────────────

  describe('TKT-029: Attribute API', () => {
    let productId: string;
    let sizeDefId: string;
    let colorDefId: string;
    let sizeOptionIds: string[] = [];
    let colorOptionIds: string[] = [];

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/products')
        .set(headers())
        .send({ name: 'Giày Attr Test', isActive: true })
        .expect(201);
      productId = res.body.id;
    });

    it('POST /products/:id/attributes — creates Size definition', async () => {
      const res = await request(app.getHttpServer())
        .post(`/products/${productId}/attributes`)
        .set(headers())
        .send({ name: 'Size', sortOrder: 0 })
        .expect(201);

      sizeDefId = res.body.id;
      expect(res.body.name).toBe('Size');
      expect(res.body.productId).toBe(productId);
    });

    it('POST /products/:id/attributes — creates Color definition', async () => {
      const res = await request(app.getHttpServer())
        .post(`/products/${productId}/attributes`)
        .set(headers())
        .send({ name: 'Màu', sortOrder: 1 })
        .expect(201);

      colorDefId = res.body.id;
      expect(res.body.name).toBe('Màu');
    });

    it('POST /products/:id/attributes/:defId/options — adds size options (39, 40, 43)', async () => {
      for (const size of ['39', '40', '43']) {
        const res = await request(app.getHttpServer())
          .post(`/products/${productId}/attributes/${sizeDefId}/options`)
          .set(headers())
          .send({ valueLabel: size, codeSuffix: size })
          .expect(201);
        sizeOptionIds.push(res.body.id);
        expect(res.body.valueLabel).toBe(size);
      }
      expect(sizeOptionIds).toHaveLength(3);
    });

    it('POST /products/:id/attributes/:defId/options — adds color options (Nâu, Đen)', async () => {
      for (const color of ['Nâu', 'Đen']) {
        const res = await request(app.getHttpServer())
          .post(`/products/${productId}/attributes/${colorDefId}/options`)
          .set(headers())
          .send({ valueLabel: color })
          .expect(201);
        colorOptionIds.push(res.body.id);
        expect(res.body.valueLabel).toBe(color);
      }
      expect(colorOptionIds).toHaveLength(2);
    });

    it('GET /products/:id/attributes — lists all definitions with nested options', async () => {
      const res = await request(app.getHttpServer())
        .get(`/products/${productId}/attributes`)
        .set(headers())
        .expect(200);

      expect(res.body).toHaveLength(2);
      const sizeDef = res.body.find((d: any) => d.name === 'Size');
      const colorDef = res.body.find((d: any) => d.name === 'Màu');
      expect(sizeDef.options).toHaveLength(3);
      expect(colorDef.options).toHaveLength(2);
    });

    it('POST duplicate definition name — returns 409', async () => {
      await request(app.getHttpServer())
        .post(`/products/${productId}/attributes`)
        .set(headers())
        .send({ name: 'Size' })
        .expect(409);
    });

    it('PATCH /products/:id/attributes/:id — updates definition', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/products/${productId}/attributes/${colorDefId}`)
        .set(headers())
        .send({ name: 'Màu sắc' })
        .expect(200);

      expect(res.body.name).toBe('Màu sắc');

      // Rename back for subsequent tests
      await request(app.getHttpServer())
        .patch(`/products/${productId}/attributes/${colorDefId}`)
        .set(headers())
        .send({ name: 'Màu' })
        .expect(200);
    });

    it('DELETE option — removes it and re-add for subsequent tests', async () => {
      const extraOpt = await request(app.getHttpServer())
        .post(`/products/${productId}/attributes/${colorDefId}/options`)
        .set(headers())
        .send({ valueLabel: 'Trắng' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(
          `/products/${productId}/attributes/${colorDefId}/options/${extraOpt.body.id}`,
        )
        .set(headers())
        .expect(200);

      const defs = await request(app.getHttpServer())
        .get(`/products/${productId}/attributes`)
        .set(headers())
        .expect(200);
      const colorDef = defs.body.find((d: any) => d.name === 'Màu');
      expect(colorDef.options).toHaveLength(2);
    });
  });

  // ─── TKT-030: Variant Generation ────────────────────────────────────

  describe('TKT-030: Variant Generation', () => {
    let productId: string;
    let providerId: string;
    let generatedItemIds: string[] = [];

    beforeAll(async () => {
      providerId = await createProvider('NCC Giày');

      const productRes = await request(app.getHttpServer())
        .post('/products')
        .set(headers())
        .send({
          name: 'Giày Variant',
          isActive: true,
          defaultProviderId: providerId,
        })
        .expect(201);
      productId = productRes.body.id;

      // Create Size(39,40,43)
      const sizeRes = await request(app.getHttpServer())
        .post(`/products/${productId}/attributes`)
        .set(headers())
        .send({ name: 'Size', sortOrder: 0 })
        .expect(201);
      for (const size of ['39', '40', '43']) {
        await request(app.getHttpServer())
          .post(`/products/${productId}/attributes/${sizeRes.body.id}/options`)
          .set(headers())
          .send({ valueLabel: size, codeSuffix: size })
          .expect(201);
      }

      // Create Color(Nâu,Đen)
      const colorRes = await request(app.getHttpServer())
        .post(`/products/${productId}/attributes`)
        .set(headers())
        .send({ name: 'Màu', sortOrder: 1 })
        .expect(201);
      for (const color of ['Nâu', 'Đen']) {
        await request(app.getHttpServer())
          .post(
            `/products/${productId}/attributes/${colorRes.body.id}/options`,
          )
          .set(headers())
          .send({ valueLabel: color })
          .expect(201);
      }
    });

    it('POST /products/:id/generate-variants — generates 6 variants (3×2)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/products/${productId}/generate-variants`)
        .set(headers())
        .send({})
        .expect(201);

      expect(res.body.createdCount).toBe(6);
      expect(res.body.items).toHaveLength(6);
      generatedItemIds = res.body.items.map((i: any) => i.id);
    });

    it('generates correct variant labels', async () => {
      const res = await request(app.getHttpServer())
        .get('/inventory/items')
        .set(headers())
        .query({ filters: JSON.stringify({ productId }) })
        .expect(200);

      const labels = res.body.data.map((i: any) => i.variantLabel);
      expect(labels).toContain('39 · Nâu');
      expect(labels).toContain('39 · Đen');
      expect(labels).toContain('40 · Nâu');
      expect(labels).toContain('40 · Đen');
      expect(labels).toContain('43 · Nâu');
      expect(labels).toContain('43 · Đen');
    });

    it('is idempotent — second call creates 0 new variants', async () => {
      const res = await request(app.getHttpServer())
        .post(`/products/${productId}/generate-variants`)
        .set(headers())
        .send({})
        .expect(201);

      expect(res.body.createdCount).toBe(0);
    });

    it('each generated item has productId set', async () => {
      for (const itemId of generatedItemIds.slice(0, 2)) {
        const res = await request(app.getHttpServer())
          .get(`/inventory/items/${itemId}`)
          .set(headers())
          .expect(200);
        expect(res.body.productId).toBe(productId);
      }
    });
  });

  // ─── TKT-031: Item-Product Link ─────────────────────────────────────

  describe('TKT-031: Item-Product Link', () => {
    let productId: string;
    let providerId: string;
    let legacyItemId: string;

    beforeAll(async () => {
      providerId = await createProvider('NCC Link Test');

      const productRes = await request(app.getHttpServer())
        .post('/products')
        .set(headers())
        .send({
          name: 'Giày Link Test',
          isActive: true,
          defaultProviderId: providerId,
        })
        .expect(201);
      productId = productRes.body.id;

      const sizeRes = await request(app.getHttpServer())
        .post(`/products/${productId}/attributes`)
        .set(headers())
        .send({ name: 'Size', sortOrder: 0 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/products/${productId}/attributes/${sizeRes.body.id}/options`)
        .set(headers())
        .send({ valueLabel: '41', codeSuffix: '41' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/products/${productId}/generate-variants`)
        .set(headers())
        .send({})
        .expect(201);

      const legacyRes = await request(app.getHttpServer())
        .post('/inventory/items')
        .set(headers())
        .send({
          sku: 'LEGACY-ITEM-01',
          name: 'Legacy Widget',
          unit: 'PCS',
          costPrice: 10,
          sellingPrice: 25,
        })
        .expect(201);
      legacyItemId = legacyRes.body.id;
    });

    it('GET /inventory/items?productId=xxx — lists variant items', async () => {
      const res = await request(app.getHttpServer())
        .get('/inventory/items')
        .set(headers())
        .query({ filters: JSON.stringify({ productId }) })
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      for (const item of res.body.data) {
        expect(item.productId).toBe(productId);
      }
    });

    it('GET /inventory/items/:id — returns productId and variantLabel for variant item', async () => {
      const list = await request(app.getHttpServer())
        .get('/inventory/items')
        .set(headers())
        .query({ filters: JSON.stringify({ productId }) })
        .expect(200);

      const variantItem = list.body.data[0];
      const res = await request(app.getHttpServer())
        .get(`/inventory/items/${variantItem.id}`)
        .set(headers())
        .expect(200);

      expect(res.body.productId).toBe(productId);
      expect(res.body.variantLabel).toBeDefined();
    });

    it('legacy item (no productId) — still works', async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/items/${legacyItemId}`)
        .set(headers())
        .expect(200);

      expect(res.body.productId).toBeNull();
    });
  });

  // ─── TKT-032: Storage Location Rules ─────────────────────────────────

  describe('TKT-032: Storage Location Rules', () => {
    let productId: string;
    let providerId: string;
    let variantItemIds: string[] = [];
    let storageAId: string;
    let locationA1Id: string;
    let locationA2Id: string;
    let storageBId: string;
    let locationB1Id: string;

    beforeAll(async () => {
      providerId = await createProvider('NCC Storage Test');

      const productRes = await request(app.getHttpServer())
        .post('/products')
        .set(headers())
        .send({
          name: 'Giày Storage Test',
          isActive: true,
          defaultProviderId: providerId,
        })
        .expect(201);
      productId = productRes.body.id;

      const sizeRes = await request(app.getHttpServer())
        .post(`/products/${productId}/attributes`)
        .set(headers())
        .send({ name: 'Size', sortOrder: 0 })
        .expect(201);
      for (const size of ['38', '39']) {
        await request(app.getHttpServer())
          .post(`/products/${productId}/attributes/${sizeRes.body.id}/options`)
          .set(headers())
          .send({ valueLabel: size, codeSuffix: size })
          .expect(201);
      }

      const genRes = await request(app.getHttpServer())
        .post(`/products/${productId}/generate-variants`)
        .set(headers())
        .send({})
        .expect(201);
      variantItemIds = genRes.body.items.map((i: any) => i.id);

      // Storage A with 2 locations
      const sA = await request(app.getHttpServer())
        .post('/inventory/storages')
        .set(headers())
        .send({ name: 'Storage A', branchId: seed.branchId })
        .expect(201);
      storageAId = sA.body.id;

      const lA1 = await request(app.getHttpServer())
        .post('/inventory/locations')
        .set(headers())
        .send({
          name: 'Loc A1',
          storageId: storageAId,
          branchId: seed.branchId,
        })
        .expect(201);
      locationA1Id = lA1.body.id;

      const lA2 = await request(app.getHttpServer())
        .post('/inventory/locations')
        .set(headers())
        .send({
          name: 'Loc A2',
          storageId: storageAId,
          branchId: seed.branchId,
        })
        .expect(201);
      locationA2Id = lA2.body.id;

      // Storage B with 1 location
      const sB = await request(app.getHttpServer())
        .post('/inventory/storages')
        .set(headers())
        .send({ name: 'Storage B', branchId: seed.branchId })
        .expect(201);
      storageBId = sB.body.id;

      const lB1 = await request(app.getHttpServer())
        .post('/inventory/locations')
        .set(headers())
        .send({
          name: 'Loc B1',
          storageId: storageBId,
          branchId: seed.branchId,
        })
        .expect(201);
      locationB1Id = lB1.body.id;
    });

    it('first assignment to location A1 — auto-assigns via stock adjustment', async () => {
      const adjRes = await request(app.getHttpServer())
        .post('/inventory/stock/adjustments')
        .set(headers())
        .send({
          locationId: locationA1Id,
          branchId: seed.branchId,
          reasonCode: 'INITIAL',
          lines: [
            { itemId: variantItemIds[0], quantity: 10, notes: 'Initial stock' },
          ],
        })
        .expect(201);

      // Progress to posted
      await request(app.getHttpServer())
        .post(`/inventory/stock/adjustments/${adjRes.body.id}/submit`)
        .set(headers())
        .expect(201);
      await request(app.getHttpServer())
        .post(`/inventory/stock/adjustments/${adjRes.body.id}/approve`)
        .set(headers())
        .expect(201);
      await request(app.getHttpServer())
        .post(`/inventory/stock/adjustments/${adjRes.body.id}/post`)
        .set(headers())
        .expect(201);

      const mapping = await ds.query(
        `SELECT * FROM product_storage_locations
         WHERE product_id = $1 AND storage_id = $2`,
        [productId, storageAId],
      );
      expect(mapping.length).toBe(1);
      expect(mapping[0].location_id).toBe(locationA1Id);
    });

    it('same product different variant to same location A1 — OK', async () => {
      const adjRes = await request(app.getHttpServer())
        .post('/inventory/stock/adjustments')
        .set(headers())
        .send({
          locationId: locationA1Id,
          branchId: seed.branchId,
          reasonCode: 'INITIAL',
          lines: [
            {
              itemId: variantItemIds[1],
              quantity: 5,
              notes: 'Second variant same loc',
            },
          ],
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/inventory/stock/adjustments/${adjRes.body.id}/submit`)
        .set(headers())
        .expect(201);
      await request(app.getHttpServer())
        .post(`/inventory/stock/adjustments/${adjRes.body.id}/approve`)
        .set(headers())
        .expect(201);

      const postRes = await request(app.getHttpServer())
        .post(`/inventory/stock/adjustments/${adjRes.body.id}/post`)
        .set(headers());

      expect(postRes.status).toBe(201);
    });

    it('same product to different location A2 in same storage — should fail', async () => {
      const adjRes = await request(app.getHttpServer())
        .post('/inventory/stock/adjustments')
        .set(headers())
        .send({
          locationId: locationA2Id,
          branchId: seed.branchId,
          reasonCode: 'INITIAL',
          lines: [
            {
              itemId: variantItemIds[0],
              quantity: 5,
              notes: 'Different loc same storage',
            },
          ],
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/inventory/stock/adjustments/${adjRes.body.id}/submit`)
        .set(headers())
        .expect(201);
      await request(app.getHttpServer())
        .post(`/inventory/stock/adjustments/${adjRes.body.id}/approve`)
        .set(headers())
        .expect(201);

      const postRes = await request(app.getHttpServer())
        .post(`/inventory/stock/adjustments/${adjRes.body.id}/post`)
        .set(headers());

      expect(postRes.status).toBe(400);
    });

    it('same product to location in different storage B — OK', async () => {
      const adjRes = await request(app.getHttpServer())
        .post('/inventory/stock/adjustments')
        .set(headers())
        .send({
          locationId: locationB1Id,
          branchId: seed.branchId,
          reasonCode: 'INITIAL',
          lines: [
            {
              itemId: variantItemIds[0],
              quantity: 3,
              notes: 'Different storage OK',
            },
          ],
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/inventory/stock/adjustments/${adjRes.body.id}/submit`)
        .set(headers())
        .expect(201);
      await request(app.getHttpServer())
        .post(`/inventory/stock/adjustments/${adjRes.body.id}/approve`)
        .set(headers())
        .expect(201);

      const postRes = await request(app.getHttpServer())
        .post(`/inventory/stock/adjustments/${adjRes.body.id}/post`)
        .set(headers());

      expect(postRes.status).toBe(201);
    });
  });

  // ─── TKT-033: Stock Balance Display ──────────────────────────────────

  describe('TKT-033: Stock Balance Display', () => {
    let productId: string;
    let providerId: string;
    let locationId: string;
    let legacyItemId: string;

    beforeAll(async () => {
      providerId = await createProvider('NCC Balance');

      const productRes = await request(app.getHttpServer())
        .post('/products')
        .set(headers())
        .send({
          name: 'Giày Balance Test',
          isActive: true,
          defaultProviderId: providerId,
        })
        .expect(201);
      productId = productRes.body.id;

      const sizeRes = await request(app.getHttpServer())
        .post(`/products/${productId}/attributes`)
        .set(headers())
        .send({ name: 'Size', sortOrder: 0 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/products/${productId}/attributes/${sizeRes.body.id}/options`)
        .set(headers())
        .send({ valueLabel: '42', codeSuffix: '42' })
        .expect(201);

      const genRes = await request(app.getHttpServer())
        .post(`/products/${productId}/generate-variants`)
        .set(headers())
        .send({})
        .expect(201);
      const variantItemId = genRes.body.items[0].id;

      const setup = await createStorageAndLocation(
        'Balance WH',
        'Balance Loc',
      );
      locationId = setup.locationId;

      // Create stock via adjustment
      const adjRes = await request(app.getHttpServer())
        .post('/inventory/stock/adjustments')
        .set(headers())
        .send({
          locationId,
          branchId: seed.branchId,
          reasonCode: 'INITIAL',
          lines: [{ itemId: variantItemId, quantity: 20, notes: 'Init' }],
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/inventory/stock/adjustments/${adjRes.body.id}/submit`)
        .set(headers())
        .expect(201);
      await request(app.getHttpServer())
        .post(`/inventory/stock/adjustments/${adjRes.body.id}/approve`)
        .set(headers())
        .expect(201);
      await request(app.getHttpServer())
        .post(`/inventory/stock/adjustments/${adjRes.body.id}/post`)
        .set(headers())
        .expect(201);

      // Legacy item with stock
      const legacyRes = await request(app.getHttpServer())
        .post('/inventory/items')
        .set(headers())
        .send({
          sku: 'LEGACY-BAL-01',
          name: 'Legacy Balance Item',
          unit: 'PCS',
          costPrice: 5,
          sellingPrice: 15,
        })
        .expect(201);
      legacyItemId = legacyRes.body.id;

      const legacyAdjRes = await request(app.getHttpServer())
        .post('/inventory/stock/adjustments')
        .set(headers())
        .send({
          locationId,
          branchId: seed.branchId,
          reasonCode: 'INITIAL',
          lines: [{ itemId: legacyItemId, quantity: 10, notes: 'Legacy init' }],
        })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/inventory/stock/adjustments/${legacyAdjRes.body.id}/submit`)
        .set(headers())
        .expect(201);
      await request(app.getHttpServer())
        .post(`/inventory/stock/adjustments/${legacyAdjRes.body.id}/approve`)
        .set(headers())
        .expect(201);
      await request(app.getHttpServer())
        .post(`/inventory/stock/adjustments/${legacyAdjRes.body.id}/post`)
        .set(headers())
        .expect(201);
    });

    it('GET /inventory/stock/balances — returns productName and variantLabel', async () => {
      const res = await request(app.getHttpServer())
        .get('/inventory/stock/balances')
        .set(headers())
        .query({ search: 'Balance Test' })
        .expect(200);

      const found = res.body.data.find(
        (b: any) => b.productName === 'Giày Balance Test',
      );
      expect(found).toBeDefined();
      expect(found.variantLabel).toBeDefined();
      expect(found.productName).toBe('Giày Balance Test');
    });

    it('search by product name works', async () => {
      const res = await request(app.getHttpServer())
        .get('/inventory/stock/balances')
        .set(headers())
        .query({ search: 'Giày Balance' })
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('legacy item — fallback variantLabel', async () => {
      const res = await request(app.getHttpServer())
        .get('/inventory/stock/balances')
        .set(headers())
        .query({ search: 'Legacy Balance' })
        .expect(200);

      const found = res.body.data.find(
        (b: any) => b.itemName === 'Legacy Balance Item',
      );
      expect(found).toBeDefined();
      expect(found.productName).toBe('');
    });
  });

  // ─── TKT-034: POS Validation ─────────────────────────────────────────

  describe('TKT-034: POS Validation', () => {
    let productId: string;
    let providerId: string;
    let variantItemId: string;
    let legacyItemId: string;
    let locationId: string;
    let sessionId: string;
    let cashAccountId: string;
    let revenueAccountId: string;

    beforeAll(async () => {
      providerId = await createProvider('NCC POS Test');

      // Create accounts for POS
      const cashAccRes = await request(app.getHttpServer())
        .post('/accounting/chart-of-accounts')
        .set(headers())
        .send({
          code: 'POS-CASH-' + Date.now(),
          name: 'POS Cash',
          type: 'ASSET',
          isActive: true,
        })
        .expect(201);
      cashAccountId = cashAccRes.body.id;

      const revAccRes = await request(app.getHttpServer())
        .post('/accounting/chart-of-accounts')
        .set(headers())
        .send({
          code: 'POS-REV-' + Date.now(),
          name: 'POS Revenue',
          type: 'REVENUE',
          isActive: true,
        })
        .expect(201);
      revenueAccountId = revAccRes.body.id;

      // Product with variant
      const productRes = await request(app.getHttpServer())
        .post('/products')
        .set(headers())
        .send({
          name: 'Giày POS Test',
          isActive: true,
          defaultProviderId: providerId,
        })
        .expect(201);
      productId = productRes.body.id;

      const sizeRes = await request(app.getHttpServer())
        .post(`/products/${productId}/attributes`)
        .set(headers())
        .send({ name: 'Size', sortOrder: 0 })
        .expect(201);
      await request(app.getHttpServer())
        .post(`/products/${productId}/attributes/${sizeRes.body.id}/options`)
        .set(headers())
        .send({ valueLabel: '40', codeSuffix: '40' })
        .expect(201);

      const genRes = await request(app.getHttpServer())
        .post(`/products/${productId}/generate-variants`)
        .set(headers())
        .send({})
        .expect(201);
      variantItemId = genRes.body.items[0].id;

      // Legacy item
      const legacyRes = await request(app.getHttpServer())
        .post('/inventory/items')
        .set(headers())
        .send({
          sku: 'LEGACY-POS-01',
          name: 'Legacy POS Item',
          unit: 'PCS',
          costPrice: 10,
          sellingPrice: 30,
        })
        .expect(201);
      legacyItemId = legacyRes.body.id;

      // Storage + location
      const setup = await createStorageAndLocation('POS WH', 'POS Loc');
      locationId = setup.locationId;

      // Stock both items
      for (const itemId of [variantItemId, legacyItemId]) {
        const adjRes = await request(app.getHttpServer())
          .post('/inventory/stock/adjustments')
          .set(headers())
          .send({
            locationId,
            branchId: seed.branchId,
            reasonCode: 'INITIAL',
            lines: [{ itemId, quantity: 50, notes: 'POS init' }],
          })
          .expect(201);
        await request(app.getHttpServer())
          .post(`/inventory/stock/adjustments/${adjRes.body.id}/submit`)
          .set(headers())
          .expect(201);
        await request(app.getHttpServer())
          .post(`/inventory/stock/adjustments/${adjRes.body.id}/approve`)
          .set(headers())
          .expect(201);
        await request(app.getHttpServer())
          .post(`/inventory/stock/adjustments/${adjRes.body.id}/post`)
          .set(headers())
          .expect(201);
      }

      // Open POS session
      const sessionRes = await request(app.getHttpServer())
        .post('/pos/sessions/open')
        .set(headers())
        .send({
          branchId: seed.branchId,
          openingCash: 500,
          terminalId: 'T-VARIANT-01',
        })
        .expect(201);
      sessionId = sessionRes.body.id;
    });

    it('checkout with valid variant item — succeeds', async () => {
      const res = await request(app.getHttpServer())
        .post('/pos/sales/checkout')
        .set(headers())
        .send({
          sessionId,
          lines: [
            {
              itemId: variantItemId,
              locationId,
              quantity: 1,
              unitPrice: 30,
              taxAmount: 0,
            },
          ],
          payments: [{ method: 'CASH', amount: 30 }],
          cashAccountId,
          revenueAccountId,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
    });

    it('checkout with item that has productId but no junction — 400', async () => {
      // Directly insert an item with productId but no junction rows
      const orphanId = await ds
        .query(
          `INSERT INTO items (id, organization_id, code, name, unit, is_active, purchase_price, selling_price, provider_id, product_id, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 'pcs', true, 0, 30, $4, $5, NOW(), NOW())
           RETURNING id`,
          [
            seed.organizationId,
            'ORPHAN-' + Date.now(),
            'Orphan variant',
            providerId,
            productId,
          ],
        )
        .then((rows) => rows[0].id);

      // Give it stock
      await ds.query(
        `INSERT INTO stock_balances (id, organization_id, branch_id, item_id, location_id, quantity, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 100, NOW(), NOW())`,
        [seed.organizationId, seed.branchId, orphanId, locationId],
      );

      const res = await request(app.getHttpServer())
        .post('/pos/sales/checkout')
        .set(headers())
        .send({
          sessionId,
          lines: [
            {
              itemId: orphanId,
              locationId,
              quantity: 1,
              unitPrice: 30,
              taxAmount: 0,
            },
          ],
          payments: [{ method: 'CASH', amount: 30 }],
          cashAccountId,
          revenueAccountId,
        });

      expect(res.status).toBe(400);
    });

    it('checkout with legacy item (no productId) — succeeds', async () => {
      const res = await request(app.getHttpServer())
        .post('/pos/sales/checkout')
        .set(headers())
        .send({
          sessionId,
          lines: [
            {
              itemId: legacyItemId,
              locationId,
              quantity: 1,
              unitPrice: 30,
              taxAmount: 0,
            },
          ],
          payments: [{ method: 'CASH', amount: 30 }],
          cashAccountId,
          revenueAccountId,
        })
        .expect(201);

      expect(res.body).toHaveProperty('id');
    });
  });
});
