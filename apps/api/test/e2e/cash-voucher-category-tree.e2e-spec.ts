import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  SeedResult,
} from './setup/test-app';
import {
  createUserWithPermissions,
  ScopedTestUser,
} from './setup/checkout-saga-fixture';

/**
 * Feature 2026091801 — Danh mục thu chi as a tree.
 *
 * Writes go through the generic CRUD endpoint (T-01-01 rules on a real DB),
 * reads through `POST /v2/cash-voucher-categories/tree` (T-01-02, AC-07).
 * The seeded admin does not hold `accounting.cash_voucher_category.*`, so
 * both actors are scoped users: one with the four category permissions, one
 * with an unrelated permission to prove the 403.
 */
describe('Cash voucher category tree (e2e)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let manager: ScopedTestUser;
  let outsider: ScopedTestUser;

  const RECORDS = '/admin/entities/cash-voucher-categories/records';
  const TREE = '/v2/cash-voucher-categories/tree';

  let groupId: string;
  let childId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    manager = await createUserWithPermissions(app, seed, [
      'accounting.cash_voucher_category.create',
      'accounting.cash_voucher_category.read',
      'accounting.cash_voucher_category.update',
      'accounting.cash_voucher_category.delete',
    ]);
    outsider = await createUserWithPermissions(app, seed, ['inventory.read']);

    const server = app.getHttpServer();
    const group = await request(server)
      .post(RECORDS)
      .set(manager.headers())
      .send({ code: 'CP_VAN_HANH', name: 'Chi phí vận hành', direction: 'OUT', displayOrder: 2 })
      .expect(201);
    groupId = group.body.id;

    const child = await request(server)
      .post(RECORDS)
      .set(manager.headers())
      .send({
        code: 'TIEN_DIEN',
        name: 'Tiền điện',
        direction: 'OUT',
        displayOrder: 1,
        parentGroupId: groupId,
      })
      .expect(201);
    childId = child.body.id;

    await request(server)
      .post(RECORDS)
      .set(manager.headers())
      .send({ code: 'CHI_KHAC', name: 'Chi khác', direction: 'OUT', displayOrder: 1 })
      .expect(201);
    await request(server)
      .post(RECORDS)
      .set(manager.headers())
      .send({ code: 'THU_BAN_HANG', name: 'Thu từ bán hàng', direction: 'IN', displayOrder: 1 })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the org tree nested by parentGroupId, siblings by displayOrder (AC-07)', async () => {
    const res = await request(app.getHttpServer())
      .post(TREE)
      .set(manager.headers())
      .send({})
      .expect(201);

    const codes = res.body.data.map((n: { code: string }) => n.code);
    expect(codes).toEqual(['CHI_KHAC', 'THU_BAN_HANG', 'CP_VAN_HANH']);

    const group = res.body.data.find((n: { id: string }) => n.id === groupId);
    expect(group.children).toHaveLength(1);
    expect(group.children[0]).toMatchObject({
      id: childId,
      code: 'TIEN_DIEN',
      direction: 'OUT',
      isActive: true,
      parentGroupId: groupId,
      children: [],
    });
  });

  it('filters by direction and prunes the tree on search (AC-07)', async () => {
    const out = await request(app.getHttpServer())
      .post(TREE)
      .set(manager.headers())
      .send({ direction: 'OUT' })
      .expect(201);
    expect(out.body.data.map((n: { code: string }) => n.code)).toEqual(['CHI_KHAC', 'CP_VAN_HANH']);

    const search = await request(app.getHttpServer())
      .post(TREE)
      .set(manager.headers())
      .send({ search: 'điện' })
      .expect(201);
    expect(search.body.data.map((n: { code: string }) => n.code)).toEqual(['CP_VAN_HANH']);
    expect(search.body.data[0].children.map((n: { code: string }) => n.code)).toEqual(['TIEN_DIEN']);
  });

  it('rejects a body outside the DTO (AC-07)', async () => {
    await request(app.getHttpServer())
      .post(TREE)
      .set(manager.headers())
      .send({ direction: 'SIDEWAYS' })
      .expect(400);
  });

  it('returns 403 without accounting.cash_voucher_category.read (AC-07)', async () => {
    await request(app.getHttpServer())
      .post(TREE)
      .set(outsider.headers())
      .send({})
      .expect(403);
  });

  it('refuses a child of the other direction and deleting a parent with children (AC-05, AC-06)', async () => {
    const server = app.getHttpServer();

    const mismatch = await request(server)
      .post(RECORDS)
      .set(manager.headers())
      .send({ code: 'THU_SAI', name: 'Thu sai nhóm', direction: 'IN', parentGroupId: groupId })
      .expect(400);
    expect(mismatch.body.message).toBe('Mục cha phải cùng loại Thu/Chi');

    const del = await request(server)
      .delete(`${RECORDS}/${groupId}`)
      .set(manager.headers())
      .expect(400);
    expect(del.body.message).toBe('Không thể xóa mục đang có mục con');

    await request(server).delete(`${RECORDS}/${childId}`).set(manager.headers()).expect(200);
    await request(server).delete(`${RECORDS}/${groupId}`).set(manager.headers()).expect(200);

    const after = await request(server).post(TREE).set(manager.headers()).send({}).expect(201);
    expect(after.body.data.map((n: { code: string }) => n.code)).toEqual(['CHI_KHAC', 'THU_BAN_HANG']);
  });
});
