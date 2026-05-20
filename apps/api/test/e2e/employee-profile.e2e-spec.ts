import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

/**
 * EPIC-20052026 — Employee HR profile persisted through the /admin/users API,
 * plus the job-positions generic CRUD entity used by the profile.
 */
describe('Employee HR profile (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let jobPositionId: string;

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

  const uniq = () => Date.now().toString() + Math.floor(Math.random() * 1000);

  it('creates a job position via the generic CRUD platform', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/entities/job-positions/records')
      .set(headers())
      .send({ name: 'Thu ngân', code: 'TN', isActive: true })
      .expect(201);
    expect(res.body.id).toBeDefined();
    jobPositionId = res.body.id;
  });

  it('creates a user with a full HR profile and returns it inline', async () => {
    const suffix = uniq();
    const res = await request(app.getHttpServer())
      .post('/admin/users')
      .set(headers())
      .send({
        email: `emp.${suffix}@test.com`,
        firstName: 'Nguyen',
        lastName: 'Van A',
        temporaryPassword: 'password123',
        profile: {
          code: `NV${suffix}`,
          mobile: '0900000001',
          homePhone: '02800000001',
          idCardNumber: '012345678',
          idCardIssuePlace: 'CA Can Tho',
          idCardIssueDate: '2018-05-10',
          birthDate: '1995-03-15',
          gender: 'MALE',
          maritalStatus: 'SINGLE',
          employmentStatus: 'PROBATION',
          jobPositionId,
          salary: 12000000,
          deposit: 500000,
          originalDocumentsNote: 'CMND ban goc',
          accessMode: 'SCHEDULED',
          addresses: [
            { type: 'PERMANENT', address: '123 Le Loi', country: 'Việt Nam', province: 'Can Tho', district: 'Ninh Kieu', ward: 'An Hoi' },
            { type: 'CURRENT', address: '456 Tran Hung Dao', country: 'Việt Nam', province: 'Can Tho', district: 'Ninh Kieu', ward: 'Tan An' },
          ],
          emergencyContact: { fullName: 'Nguyen Thi B', relationship: 'Me', mobile: '0900000002', email: 'me@test.com', address: '123 Le Loi' },
          accessSchedule: [
            { weekday: 'MONDAY', enabled: true, startTime: '08:00', endTime: '17:30' },
            { weekday: 'SUNDAY', enabled: false, startTime: '00:00', endTime: '23:59' },
          ],
        },
      })
      .expect(201);

    const p = res.body.profile;
    expect(p).toBeTruthy();
    expect(p.code).toBe(`NV${suffix}`);
    expect(p.gender).toBe('MALE');
    expect(p.employmentStatus).toBe('PROBATION');
    expect(p.salary).toBe(12000000);
    expect(p.deposit).toBe(500000);
    expect(p.accessMode).toBe('SCHEDULED');
    expect(p.jobPosition).toEqual({ id: jobPositionId, name: 'Thu ngân' });
    expect(p.addresses).toHaveLength(2);
    expect(p.addresses.find((a: any) => a.type === 'PERMANENT').ward).toBe('An Hoi');
    expect(p.emergencyContact.fullName).toBe('Nguyen Thi B');
    expect(p.accessSchedule).toHaveLength(2);
    const mon = p.accessSchedule.find((s: any) => s.weekday === 'MONDAY');
    expect(mon.startTime).toBe('08:00');
    expect(mon.endTime).toBe('17:30');
  });

  it('rejects a duplicate employee code in the same organization', async () => {
    const suffix = uniq();
    const dupCode = `DUP${suffix}`;
    await request(app.getHttpServer())
      .post('/admin/users')
      .set(headers())
      .send({
        email: `dup1.${suffix}@test.com`,
        firstName: 'A',
        lastName: 'B',
        temporaryPassword: 'password123',
        profile: { code: dupCode },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/admin/users')
      .set(headers())
      .send({
        email: `dup2.${suffix}@test.com`,
        firstName: 'C',
        lastName: 'D',
        temporaryPassword: 'password123',
        profile: { code: dupCode },
      })
      .expect(409);
  });

  it('updates the profile and replaces child collections', async () => {
    const suffix = uniq();
    const created = await request(app.getHttpServer())
      .post('/admin/users')
      .set(headers())
      .send({
        email: `upd.${suffix}@test.com`,
        firstName: 'Up',
        lastName: 'Date',
        temporaryPassword: 'password123',
        profile: {
          code: `NVU${suffix}`,
          salary: 1000000,
          addresses: [{ type: 'PERMANENT', address: 'Old' }],
          accessSchedule: [{ weekday: 'MONDAY', enabled: true, startTime: '08:00', endTime: '12:00' }],
        },
      })
      .expect(201);
    const userId = created.body.id;

    const updated = await request(app.getHttpServer())
      .patch(`/admin/users/${userId}`)
      .set(headers())
      .send({
        profile: {
          code: `NVU${suffix}`,
          salary: 2500000,
          maritalStatus: 'MARRIED',
          addresses: [{ type: 'CURRENT', address: 'New only' }],
          accessSchedule: [],
        },
      })
      .expect(200);

    const p = updated.body.profile;
    expect(p.salary).toBe(2500000);
    expect(p.maritalStatus).toBe('MARRIED');
    // PERMANENT replaced by a single CURRENT row
    expect(p.addresses).toHaveLength(1);
    expect(p.addresses[0].type).toBe('CURRENT');
    expect(p.addresses[0].address).toBe('New only');
    // schedule cleared
    expect(p.accessSchedule).toHaveLength(0);
  });

  it('honors isActive (login flag) independently of employment status', async () => {
    const suffix = uniq();
    const created = await request(app.getHttpServer())
      .post('/admin/users')
      .set(headers())
      .send({
        email: `act.${suffix}@test.com`,
        firstName: 'Act',
        lastName: 'Ive',
        temporaryPassword: 'password123',
        profile: { code: `NVA${suffix}`, employmentStatus: 'OFFICIAL' },
      })
      .expect(201);
    expect(created.body.isActive).toBe(true);

    const updated = await request(app.getHttpServer())
      .patch(`/admin/users/${created.body.id}`)
      .set(headers())
      .send({ isActive: false, profile: { code: `NVA${suffix}`, employmentStatus: 'RESIGNED' } })
      .expect(200);
    expect(updated.body.isActive).toBe(false);
    expect(updated.body.profile.employmentStatus).toBe('RESIGNED');
  });

  it('rejects a job position from another organization', async () => {
    const suffix = uniq();
    await request(app.getHttpServer())
      .post('/admin/users')
      .set(headers())
      .send({
        email: `badjp.${suffix}@test.com`,
        firstName: 'Bad',
        lastName: 'Jp',
        temporaryPassword: 'password123',
        profile: { code: `NVB${suffix}`, jobPositionId: '00000000-0000-4000-8000-0000000000ff' },
      })
      .expect(400);
  });
});
