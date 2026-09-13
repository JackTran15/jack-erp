import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

/**
 * Bề mặt `/mobile/**` là facade cho app mobile. Suite này khoá ba thứ:
 * hình dạng response mà app THẬT SỰ parse, việc whitelist của DTO còn sống,
 * và việc route phẳng của backoffice/POS không bị đụng tới.
 */
describe('Mobile facade (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;

  const credentials = () => ({
    email: 'admin@test.com',
    password: 'password123',
    organizationId: seed.organizationId,
  });

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Login ────────────────────────────────────────────────────────

  describe('POST /mobile/auth/login', () => {
    it('trả đủ bốn trường mà LoginResponseModel đọc', async () => {
      const res = await request(app.getHttpServer())
        .post('/mobile/auth/login')
        .send(credentials())
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(typeof res.body.expiresIn).toBe('number');
      expect(res.body.session).toEqual(
        expect.objectContaining({
          userId: seed.userId,
          organizationId: seed.organizationId,
          roles: expect.any(Array),
          branchIds: expect.any(Array),
          permissions: expect.any(Array),
        }),
      );
    });

    it('từ chối body có key thừa — chứng minh whitelist còn sống', async () => {
      await request(app.getHttpServer())
        .post('/mobile/auth/login')
        .send({ ...credentials(), junk: 1 })
        .expect(400);
    });

    it('từ chối sai mật khẩu bằng 401, KHÔNG phải 400', async () => {
      // 400 sẽ rơi vào nhánh `LoginError.unknown` của app mobile.
      await request(app.getHttpServer())
        .post('/mobile/auth/login')
        .send({ ...credentials(), password: 'wrong-password' })
        .expect(401);
    });
  });

  // ─── Session ──────────────────────────────────────────────────────

  describe('GET /mobile/auth/session', () => {
    it('trả SessionInfo khi có token', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/auth/session')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      expect(res.body).toHaveProperty('userId', seed.userId);
      expect(res.body).toHaveProperty('organizationId', seed.organizationId);
      expect(res.body).toHaveProperty('permissions');
    });

    it('401 khi không có token', async () => {
      await request(app.getHttpServer())
        .get('/mobile/auth/session')
        .expect(401);
    });
  });

  // ─── Me ───────────────────────────────────────────────────────────

  describe('GET /mobile/users/me', () => {
    it('trả ĐÚNG ba trường {id, email, fullName} — không kèm roles/permissions/profile', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/users/me')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      expect(res.body).toEqual({
        id: seed.userId,
        email: 'admin@test.com',
        fullName: 'Admin User',
      });
    });

    it('401 khi không có token', async () => {
      await request(app.getHttpServer()).get('/mobile/users/me').expect(401);
    });
  });

  // ─── Refresh ──────────────────────────────────────────────────────

  describe('POST /mobile/auth/refresh', () => {
    it('xoay cặp token', async () => {
      const login = await request(app.getHttpServer())
        .post('/mobile/auth/login')
        .send(credentials())
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/mobile/auth/refresh')
        .send({ refreshToken: login.body.refreshToken })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.accessToken).not.toBe(login.body.accessToken);
    });
  });

  // ─── Logout ───────────────────────────────────────────────────────

  describe('POST /mobile/auth/logout', () => {
    it('204 rồi thu hồi phiên', async () => {
      const login = await request(app.getHttpServer())
        .post('/mobile/auth/login')
        .send(credentials())
        .expect(200);

      const token = login.body.accessToken;

      await request(app.getHttpServer())
        .post('/mobile/auth/logout')
        .set('Authorization', authHeader(token))
        .expect(204);

      await request(app.getHttpServer())
        .get('/mobile/auth/session')
        .set('Authorization', authHeader(token))
        .expect(401);
    });
  });


  // ─── Nhà cung cấp ─────────────────────────────────────────────────────

  // Id CỐ ĐỊNH thay vì `gen_random_uuid()`: định danh của một nhà cung cấp nay
  // là `id`, nên test phải CẦM được nó mới gọi được `GET`/`PATCH :id`. Viết sẵn
  // ở đây còn để các describe sau dùng lại mà không phải chuyền qua biến chạy.
  const supplierIds = {
    ZZZ: 'e1000000-0000-4000-8000-000000000001',
    AAA: 'e1000000-0000-4000-8000-000000000002',
    MMM: 'e1000000-0000-4000-8000-000000000003',
  } as const;

  // Uuid ĐÚNG DẠNG nhưng chắc chắn không có trong bảng — tách bạch với ca
  // "chuỗi không phải uuid", vì hai ca đó nay trả hai mã lỗi KHÁC nhau.
  const missingSupplierId = 'e1000000-0000-4000-8000-0000000000ff';

  describe('GET /mobile/suppliers', () => {
    const groupId = 'e0000000-0000-4000-8000-000000000001';

    beforeAll(async () => {
      const ds = app.get(DataSource);

      await ds.query(
        `INSERT INTO provider_groups (id, organization_id, code, name, is_active, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, 'NCC-HCM', 'TP. Hồ Chí Minh', true, $3::uuid, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [groupId, seed.organizationId, seed.userId],
      );

      // Ba bản ghi cố ý lệch nhau: một có nhóm + đủ trường phụ, một ngừng theo
      // dõi, một trống trơn — đủ để kiểm cả ba phép nắn shape trong một lượt.
      const rows: [string, string, string, boolean, string | null, string | null, string | null, string | null][] = [
        ['Zeta', 'ZZZ', 'organization', true, groupId, '145 Lý Thường Kiệt', '02838645172', '0301234567'],
        ['Alpha', 'AAA', 'individual', false, null, null, null, null],
        ['Mid', 'MMM', 'organization', true, null, null, null, null],
      ];

      for (const [name, code, type, isActive, gid, address, phone, taxCode] of rows) {
        await ds.query(
          `INSERT INTO inventory_providers
             (id, organization_id, code, name, type, is_active, group_id, address, phone, tax_code,
              is_customer, created_by, created_at, updated_at)
           VALUES ($11::uuid, $1::uuid, $2, $3, $4::inventory_providers_type_enum, $5,
                   $6::uuid, $7, $8, $9, false, $10::uuid, NOW(), NOW())
           ON CONFLICT (organization_id, code) DO NOTHING`,
          [
            seed.organizationId, code, name, type, isActive, gid, address, phone, taxCode, seed.userId,
            supplierIds[code as keyof typeof supplierIds],
          ],
        );
      }
    });

    it('trả ĐÚNG chín trường — có id, không rò email, maxDebt hay thông tin ngân hàng', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/suppliers')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      expect(res.body).toEqual(
        expect.objectContaining({ total: expect.any(Number), page: 1, limit: 20 }),
      );

      const row = res.body.data.find((s: { code: string }) => s.code === 'ZZZ');
      expect(Object.keys(row).sort()).toEqual(
        ['address', 'code', 'groupCode', 'id', 'name', 'phone', 'status', 'taxCode', 'type'],
      );
      // `id` là khoá app dùng để điều hướng — trả thiếu hoặc trả rỗng thì màn
      // danh sách không mở được chi tiết, mà lỗi đó chỉ lộ ra lúc chạm tay.
      expect(row.id).toBe(supplierIds.ZZZ);
    });

    it('nắn isActive -> status và group.code -> groupCode', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/suppliers')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      const withGroup = res.body.data.find((s: { code: string }) => s.code === 'ZZZ');
      expect(withGroup.status).toBe('active');
      expect(withGroup.groupCode).toBe('NCC-HCM');

      const inactive = res.body.data.find((s: { code: string }) => s.code === 'AAA');
      expect(inactive.status).toBe('inactive');
      expect(inactive.type).toBe('individual');
      // Chưa xếp nhóm là `null`, KHÔNG phải chuỗi rỗng.
      expect(inactive.groupCode).toBeNull();
      expect(inactive.address).toBeNull();
    });

    it('sắp theo TÊN mặc định, theo MÃ khi sort=code', async () => {
      const byName = await request(app.getHttpServer())
        .get('/mobile/suppliers')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);
      const names = byName.body.data.map((s: { name: string }) => s.name);
      expect(names).toEqual([...names].sort());

      const byCode = await request(app.getHttpServer())
        .get('/mobile/suppliers?sort=code')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);
      const codes = byCode.body.data.map((s: { code: string }) => s.code);
      expect(codes).toEqual([...codes].sort());
      // Dữ liệu cố ý chọn sao cho hai thứ tự KHÁC nhau — nếu trùng thì phép
      // kiểm trên xanh mà không chứng minh được gì.
      expect(codes).not.toEqual(names);
    });

    it('phân trang: limit=1 chỉ trả 1 dòng, total vẫn là tổng thật', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/suppliers?page=1&limit=1')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBeGreaterThan(1);
      expect(res.body.limit).toBe(1);
    });

    it('trang vượt quá cuối trả mảng rỗng, không 404', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/suppliers?page=999')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      expect(res.body.data).toEqual([]);
    });

    it('status=inactive chỉ ra nhà cung cấp đã ngừng; active loại nó; giá trị lạ -> 400', async () => {
      const inactive = await request(app.getHttpServer())
        .get('/mobile/suppliers?status=inactive')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);
      expect(inactive.body.data.map((s: { code: string }) => s.code)).toEqual(['AAA']);

      const active = await request(app.getHttpServer())
        .get('/mobile/suppliers?status=active')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);
      expect(active.body.data.map((s: { code: string }) => s.code)).not.toContain('AAA');

      await request(app.getHttpServer())
        .get('/mobile/suppliers?status=archived')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(400);
    });

    it('limit vượt trần 100 -> 400', async () => {
      await request(app.getHttpServer())
        .get('/mobile/suppliers?limit=101')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(400);
    });

    it('sort lạ -> 400', async () => {
      await request(app.getHttpServer())
        .get('/mobile/suppliers?sort=createdAt')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(400);
    });

    it('401 khi không có token', async () => {
      await request(app.getHttpServer()).get('/mobile/suppliers').expect(401);
    });
  });

  describe('GET /mobile/suppliers/:id', () => {
    it('trả đúng một nhà cung cấp theo id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/mobile/suppliers/${supplierIds.ZZZ}`)
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      expect(res.body.id).toBe(supplierIds.ZZZ);
      expect(res.body.code).toBe('ZZZ');
      expect(res.body.groupCode).toBe('NCC-HCM');
    });

    it('id đúng dạng uuid nhưng không tồn tại -> 404', async () => {
      await request(app.getHttpServer())
        .get(`/mobile/suppliers/${missingSupplierId}`)
        .set('Authorization', authHeader(seed.accessToken))
        .expect(404);
    });

    it('id KHÔNG phải uuid -> 400, không phải 500', async () => {
      // Không có `ParseUUIDPipe` thì chuỗi này đi thẳng xuống Postgres và ném
      // `22P02` — người dùng nhận 500 cho một đầu vào lẽ ra là 400. Test này
      // đỏ nghĩa là ai đó vừa gỡ pipe.
      await request(app.getHttpServer())
        .get('/mobile/suppliers/KHONG-PHAI-UUID')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(400);
    });
  });

  // ─── Ghi nhà cung cấp ─────────────────────────────────────────────

  describe('POST /mobile/suppliers', () => {
    const post = (body: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post('/mobile/suppliers')
        .set('Authorization', authHeader(seed.accessToken))
        .send(body);

    it('tạo tối thiểu -> 201, trả ĐÚNG chín trường của bản đọc', async () => {
      const res = await post({ code: 'NEW1', name: 'Tân Lập' }).expect(201);

      expect(Object.keys(res.body).sort()).toEqual(
        ['address', 'code', 'groupCode', 'id', 'name', 'phone', 'status', 'taxCode', 'type'],
      );
      // Mặc định của bản ghi mới: đang theo dõi, là pháp nhân, phần còn lại
      // `null` chứ KHÔNG phải chuỗi rỗng.
      expect(res.body).toEqual({
        // App đọc `id` của bản ghi VỪA TẠO để điều hướng sang màn chi tiết —
        // `POST` không trả `id` là luồng tạo mới cụt ngay tại đó.
        id: expect.any(String),
        code: 'NEW1',
        name: 'Tân Lập',
        status: 'active',
        type: 'organization',
        address: null,
        phone: null,
        taxCode: null,
        groupCode: null,
      });
    });

    it('vòng đọc–ghi khớp: GET trả y hệt body vừa nhận', async () => {
      const created = await post({
        code: 'NEW2',
        name: 'Ái Vân',
        status: 'inactive',
        type: 'individual',
        address: '12 Lê Lợi',
        phone: '0901234567',
        taxCode: '0301234567',
      }).expect(201);

      const fetched = await request(app.getHttpServer())
        .get(`/mobile/suppliers/${created.body.id}`)
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      expect(fetched.body).toEqual(created.body);
      // `status: 'inactive'` phải nắn xuống cột `is_active = false` rồi nắn
      // ngược lên khi đọc — đây là chỗ duy nhất chứng minh cả hai chiều.
      expect(fetched.body.status).toBe('inactive');
    });

    it('trùng mã -> 409 với câu TIẾNG VIỆT (app hiện thẳng lên toast)', async () => {
      await post({ code: 'DUP1', name: 'Bản đầu' }).expect(201);

      const res = await post({ code: 'DUP1', name: 'Bản trùng' }).expect(409);

      expect(res.body.message).toMatch(/Mã nhà cung cấp "DUP1" đã tồn tại/);
    });

    it('gửi groupCode -> 400: nhóm cố ý NẰM NGOÀI đợt này', async () => {
      // Test này đỏ nghĩa là có người vừa thêm `groupCode` vào DTO — phải bàn
      // trước, vì phía Dart đang cố ý bỏ trường đó khỏi `toJson`.
      await post({ code: 'GRP1', name: 'Có nhóm', groupCode: 'NCC-HCM' }).expect(400);
    });

    it('gửi id -> 400: định danh nằm ở ĐƯỜNG DẪN, không ở body', async () => {
      // Hàng rào một chiều: `MobileSupplierCreateDto` không khai `id`, nên
      // `forbidNonWhitelisted` chặn. Phía Dart cũng cố ý bỏ `id` khỏi `toJson`
      // — test này đỏ nghĩa là một trong hai vế vừa đổi ý.
      await post({ code: 'WITHID', name: 'Có id', id: '00000000-0000-4000-8000-000000000000' }).expect(400);
    });

    it('gửi trường ngoài hợp đồng mobile -> 400 (whitelist còn sống)', async () => {
      await post({ code: 'EXTRA1', name: 'Thừa', maxDebt: 1000000 }).expect(400);
      await post({ code: 'EXTRA2', name: 'Thừa', email: 'a@b.c' }).expect(400);
    });

    it('thiếu code hoặc name -> 400', async () => {
      await post({ name: 'Không mã' }).expect(400);
      await post({ code: 'NONAME' }).expect(400);
    });

    it('status lạ -> 400', async () => {
      await post({ code: 'BADST', name: 'Sai trạng thái', status: 'archived' }).expect(400);
    });

    it('401 khi không có token', async () => {
      await request(app.getHttpServer())
        .post('/mobile/suppliers')
        .send({ code: 'NOAUTH', name: 'Không token' })
        .expect(401);
    });
  });

  describe('PATCH /mobile/suppliers/:id', () => {
    const patch = (id: string, body: Record<string, unknown>) =>
      request(app.getHttpServer())
        .patch(`/mobile/suppliers/${id}`)
        .set('Authorization', authHeader(seed.accessToken))
        .send(body);

    /** Tạo một bản ghi và trả về `id` của nó — thứ duy nhất PATCH cần. */
    const create = async (body: Record<string, unknown>): Promise<string> => {
      const res = await request(app.getHttpServer())
        .post('/mobile/suppliers')
        .set('Authorization', authHeader(seed.accessToken))
        .send(body)
        .expect(201);

      return res.body.id as string;
    };

    it('đổi mỗi name -> các trường khác GIỮ NGUYÊN', async () => {
      // Ca dễ hỏng nhất: lẫn "vắng khoá" với "null" là lưu tên xong mất sạch
      // địa chỉ/điện thoại.
      const id = await create({
        code: 'PAT1',
        name: 'Trước',
        address: '1 Nguyễn Huệ',
        phone: '0900000001',
        taxCode: '0311111111',
      });

      const res = await patch(id, { name: 'Sau' }).expect(200);

      expect(res.body).toEqual({
        id,
        code: 'PAT1',
        name: 'Sau',
        status: 'active',
        type: 'organization',
        address: '1 Nguyễn Huệ',
        phone: '0900000001',
        taxCode: '0311111111',
        groupCode: null,
      });
    });

    it('null -> XOÁ TRẮNG ô đó, khác hẳn vắng khoá', async () => {
      const id = await create({ code: 'PAT2', name: 'Có sđt', phone: '0900000002' });

      const res = await patch(id, { phone: null }).expect(200);

      expect(res.body.phone).toBeNull();
    });

    it('đổi mã -> CÙNG id vẫn trả 200 và mang mã mới', async () => {
      // Đây là toàn bộ lý do định danh chuyển từ `code` sang `id`. Bản tra theo
      // mã thì sau lượt này mã CŨ trả 404 và client buộc phải tự điều hướng lại
      // sang đường dẫn mang mã mới; nay đường dẫn không hề đổi.
      const id = await create({ code: 'REN1', name: 'Đổi mã' });

      const res = await patch(id, { code: 'REN2' }).expect(200);
      expect(res.body.id).toBe(id);
      expect(res.body.code).toBe('REN2');

      const fetched = await request(app.getHttpServer())
        .get(`/mobile/suppliers/${id}`)
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      expect(fetched.body.code).toBe('REN2');
    });

    it('đổi mã sang mã đã có -> 409, câu lỗi nhắc mã MỚI', async () => {
      await create({ code: 'CLASH1', name: 'Một' });
      const id2 = await create({ code: 'CLASH2', name: 'Hai' });

      const res = await patch(id2, { code: 'CLASH1' }).expect(409);

      expect(res.body.message).toMatch(/Mã nhà cung cấp "CLASH1" đã tồn tại/);
    });

    it('giữ nguyên groupCode của bản ghi khi sửa trường khác', async () => {
      // `relations: ['group']` phải được nạp, không thì response trả `null` và
      // app tưởng nhóm vừa bị xoá.
      const res = await patch(supplierIds.ZZZ, { name: 'Zeta đã sửa' }).expect(200);

      expect(res.body.groupCode).toBe('NCC-HCM');
    });

    it('id đúng dạng uuid nhưng không tồn tại -> 404 tiếng Việt', async () => {
      const res = await patch(missingSupplierId, { name: 'x' }).expect(404);

      // Câu lỗi KHÔNG nội suy uuid: nó là chuỗi máy, người dùng đọc chỉ thấy
      // nhiễu. Mã thì vẫn được nhắc trong 409 vì đó là thứ họ vừa gõ.
      expect(res.body.message).toMatch(/Không tìm thấy nhà cung cấp/);
      expect(res.body.message).not.toContain(missingSupplierId);
    });

    it('id KHÔNG phải uuid -> 400, không phải 500', async () => {
      await patch('KHONG-PHAI-UUID', { name: 'x' }).expect(400);
    });

    it('body rỗng -> 200, bản ghi không đổi', async () => {
      const id = await create({ code: 'NOOP1', name: 'Không đổi' });

      const res = await patch(id, {}).expect(200);

      expect(res.body.name).toBe('Không đổi');
    });

    it('gửi trường lạ -> 400', async () => {
      const id = await create({ code: 'NOOP2', name: 'Trường lạ' });

      await patch(id, { maxDebt: 1 }).expect(400);
    });
  });

  // ─── Hàng hoá ─────────────────────────────────────────────────────

  describe('GET /mobile/products', () => {
    const productId = 'aa000000-0000-4000-8000-000000000001';
    const variantIds = [
      'ab000000-0000-4000-8000-000000000001',
      'ab000000-0000-4000-8000-000000000002',
    ];
    const orphanId = 'ac000000-0000-4000-8000-000000000001';
    const freeId = 'ac000000-0000-4000-8000-000000000002';

    /**
     * Bốn bản ghi cố ý chọn sao cho BA thứ tự (tên / mã / giá) KHÁC hẳn nhau.
     * Trùng nhau thì mọi phép kiểm sắp xếp bên dưới vẫn xanh mà không chứng
     * minh được gì — cùng cái bẫy đã ghi ở khối nhà cung cấp.
     *
     * Mẫu mã `GELLI` có hai biến thể 500k/700k để kiểm phép gộp: nó phải ra
     * MỘT dòng giá 600k, không phải hai dòng.
     *
     * `ZED-FREE` giá 0 và `ALPHA-BAG` giá 0 là ca đụng độ của tie-break: hai
     * dòng bằng giá nhau, nên `sort=sellingPrice` chỉ ổn định nhờ khoá phụ.
     */
    beforeAll(async () => {
      const ds = app.get(DataSource);

      await ds.query(
        `INSERT INTO products (id, organization_id, code, name, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, 'GELLI', 'Giay Gelli', $3::uuid, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [productId, seed.organizationId, seed.userId],
      );

      const rows: [string, string, string, number, string | null][] = [
        [variantIds[0], 'GELLI-39', 'Giay Gelli 39', 500000, productId],
        [variantIds[1], 'GELLI-40', 'Giay Gelli 40', 700000, productId],
        [orphanId, 'ALPHA-BAG', 'Tui Alpha', 0, null],
        [freeId, 'ZED-FREE', 'Hang tang Zed', 0, null],
      ];

      for (const [id, code, name, price, pid] of rows) {
        await ds.query(
          `INSERT INTO items
             (id, organization_id, branch_id, code, name, unit, selling_price, purchase_price,
              is_active, is_pos_visible, product_id, created_by, created_at, updated_at)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'Cai', $6, 1, true, true,
                   $7::uuid, $8::uuid, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [id, seed.organizationId, seed.branchId, code, name, price, pid, seed.userId],
        );
      }
    });

    const list = (query = '') =>
      request(app.getHttpServer())
        .get(`/mobile/products${query}`)
        .set('Authorization', authHeader(seed.accessToken));

    it('trả ĐÚNG bốn trường — không rò giá vốn, barcode hay cờ POS', async () => {
      const res = await list().expect(200);

      expect(res.body).toEqual(
        expect.objectContaining({ total: expect.any(Number), page: 1, limit: 20 }),
      );

      const row = res.body.data.find(
        (p: { code: string }) => p.code === 'ALPHA-BAG',
      );
      expect(Object.keys(row).sort()).toEqual([
        'code',
        'id',
        'name',
        'sellingPrice',
      ]);
      // Giá vốn là biên lợi nhuận của cửa hàng; app không hiển thị nó, nên nó
      // không được có mặt trên dây. Đây là phép kiểm hỏng-trong-im-lặng duy
      // nhất của khối này.
      expect(row).not.toHaveProperty('purchasePrice');
    });

    it('mẫu mã gộp thành MỘT dòng, giá là trung bình các biến thể', async () => {
      const res = await list('?limit=100').expect(200);

      const gelli = res.body.data.filter((p: { code: string }) =>
        p.code.startsWith('GELLI'),
      );

      expect(gelli).toHaveLength(1);
      expect(gelli[0].id).toBe(productId);
      expect(gelli[0].sellingPrice).toBe(600000);
    });

    it('mặc định sắp theo TÊN', async () => {
      const res = await list('?limit=100').expect(200);
      const names = res.body.data.map((p: { name: string }) => p.name);

      // So không phân biệt hoa/thường vì server dùng `lower()` — `.sort()` của
      // JS so theo UTF-16 nên chữ hoa đứng trước chữ thường, khác hẳn.
      expect(names).toEqual(
        [...names].sort((a: string, b: string) =>
          a.toLowerCase() < b.toLowerCase() ? -1 : 1,
        ),
      );
    });

    it('sort=code sắp theo MÃ, và khác thứ tự theo tên', async () => {
      const res = await list('?sort=code&limit=100').expect(200);
      const codes = res.body.data.map((p: { code: string }) => p.code);
      const names = res.body.data.map((p: { name: string }) => p.name);

      expect(codes).toEqual(
        [...codes].sort((a: string, b: string) =>
          a.toLowerCase() < b.toLowerCase() ? -1 : 1,
        ),
      );
      // Dữ liệu seed cố ý cho hai thứ tự KHÁC nhau; trùng thì phép kiểm trên
      // xanh mà không chứng minh được gì.
      expect(codes).not.toEqual(names);
    });

    it('sort=sellingPrice sắp tăng dần', async () => {
      const res = await list('?sort=sellingPrice&limit=100').expect(200);
      const prices = res.body.data.map((p: { sellingPrice: number }) => p.sellingPrice);

      expect(prices).toEqual([...prices].sort((a: number, b: number) => a - b));
    });

    it('phân trang ỔN ĐỊNH: đi từng trang không lặp, không sót', async () => {
      // Đây chính là lý do ORDER BY có tie-break. Hai dòng cùng giá 0 khiến
      // `sort=sellingPrice` không xác định nếu thiếu khoá phụ, và triệu chứng
      // là một mặt hàng xuất hiện hai lần còn một mặt hàng khác biến mất.
      const all = await list('?sort=sellingPrice&limit=100').expect(200);
      const total = all.body.total;

      const seen: string[] = [];
      for (let page = 1; page <= total; page++) {
        const res = await list(`?sort=sellingPrice&limit=1&page=${page}`).expect(200);
        if (res.body.data.length === 0) break;
        seen.push(res.body.data[0].id);
      }

      expect(seen).toHaveLength(total);
      expect(new Set(seen).size).toBe(total);
    });

    it('limit=1 chỉ trả 1 dòng, total vẫn là tổng thật', async () => {
      const res = await list('?limit=1').expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBeGreaterThan(1);
    });

    it('sort lạ -> 400, không phải lặng lẽ về mặc định', async () => {
      await list('?sort=purchasePrice').expect(400);
    });

    it('query param lạ -> 400, chứng minh whitelist còn sống', async () => {
      await list('?includeInactive=true').expect(400);
    });

    it('401 khi không có token', async () => {
      await request(app.getHttpServer()).get('/mobile/products').expect(401);
    });
  });

  // ─── Chứng từ kho ─────────────────────────────────────────────────

  describe('GET /mobile/stock-documents', () => {
    const purchaseId = 'ba000000-0000-4000-8000-000000000001';
    const otherId = 'ba000000-0000-4000-8000-000000000002';
    const draftId = 'ba000000-0000-4000-8000-000000000003';

    /**
     * Ba phiếu cố ý lệch nhau ở đúng những trục mà endpoint này phân biệt:
     * `purpose` (chỉ PURCHASE được trả), `status` (nháp chưa có số phiếu), và
     * ngày nhận (để kiểm lọc kỳ). Nếu ba phiếu giống nhau thì mọi phép kiểm
     * dưới đây vẫn xanh mà không chứng minh được gì.
     */
    beforeAll(async () => {
      const ds = app.get(DataSource);

      const [{ id: locationId }] = await ds.query(
        `SELECT id FROM locations WHERE organization_id = $1::uuid LIMIT 1`,
        [seed.organizationId],
      );

      const rows: [string, string | null, string, string, string][] = [
        [purchaseId, 'NKM-001', 'POSTED', 'PURCHASE', '2026-09-15T03:00:00Z'],
        [otherId, 'NKM-002', 'POSTED', 'OTHER', '2026-09-16T03:00:00Z'],
        [draftId, null, 'DRAFT', 'PURCHASE', '2026-10-02T03:00:00Z'],
      ];

      for (const [id, docNumber, status, purpose, receivedAt] of rows) {
        await ds.query(
          `INSERT INTO goods_receipts
             (id, organization_id, branch_id, document_number, status, purpose,
              received_at, location_id, attachment_ids, references,
              created_by, created_at, updated_at)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4,
                   $5::goods_receipt_status_enum, $6::goods_receipt_purpose_enum,
                   $7::timestamptz, $8::uuid, '[]'::jsonb, '[]'::jsonb,
                   $9::uuid, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [id, seed.organizationId, seed.branchId, docNumber, status, purpose,
           receivedAt, locationId, seed.userId],
        );
      }

      // Một dòng hàng cho phiếu PURCHASE: `amount` và `summary.totalAmount` đều
      // là SUM(quantity * unit_price), nên không có dòng thì cả hai bằng 0 và
      // phép kiểm tiền không nói lên điều gì.
      await ds.query(
        `INSERT INTO goods_receipt_lines
           (id, organization_id, branch_id, goods_receipt_id, item_id, location_id,
            uom_code, quantity, unit_price, line_total, created_by, created_at, updated_at)
         SELECT uuid_generate_v4(), $1::uuid, $2::uuid, $3::uuid, i.id, $4::uuid,
                'Cai', 2, 150000, 300000, $5::uuid, NOW(), NOW()
         FROM items i WHERE i.organization_id = $1::uuid LIMIT 1`,
        [seed.organizationId, seed.branchId, purchaseId, locationId, seed.userId],
      );
    });

    const list = (query = '') =>
      request(app.getHttpServer())
        .get(`/mobile/stock-documents?kind=goods-receipt${query}`)
        .set('Authorization', authHeader(seed.accessToken));

    it('trả ĐÚNG bảy trường — không rò công nợ NCC, dòng hàng hay bút toán', async () => {
      const res = await list().expect(200);

      expect(res.body).toEqual(
        expect.objectContaining({
          total: expect.any(Number),
          page: 1,
          limit: 20,
          summary: expect.objectContaining({ totalAmount: expect.any(Number) }),
        }),
      );

      const row = res.body.data.find(
        (d: { code: string | null }) => d.code === 'NKM-001',
      );
      expect(Object.keys(row).sort()).toEqual([
        'amount', 'code', 'documentDate', 'id', 'partyCode', 'partyName', 'status',
      ]);
      expect(row).not.toHaveProperty('provider');
      expect(row).not.toHaveProperty('lines');
      expect(row.amount).toBe(300000);
      expect(row.status).toBe('posted');
    });

    it('CHỈ trả phiếu mua hàng — phiếu purpose khác không lọt vào', async () => {
      const res = await list().expect(200);
      const codes = res.body.data.map((d: { code: string | null }) => d.code);

      expect(codes).toContain('NKM-001');
      expect(codes).not.toContain('NKM-002');
    });

    it('phiếu nháp chưa ghi sổ thì `code` là NULL, không phải chuỗi rỗng', async () => {
      const res = await list().expect(200);
      const draft = res.body.data.find(
        (d: { status: string }) => d.status === 'draft',
      );

      expect(draft).toBeDefined();
      expect(draft.code).toBeNull();
    });

    it('lọc kỳ theo NGÀY NHẬN, và `to` bao gồm trọn ngày cuối', async () => {
      const inRange = await list('&from=2026-09-01&to=2026-09-30').expect(200);
      const codes = inRange.body.data.map((d: { code: string | null }) => d.code);
      expect(codes).toContain('NKM-001');
      // Phiếu nháp ngày 02/10 nằm ngoài kỳ.
      expect(codes).not.toContain(null);

      const empty = await list('&from=2026-01-01&to=2026-01-31').expect(200);
      expect(empty.body.data).toHaveLength(0);
      expect(empty.body.summary.totalAmount).toBe(0);
    });

    it('summary là tổng TOÀN KỲ, không đổi theo cỡ trang', async () => {
      const full = await list('&limit=100').expect(200);
      const paged = await list('&limit=1').expect(200);

      expect(paged.body.data).toHaveLength(1);
      expect(paged.body.summary.totalAmount).toBe(full.body.summary.totalAmount);
      expect(paged.body.total).toBe(full.body.total);
    });

    it('kind=stock-in trả phiếu nhập KHÁC mua hàng, không lẫn phiếu mua', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/stock-documents?kind=stock-in&limit=100')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      const codes = res.body.data.map((d: { code: string | null }) => d.code);

      // Cùng bảng với nhập hàng, khác nhau đúng ở phép lọc purpose — nên ca này
      // là phép kiểm rằng hai màn KHÔNG trả cùng một tập.
      expect(codes).toContain('NKM-002');
      expect(codes).not.toContain('NKM-001');
    });

    it('nhập hàng và nhập kho chia ĐÔI tập phiếu, không chồng lấn', async () => {
      const purchase = await request(app.getHttpServer())
        .get('/mobile/stock-documents?kind=goods-receipt&limit=100')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);
      const inventory = await request(app.getHttpServer())
        .get('/mobile/stock-documents?kind=stock-in&limit=100')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      const ids = (body: { data: Array<{ id: string }> }) =>
        body.data.map((d) => d.id);
      const overlap = ids(purchase.body).filter((id) =>
        ids(inventory.body).includes(id),
      );

      // `excludePurposes` phải là phần bù đúng của `purposes`; một phiếu lọt cả
      // hai màn nghĩa là ai đó đổi một vế mà quên vế kia.
      expect(overlap).toEqual([]);
    });

    it('kind=stock-out đọc bảng phiếu XUẤT — envelope y hệt, kể cả khi rỗng', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/stock-documents?kind=stock-out')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      // Không seed phiếu xuất nào: điều đáng kiểm ở đây là đường đi tới bảng kia
      // hoạt động và trả đúng hình dạng, chứ không phải số lượng.
      expect(res.body).toEqual(
        expect.objectContaining({
          data: expect.any(Array),
          total: expect.any(Number),
          page: 1,
          limit: 20,
          summary: expect.objectContaining({ totalAmount: expect.any(Number) }),
        }),
      );
    });

    it('kind không được backend phục vụ -> 400', async () => {
      await request(app.getHttpServer())
        .get('/mobile/stock-documents?kind=purchase-return')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(400);
    });

    it('thiếu kind -> 400', async () => {
      await request(app.getHttpServer())
        .get('/mobile/stock-documents')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(400);
    });

    it('query param lạ -> 400, chứng minh whitelist còn sống', async () => {
      await list('&purposes=OTHER').expect(400);
    });

    it('401 khi không có token', async () => {
      await request(app.getHttpServer())
        .get('/mobile/stock-documents?kind=goods-receipt')
        .expect(401);
    });

    describe('GET /mobile/stock-documents/:id', () => {
      const detail = (id: string, kind = 'goods-receipt') =>
        request(app.getHttpServer())
          .get(`/mobile/stock-documents/${id}?kind=${kind}`)
          .set('Authorization', authHeader(seed.accessToken));

      it('trả phần đầu phiếu kèm dòng hàng, đúng 10 + 6 trường', async () => {
        const res = await detail(purchaseId).expect(200);

        expect(Object.keys(res.body).sort()).toEqual([
          'amount',
          'code',
          'deliverer',
          'documentDate',
          'id',
          'lines',
          'note',
          'partyCode',
          'partyName',
          'status',
        ]);
        expect(res.body.code).toBe('NKM-001');
        expect(res.body.lines).toHaveLength(1);
        expect(Object.keys(res.body.lines[0]).sort()).toEqual([
          'lineTotal',
          'name',
          'quantity',
          'sku',
          'unit',
          'unitPrice',
        ]);
      });

      it('số về đúng KIỂU SỐ, không phải chuỗi của Postgres', async () => {
        const res = await detail(purchaseId).expect(200);
        const line = res.body.lines[0];

        // Driver `pg` trả `numeric` thành chuỗi; để lọt thì mọi phép cộng phía
        // app thành nối chuỗi. Đây là ca mà unit test KHÔNG kiểm được — nó mock
        // repository nên không có driver thật nào ở giữa.
        expect(typeof line.quantity).toBe('number');
        expect(typeof line.unitPrice).toBe('number');
        expect(line.quantity).toBe(2);
        expect(line.unitPrice).toBe(150000);
        expect(line.lineTotal).toBe(300000);
        expect(res.body.amount).toBe(300000);
      });

      it('KHÔNG rò công nợ NCC, giá vốn hàng hoá hay bút toán', async () => {
        const res = await detail(purchaseId).expect(200);
        const serialized = JSON.stringify(res.body);

        for (const leak of [
          'maxDebt',
          'bankAccountNumber',
          'idCardNumber',
          'purchasePrice',
          'journalEntryId',
          'locationId',
        ]) {
          expect(serialized).not.toContain(leak);
        }
      });

      it('phiếu nháp trả code null, không phải chuỗi rỗng', async () => {
        const res = await detail(draftId).expect(200);

        expect(res.body.code).toBeNull();
        expect(res.body.status).toBe('draft');
      });

      it('màn Nhập kho không mở được phiếu MUA HÀNG, và ngược lại', async () => {
        // Hai màn dùng chung bảng `goods_receipts`, phân biệt bằng `purpose`.
        await detail(purchaseId, 'stock-in').expect(404);
        await detail(otherId, 'goods-receipt').expect(404);

        // Cặp đúng phải qua được, nếu không hai dòng trên chỉ chứng minh mọi
        // thứ đều bị từ chối.
        await detail(otherId, 'stock-in').expect(200);
      });

      it('id của bảng khác -> 404, không phải 500', async () => {
        await detail(purchaseId, 'stock-out').expect(404);
      });

      it('số phiếu KHÔNG tra được — chỉ uuid', async () => {
        // Ràng buộc thật, không phải thiếu sót: phiếu nháp không có số phiếu.
        await detail('NKM-001').expect(400);
      });

      it('thiếu kind -> 400', async () => {
        await request(app.getHttpServer())
          .get(`/mobile/stock-documents/${purchaseId}`)
          .set('Authorization', authHeader(seed.accessToken))
          .expect(400);
      });

      it('uuid không tồn tại -> 404', async () => {
        await detail('ba000000-0000-4000-8000-0000000000ff').expect(404);
      });

      it('401 khi không có token', async () => {
        await request(app.getHttpServer())
          .get(`/mobile/stock-documents/${purchaseId}?kind=goods-receipt`)
          .expect(401);
      });
    });

    describe('Chọn cửa hàng qua query `branchId`', () => {
      const list = (query: string) =>
        request(app.getHttpServer())
          .get(`/mobile/stock-documents?kind=goods-receipt${query}`)
          .set('Authorization', authHeader(seed.accessToken));

      it('cửa hàng đang đứng cho cùng kết quả với khi không truyền gì', async () => {
        const withParam = await list(`&branchId=${seed.branchId}`).expect(200);
        const without = await list('').expect(200);

        expect(withParam.body.total).toBe(without.body.total);
      });

      it('cửa hàng NGOÀI tầm của người dùng -> 403', async () => {
        // Header `X-Branch-Id` không đủ để đổi cửa hàng (`@Actor` ưu tiên token),
        // nên query này là đường DUY NHẤT — và nó phải được canh bằng quyền.
        await list('&branchId=00000000-0000-4000-8000-0000000000ff').expect(403);
      });

      it('`branchId` không phải uuid -> 400', async () => {
        await list('&branchId=khong-phai-uuid').expect(400);
      });

      it('đường CHI TIẾT cũng nhận `branchId`', async () => {
        await request(app.getHttpServer())
          .get(
            `/mobile/stock-documents/${purchaseId}?kind=goods-receipt&branchId=${seed.branchId}`,
          )
          .set('Authorization', authHeader(seed.accessToken))
          .expect(200);

        await request(app.getHttpServer())
          .get(
            `/mobile/stock-documents/${purchaseId}?kind=goods-receipt&branchId=00000000-0000-4000-8000-0000000000ff`,
          )
          .set('Authorization', authHeader(seed.accessToken))
          .expect(403);
      });
    });
  });

  describe('GET /mobile/branches', () => {
    it('trả cửa hàng của CHÍNH người dùng, đúng bốn trường', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/branches')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(Object.keys(res.body[0]).sort()).toEqual([
        'code',
        'id',
        'isMain',
        'name',
      ]);

      // Chi nhánh đang đứng phải có mặt — nếu không thì app không tô được dòng
      // "đang chọn" nào ở màn bộ lọc.
      expect(res.body.map((b: { id: string }) => b.id)).toContain(seed.branchId);
    });

    it('KHÔNG rò địa chỉ, điện thoại, email của cửa hàng', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/branches')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      const serialized = JSON.stringify(res.body);
      for (const leak of ['address', 'phone', 'email', 'parentBranchId']) {
        expect(serialized).not.toContain(leak);
      }
    });

    it('401 khi không có token', async () => {
      await request(app.getHttpServer()).get('/mobile/branches').expect(401);
    });
  });

  // ─── Khách hàng ───────────────────────────────────────────────────

  // Id CỐ ĐỊNH, cùng lý do với `supplierIds`: app điều hướng bằng `id`, test
  // phải cầm được nó mới gọi `GET :id`.
  const customerIds = {
    AN: 'f1000000-0000-4000-8000-000000000001',
    BINH: 'f1000000-0000-4000-8000-000000000002',
    CHI: 'f1000000-0000-4000-8000-000000000003',
    MERGED: 'f1000000-0000-4000-8000-000000000004',
  } as const;

  const missingCustomerId = 'f1000000-0000-4000-8000-0000000000ff';

  /** Id cố định cho hoá đơn, cùng lý do với `customerIds`. */
  const invoiceIds = {
    PAID: 'f3000000-0000-4000-8000-000000000001',
    DEBT: 'f3000000-0000-4000-8000-000000000002',
    DRAFT: 'f3000000-0000-4000-8000-000000000003',
    RETURN: 'f3000000-0000-4000-8000-000000000004',
    CANCELLED: 'f3000000-0000-4000-8000-000000000005',
  } as const;

  describe('GET /mobile/customers', () => {
    const groupId = 'f2000000-0000-4000-8000-000000000001';

    beforeAll(async () => {
      const ds = app.get(DataSource);

      await ds.query(
        `INSERT INTO customer_groups (id, organization_id, code, name, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2, 'NKH000001', 'Khách sỉ', $3, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [groupId, seed.organizationId, seed.userId],
      );

      // Bốn bản ghi cố ý lệch nhau: một có nhóm + thẻ + đủ trường phụ, một
      // ngừng theo dõi, một trống trơn, và một ĐÃ GỘP — cái cuối không bao giờ
      // được xuất hiện ở bất kỳ đường nào.
      const rows: [string, string, string, string, string | null, string | null, string | null, string | null][] = [
        [customerIds.AN, 'KH000001', 'Nguyễn Văn An', 'ACTIVE', groupId, '0901000001', 'an@example.com', '1990-05-20'],
        [customerIds.BINH, 'KH000002', 'Trần Thị Bình', 'INACTIVE', null, '0901000002', null, null],
        [customerIds.CHI, 'KH000003', 'Lê Quang Chi', 'ACTIVE', null, null, null, null],
        [customerIds.MERGED, 'KH000004', 'Khách Đã Gộp', 'MERGED', null, '0901000004', null, null],
      ];

      for (const [id, code, name, status, gid, phone, email, birthDate] of rows) {
        await ds.query(
          `INSERT INTO customers
             (id, organization_id, code, name, status, group_id, phone, email, birth_date,
              gender, national_id, tax_code, created_by, created_at, updated_at)
           VALUES ($1::uuid, $2, $3, $4, $5::customers_status_enum, $6::uuid, $7, $8, $9::date,
                   'male', '012345678901', '0301234567', $10, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [id, seed.organizationId, code, name, status, gid, phone, email, birthDate, seed.userId],
        );
      }

      await ds.query(
        `INSERT INTO membership_card_types (id, organization_id, name, tier, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, 'Thẻ Vàng', 'gold'::membership_tier_enum, $2, NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [seed.organizationId, seed.userId],
      );

      await ds.query(
        `INSERT INTO membership_cards (id, organization_id, customer_id, card_number, tier, issued_at, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2::uuid, 'MC-0001', 'gold'::membership_tier_enum, CURRENT_DATE, $3, NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [seed.organizationId, customerIds.AN, seed.userId],
      );

      // Hoá đơn: hai đã chốt cho An (paid + debt), một NHÁP cho An, một trả hàng
      // cho Bình. Chỉ hai cái đầu được tính vào doanh thu — đúng định nghĩa của
      // `CustomerSummaryService`.
      // `issued_at` lùi dần theo số thứ tự để thứ tự sắp xếp có chỗ mà sai.
      // Hoá đơn trả hàng mang `net_amount` ÂM — tổng có dấu của app đọc cột đó.
      const invoices: [string, string, string, string, string, number, number, boolean][] = [
        [invoiceIds.PAID, 'HD-0001', customerIds.AN, 'SALE', 'paid', 500000, 0, false],
        [invoiceIds.DEBT, 'HD-0002', customerIds.AN, 'SALE', 'debt', 350000, 0, false],
        [invoiceIds.DRAFT, 'HD-0003', customerIds.AN, 'SALE', 'draft', 999999, 0, true],
        [invoiceIds.RETURN, 'HD-0004', customerIds.BINH, 'RETURN', 'paid', 120000, -120000, false],
        [invoiceIds.CANCELLED, 'HD-0005', customerIds.AN, 'SALE', 'cancelled', 70000, 0, false],
      ];

      for (const [index, [id, code, customerId, type, status, amountDue, netAmount, isDraft]] of invoices.entries()) {
        await ds.query(
          `INSERT INTO invoices
             (id, organization_id, branch_id, code, session_id, staff_id, customer_id,
              type, status, amount_due, net_amount, subtotal, is_draft, issued_at,
              points_balance_after, points_earned, created_by, created_at, updated_at)
           VALUES ($11::uuid, $1, $2, $3, 'e2e-session', $4::uuid, $5::uuid,
                   $6::invoice_type_enum, $7::invoice_status_enum, $8, $9, $8, $10,
                   NOW() - ($12 || ' days')::interval, 150, 50, $4,
                   NOW() - ($12 || ' days')::interval, NOW())
           ON CONFLICT DO NOTHING`,
          [seed.organizationId, seed.branchId, code, seed.userId, customerId, type, status,
           amountDue, netAmount, isDraft, id, String(index)],
        );
      }

      // Một dòng hàng + một dòng thanh toán cho hoá đơn đã thu — đủ để kiểm
      // phép gom ở màn chi tiết.
      await ds.query(
        `INSERT INTO invoice_items
           (id, organization_id, branch_id, invoice_id, item_id, item_code, item_name, unit,
            quantity, unit_price, line_total, direction, sort_order, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3::uuid, gen_random_uuid(), 'A-41', 'Giày A', 'Đôi',
                 1, 500000, 500000, 'OUT', 0, $4, NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [seed.organizationId, seed.branchId, invoiceIds.PAID, seed.userId],
      );
      await ds.query(
        `INSERT INTO invoice_payments
           (id, organization_id, branch_id, invoice_id, payment_method, amount, account_id,
            created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3::uuid, 'cash', 520000, gen_random_uuid(),
                 $4, NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [seed.organizationId, seed.branchId, invoiceIds.PAID, seed.userId],
      );
    });

    const byCode = (res: request.Response, code: string) =>
      res.body.data.find((c: { code: string }) => c.code === code);

    it('trả ĐÚNG mười bốn trường — không rò CCCD, mã số thuế hay id nhóm', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/customers')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      expect(res.body).toEqual(
        expect.objectContaining({
          total: expect.any(Number),
          page: 1,
          limit: 20,
          totalRevenue: expect.any(Number),
        }),
      );

      const row = byCode(res, 'KH000001');
      expect(Object.keys(row).sort()).toEqual([
        'address', 'birthDate', 'cardTier', 'code', 'email', 'gender', 'groupName', 'id',
        'invoiceCount', 'name', 'note', 'phone', 'revenue', 'status',
      ]);
      expect(row.id).toBe(customerIds.AN);
    });

    it('nắn status về viết thường, join sẵn nhóm + hạng thẻ, ngày sinh không giờ', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/customers')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      const an = byCode(res, 'KH000001');
      expect(an.status).toBe('active');
      expect(an.groupName).toBe('Khách sỉ');
      // TÊN do tổ chức đặt, không phải mã `gold`.
      expect(an.cardTier).toBe('Thẻ Vàng');
      // Chuỗi ngày trần, KHÔNG phải ISO có giờ: cột `date` đi qua `Date` của
      // driver sẽ lệch một ngày tuỳ múi giờ máy chủ.
      expect(an.birthDate).toBe('1990-05-20');

      const binh = byCode(res, 'KH000002');
      expect(binh.status).toBe('inactive');
      expect(binh.groupName).toBeNull();
      expect(binh.cardTier).toBeNull();
      expect(binh.email).toBeNull();
      expect(binh.birthDate).toBeNull();
    });

    it('doanh thu = tổng hoá đơn BÁN đã chốt; nháp và trả hàng KHÔNG tính', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/customers')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      const an = byCode(res, 'KH000001');
      expect(an.revenue).toBe(850000);
      expect(an.invoiceCount).toBe(2);

      // Bình chỉ có một hoá đơn TRẢ HÀNG -> 0, nhưng vẫn là một dòng (LEFT JOIN).
      const binh = byCode(res, 'KH000002');
      expect(binh.revenue).toBe(0);
      expect(binh.invoiceCount).toBe(0);

      // Tổng của toàn tập, không phải của một trang.
      expect(res.body.totalRevenue).toBe(850000);
    });

    it('khách ĐÃ GỘP không xuất hiện, kể cả khi không lọc trạng thái', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/customers')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      expect(byCode(res, 'KH000004')).toBeUndefined();
      expect(res.body.total).toBe(3);
    });

    it('status=inactive chỉ trả khách ngừng theo dõi', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/customers?status=inactive')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      expect(res.body.data.map((c: { code: string }) => c.code)).toEqual(['KH000002']);
    });

    it('sắp theo TÊN mặc định; sort=revenue&order=desc đưa khách mua nhiều lên đầu', async () => {
      const byName = await request(app.getHttpServer())
        .get('/mobile/customers')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);
      const names = byName.body.data.map((c: { name: string }) => c.name);
      expect(names).toEqual([...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));

      const byRevenue = await request(app.getHttpServer())
        .get('/mobile/customers?sort=revenue&order=desc')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);
      expect(byRevenue.body.data[0].code).toBe('KH000001');
      // Hai khách cùng doanh thu 0 xếp theo tên — tie-break có nghĩa cho người
      // đọc, không phải theo id.
      expect(byRevenue.body.data.slice(1).map((c: { code: string }) => c.code)).toEqual(['KH000003', 'KH000002']);
    });

    it('tìm theo mã, tên HOẶC số điện thoại', async () => {
      for (const [term, expected] of [
        ['KH00000', ['KH000001', 'KH000002', 'KH000003']],
        ['Bình', ['KH000002']],
        ['0901000001', ['KH000001']],
      ] as const) {
        const res = await request(app.getHttpServer())
          .get('/mobile/customers')
          .query({ search: term })
          .set('Authorization', authHeader(seed.accessToken))
          .expect(200);

        expect(res.body.data.map((c: { code: string }) => c.code).sort()).toEqual([...expected]);
      }
    });

    it('phân trang: limit=1 chỉ trả 1 dòng, total và totalRevenue vẫn là của toàn tập', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/customers?page=2&limit=1&sort=revenue&order=desc')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.total).toBe(3);
      expect(res.body.totalRevenue).toBe(850000);
    });

    it('trang vượt quá cuối trả mảng rỗng, total vẫn đúng', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/customers?page=999')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      expect(res.body.data).toEqual([]);
      expect(res.body.total).toBe(3);
    });

    it('sort / order / status lạ -> 400', async () => {
      for (const q of ['sort=createdAt', 'order=random', 'status=merged']) {
        await request(app.getHttpServer())
          .get(`/mobile/customers?${q}`)
          .set('Authorization', authHeader(seed.accessToken))
          .expect(400);
      }
    });

    it('query param lạ -> 400, chứng minh whitelist còn sống', async () => {
      await request(app.getHttpServer())
        .get('/mobile/customers?branchId=x')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(400);
    });

    it('KHÔNG đòi X-Branch-Id, khác /customers của web', async () => {
      // Đường web 403 khi thiếu header; đường mobile phải 200 với cùng token.
      await request(app.getHttpServer())
        .get('/customers')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(403);
      await request(app.getHttpServer())
        .get('/mobile/customers')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);
    });

    it('401 khi không có token', async () => {
      await request(app.getHttpServer()).get('/mobile/customers').expect(401);
    });
  });

  describe('GET /mobile/customers/:id', () => {
    it('trả đúng một khách hàng theo id, cùng hình dạng với dòng danh sách', async () => {
      const res = await request(app.getHttpServer())
        .get(`/mobile/customers/${customerIds.AN}`)
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      expect(res.body.id).toBe(customerIds.AN);
      expect(res.body.code).toBe('KH000001');
      expect(res.body.revenue).toBe(850000);
      expect(res.body.cardTier).toBe('Thẻ Vàng');
      expect(res.body).not.toHaveProperty('nationalId');
    });

    it('khách đã gộp -> 404 dù id có thật', async () => {
      await request(app.getHttpServer())
        .get(`/mobile/customers/${customerIds.MERGED}`)
        .set('Authorization', authHeader(seed.accessToken))
        .expect(404);
    });

    it('id đúng dạng uuid nhưng không tồn tại -> 404 tiếng Việt', async () => {
      const res = await request(app.getHttpServer())
        .get(`/mobile/customers/${missingCustomerId}`)
        .set('Authorization', authHeader(seed.accessToken))
        .expect(404);

      expect(res.body.message).toBe('Không tìm thấy khách hàng.');
    });

    it('id KHÔNG phải uuid -> 400, không phải 500', async () => {
      await request(app.getHttpServer())
        .get('/mobile/customers/KHONG-PHAI-UUID')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(400);
    });
  });

  // ─── Ghi khách hàng ───────────────────────────────────────────────

  describe('POST /mobile/customers', () => {
    it('tạo tối thiểu (chỉ tên) -> 201, mã do hệ thống cấp, envelope y hệt bản đọc', async () => {
      const res = await request(app.getHttpServer())
        .post('/mobile/customers')
        .set('Authorization', authHeader(seed.accessToken))
        .send({ name: '  Khách Mới  ', email: '', phone: '0909000001' })
        .expect(201);

      expect(res.body.name).toBe('Khách Mới');
      expect(res.body.code).toMatch(/\S/);
      expect(res.body.status).toBe('active');
      // Chuỗi rỗng KHÔNG thành `''` trong DB — nó là "chưa nhập".
      expect(res.body.email).toBeNull();
      expect(Object.keys(res.body).sort()).toEqual([
        'address', 'birthDate', 'cardTier', 'code', 'email', 'gender', 'groupName', 'id',
        'invoiceCount', 'name', 'note', 'phone', 'revenue', 'status',
      ]);

      // Vòng đọc–ghi khớp.
      const read = await request(app.getHttpServer())
        .get(`/mobile/customers/${res.body.id}`)
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);
      expect(read.body).toEqual(res.body);
    });

    it('status=inactive và mã tự chọn được ghi nhận', async () => {
      const res = await request(app.getHttpServer())
        .post('/mobile/customers')
        .set('Authorization', authHeader(seed.accessToken))
        .send({ name: 'Khách Ngừng', code: 'KHE2E01', status: 'inactive', birthDate: '1990-05-20' })
        .expect(201);

      expect(res.body.code).toBe('KHE2E01');
      expect(res.body.status).toBe('inactive');
      expect(res.body.birthDate).toBe('1990-05-20');
    });

    it('trùng mã / SĐT -> 409 tiếng Việt, không phải 500 hay câu tiếng Anh', async () => {
      const byCode = await request(app.getHttpServer())
        .post('/mobile/customers')
        .set('Authorization', authHeader(seed.accessToken))
        .send({ name: 'X', code: 'KHE2E01' })
        .expect(409);
      expect(byCode.body.message).toBe('Mã khách hàng "KHE2E01" đã tồn tại.');

      const byPhone = await request(app.getHttpServer())
        .post('/mobile/customers')
        .set('Authorization', authHeader(seed.accessToken))
        .send({ name: 'X', phone: '0901000001' })
        .expect(409);
      expect(byPhone.body.message).toBe(
        'Số điện thoại "0901000001" đã được dùng cho khách hàng khác.',
      );
    });

    it('thiếu tên, email sai, trường lạ -> 400', async () => {
      for (const body of [
        { phone: '0909' },
        { name: 'X', email: 'khong-phai-email' },
        { name: 'X', groupId: 'f2000000-0000-4000-8000-000000000001' },
      ]) {
        await request(app.getHttpServer())
          .post('/mobile/customers')
          .set('Authorization', authHeader(seed.accessToken))
          .send(body)
          .expect(400);
      }
    });

    it('401 khi không có token', async () => {
      await request(app.getHttpServer()).post('/mobile/customers').send({ name: 'X' }).expect(401);
    });
  });

  describe('PATCH /mobile/customers/:id', () => {
    it('đổi mỗi tên -> các trường khác GIỮ NGUYÊN', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/mobile/customers/${customerIds.AN}`)
        .set('Authorization', authHeader(seed.accessToken))
        .send({ name: 'Nguyễn Văn An (sửa)' })
        .expect(200);

      expect(res.body.name).toBe('Nguyễn Văn An (sửa)');
      expect(res.body.phone).toBe('0901000001');
      expect(res.body.groupName).toBe('Khách sỉ');
      expect(res.body.cardTier).toBe('Thẻ Vàng');
    });

    it('null -> XOÁ TRẮNG ô đó; code rỗng -> GIỮ mã cũ', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/mobile/customers/${customerIds.CHI}`)
        .set('Authorization', authHeader(seed.accessToken))
        .send({ email: null, note: '', code: '', status: 'inactive' })
        .expect(200);

      expect(res.body.email).toBeNull();
      expect(res.body.note).toBeNull();
      expect(res.body.code).toBe('KH000003');
      expect(res.body.status).toBe('inactive');
    });

    it('SĐT của khách KHÁC -> 409 tiếng Việt', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/mobile/customers/${customerIds.CHI}`)
        .set('Authorization', authHeader(seed.accessToken))
        .send({ phone: '0901000001' })
        .expect(409);

      expect(res.body.message).toBe(
        'Số điện thoại "0901000001" đã được dùng cho khách hàng khác.',
      );
    });

    it('khách đã gộp / id không có -> 404 tiếng Việt', async () => {
      for (const id of [customerIds.MERGED, missingCustomerId]) {
        const res = await request(app.getHttpServer())
          .patch(`/mobile/customers/${id}`)
          .set('Authorization', authHeader(seed.accessToken))
          .send({ name: 'X' })
          .expect(404);
        expect(res.body.message).toBe('Không tìm thấy khách hàng.');
      }
    });

    it('body rỗng -> 200, bản ghi không đổi', async () => {
      const before = await request(app.getHttpServer())
        .get(`/mobile/customers/${customerIds.AN}`)
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);
      const after = await request(app.getHttpServer())
        .patch(`/mobile/customers/${customerIds.AN}`)
        .set('Authorization', authHeader(seed.accessToken))
        .send({})
        .expect(200);

      expect(after.body).toEqual(before.body);
    });
  });

  describe('DELETE /mobile/customers/:id', () => {
    it('khách không vướng gì -> 204, xoá CỨNG, thẻ thành viên xoá theo', async () => {
      const created = await request(app.getHttpServer())
        .post('/mobile/customers')
        .set('Authorization', authHeader(seed.accessToken))
        .send({ name: 'Khách Sẽ Xoá' })
        .expect(201);

      await request(app.getHttpServer())
        .delete(`/mobile/customers/${created.body.id}`)
        .set('Authorization', authHeader(seed.accessToken))
        .expect(204);

      await request(app.getHttpServer())
        .get(`/mobile/customers/${created.body.id}`)
        .set('Authorization', authHeader(seed.accessToken))
        .expect(404);

      const ds = app.get(DataSource);
      const cards = await ds.query(
        `SELECT COUNT(*)::int AS n FROM membership_cards WHERE customer_id = $1::uuid`,
        [created.body.id],
      );
      expect(cards[0].n).toBe(0);
    });

    it('khách còn công nợ -> 409 tiếng Việt, bản ghi còn nguyên', async () => {
      const ds = app.get(DataSource);
      await ds.query(
        `INSERT INTO invoice_debts
           (id, organization_id, branch_id, invoice_id, customer_id, reference_code, document_type,
            original_amount, paid_amount, remaining_amount, issued_at, status, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3::uuid, $4::uuid, 'HD-0002', 'credit_invoice',
                 350000, 0, 350000, CURRENT_DATE, 'open', $5, NOW(), NOW())
         ON CONFLICT DO NOTHING`,
        [seed.organizationId, seed.branchId, invoiceIds.DEBT, customerIds.AN, seed.userId],
      );

      const res = await request(app.getHttpServer())
        .delete(`/mobile/customers/${customerIds.AN}`)
        .set('Authorization', authHeader(seed.accessToken))
        .expect(409);
      expect(res.body.message).toBe(
        'Khách hàng đang có công nợ, tín dụng hoặc bản ghi liên quan, không thể xoá.',
      );

      await request(app.getHttpServer())
        .get(`/mobile/customers/${customerIds.AN}`)
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);
    });

    it('id không có / đã gộp -> 404; không uuid -> 400; 401 khi không có token', async () => {
      for (const id of [missingCustomerId, customerIds.MERGED]) {
        await request(app.getHttpServer())
          .delete(`/mobile/customers/${id}`)
          .set('Authorization', authHeader(seed.accessToken))
          .expect(404);
      }
      await request(app.getHttpServer())
        .delete('/mobile/customers/KHONG-PHAI-UUID')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(400);
      await request(app.getHttpServer()).delete(`/mobile/customers/${customerIds.AN}`).expect(401);
    });
  });

  // ─── Hoá đơn ──────────────────────────────────────────────────────

  describe('GET /mobile/invoices', () => {
    const codesOf = (res: request.Response) => res.body.data.map((i: { code: string }) => i.code);

    it('trả ĐÚNG chín trường, KHÔNG có nháp, envelope có totalAmount', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/invoices')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      expect(res.body).toEqual(
        expect.objectContaining({ total: 4, page: 1, limit: 20, totalAmount: expect.any(Number) }),
      );
      expect(codesOf(res)).not.toContain('HD-0003');
      expect(Object.keys(res.body.data[0]).sort()).toEqual([
        'amount', 'code', 'createdAt', 'customerName', 'customerPhone', 'id', 'issuedAt', 'status', 'type',
      ]);
    });

    it('trạng thái/loại về chữ thường của app; trả hàng mang số tiền ÂM', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/invoices')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      const byCode = (code: string) => res.body.data.find((i: { code: string }) => i.code === code);
      expect(byCode('HD-0002').status).toBe('unpaid');
      expect(byCode('HD-0004')).toEqual(expect.objectContaining({ type: 'return', amount: -120000 }));
      expect(byCode('HD-0005').status).toBe('cancelled');
      expect(byCode('HD-0001').customerName).toMatch(/Nguyễn Văn An/);
    });

    it('totalAmount LOẠI hoá đơn huỷ nhưng data vẫn có nó', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/invoices')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      // 500000 + 350000 − 120000; HD-0005 (70000, huỷ) không cộng.
      expect(res.body.totalAmount).toBe(730000);
      expect(codesOf(res)).toContain('HD-0005');
    });

    it('lọc theo NHIỀU trạng thái; unpaid gom debt + partial_debt', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/invoices')
        .query({ status: ['unpaid', 'cancelled'] })
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      expect(codesOf(res).sort()).toEqual(['HD-0002', 'HD-0005']);
    });

    it('mặc định MỚI NHẤT lên đầu; order=asc đảo lại', async () => {
      const desc = await request(app.getHttpServer())
        .get('/mobile/invoices')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);
      const asc = await request(app.getHttpServer())
        .get('/mobile/invoices?order=asc')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      expect(codesOf(desc)[0]).toBe('HD-0001');
      expect(codesOf(asc)).toEqual([...codesOf(desc)].reverse());
    });

    it('khoảng ngày bao TRỌN ngày cuối, theo dateBasis', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const res = await request(app.getHttpServer())
        .get('/mobile/invoices')
        .query({ from: today, to: today, dateBasis: 'issued' })
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      // Chỉ HD-0001 lập hôm nay (`NOW() - 0 days`); `to = hôm nay` mà so `<=`
      // 00:00 sẽ cắt mất nó.
      expect(codesOf(res)).toEqual(['HD-0001']);
    });

    it('lọc theo cửa hàng và tìm theo số hoá đơn', async () => {
      const byBranch = await request(app.getHttpServer())
        .get('/mobile/invoices')
        .query({ branchIds: [seed.branchId] })
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);
      expect(byBranch.body.total).toBe(4);

      // Chi nhánh ngoài phân công → 403, kể cả với quản trị viên: mobile
      // không có vế hợp nhất (`resolveReportBranchScope`).
      await request(app.getHttpServer())
        .get('/mobile/invoices')
        .query({ branchIds: ['20000000-0000-4000-8000-0000000000ff'] })
        .set('Authorization', authHeader(seed.accessToken))
        .expect(403);

      const bySearch = await request(app.getHttpServer())
        .get('/mobile/invoices?search=0004')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);
      expect(codesOf(bySearch)).toEqual(['HD-0004']);
    });

    it('status lạ / param lạ -> 400; 401 khi không có token', async () => {
      await request(app.getHttpServer())
        .get('/mobile/invoices?status=draft')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(400);
      await request(app.getHttpServer())
        .get('/mobile/invoices?customerId=x')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(400);
      await request(app.getHttpServer()).get('/mobile/invoices').expect(401);
    });
  });

  describe('GET /mobile/customers/:id/invoices', () => {
    it('chỉ hoá đơn của khách đó, tổng của khách đó', async () => {
      const res = await request(app.getHttpServer())
        .get(`/mobile/customers/${customerIds.AN}/invoices`)
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      expect(res.body.data.map((i: { code: string }) => i.code).sort()).toEqual([
        'HD-0001', 'HD-0002', 'HD-0005',
      ]);
      expect(res.body.totalAmount).toBe(850000);
    });

    it('khách không có hoá đơn -> rỗng, không 404', async () => {
      const res = await request(app.getHttpServer())
        .get(`/mobile/customers/${missingCustomerId}/invoices`)
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      expect(res.body.data).toEqual([]);
      expect(res.body.total).toBe(0);
    });
  });

  describe('GET /mobile/invoices/:id', () => {
    it('gom dòng hàng, thanh toán, tiền thừa, điểm — đúng hình dạng app', async () => {
      const res = await request(app.getHttpServer())
        .get(`/mobile/invoices/${invoiceIds.PAID}`)
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      expect(res.body).toEqual(
        expect.objectContaining({
          code: 'HD-0001',
          type: 'sale',
          status: 'paid',
          amount: 500000,
          subtotal: 500000,
          cashReceived: 520000,
          changeAmount: 20000,
          loyalty: { opening: 100, earned: 50, used: 0 },
          lines: [
            { name: 'Giày A', sku: 'A-41', unit: 'Đôi', quantity: 1, unitPrice: 500000, total: 500000 },
          ],
        }),
      );
      expect(res.body.cashier).toMatch(/\S/);
      expect(res.body).not.toHaveProperty('items');
      expect(res.body).not.toHaveProperty('payments');
    });

    it('nháp -> 404 tiếng Việt dù id có thật', async () => {
      const res = await request(app.getHttpServer())
        .get(`/mobile/invoices/${invoiceIds.DRAFT}`)
        .set('Authorization', authHeader(seed.accessToken))
        .expect(404);
      expect(res.body.message).toBe('Không tìm thấy hoá đơn.');
    });

    it('id không có -> 404; không phải uuid -> 400', async () => {
      await request(app.getHttpServer())
        .get('/mobile/invoices/f3000000-0000-4000-8000-0000000000ff')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(404);
      await request(app.getHttpServer())
        .get('/mobile/invoices/KHONG-PHAI-UUID')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(400);
    });
  });

  // ─── Tương thích ngược ────────────────────────────────────────────

  // ─── Tình hình kinh doanh ─────────────────────────────────────────

  describe('GET /mobile/reports/business', () => {
    /** Kỳ 30 ngày tới hôm nay — ôm trọn hoá đơn seed (`issued_at` = NOW() − n ngày). */
    const isoOf = (d: Date) => d.toISOString().slice(0, 10);
    const today = new Date();
    const range = {
      from: isoOf(new Date(today.getTime() - 30 * 86_400_000)),
      to: isoOf(today),
    };

    it('trả totals + branches đúng hình dạng, chi nhánh seed có doanh thu từ dòng hàng HD-0001', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/reports/business')
        .set('Authorization', authHeader(seed.accessToken))
        .query(range)
        .expect(200);

      expect(Object.keys(res.body).sort()).toEqual(['branches', 'totals']);
      expect(Object.keys(res.body.totals).sort()).toEqual(['cost', 'profit', 'revenue']);

      const branch = res.body.branches.find((b: { id: string }) => b.id === seed.branchId);
      expect(Object.keys(branch).sort()).toEqual([
        'address', 'cost', 'id', 'months', 'name', 'profit', 'revenue',
      ]);
      // Dòng hàng duy nhất của seed: 1 × 500000, giá vốn 0 → profit = revenue.
      // Hoá đơn trả HD-0004 và huỷ HD-0005 không có dòng hàng nên không đổi số.
      expect(branch.revenue).toBeGreaterThanOrEqual(500000);
      expect(branch.profit).toBe(branch.revenue - branch.cost);
      expect(res.body.totals.profit).toBe(res.body.totals.revenue - res.body.totals.cost);

      // Cửa sổ biểu đồ: đúng 7 tháng, tăng dần, kết thúc ở tháng của `to`.
      expect(branch.months).toHaveLength(7);
      expect(branch.months.at(-1)).toEqual(
        expect.objectContaining({ year: today.getFullYear(), month: today.getMonth() + 1 }),
      );
      expect(Object.keys(branch.months[0]).sort()).toEqual(['cost', 'month', 'profit', 'revenue', 'year']);
    });

    it('400 khi thiếu `from` hoặc có khoá lạ', async () => {
      await request(app.getHttpServer())
        .get('/mobile/reports/business')
        .set('Authorization', authHeader(seed.accessToken))
        .query({ to: range.to })
        .expect(400);

      await request(app.getHttpServer())
        .get('/mobile/reports/business')
        .set('Authorization', authHeader(seed.accessToken))
        .query({ ...range, branchIds: [seed.branchId] })
        .expect(400);
    });

    it('401 khi không có token', async () => {
      await request(app.getHttpServer()).get('/mobile/reports/business').query(range).expect(401);
    });
  });

  // ─── Tổng quan ────────────────────────────────────────────────────

  describe('GET /mobile/reports/overview', () => {
    const isoOf = (d: Date) => d.toISOString().slice(0, 10);
    const today = new Date();
    const range = {
      from: isoOf(new Date(today.getTime() - 30 * 86_400_000)),
      to: isoOf(today),
    };
    /** Kỳ so sánh = ĐÚNG kỳ chính, để compareRevenue phải bằng revenue. */
    const sameCompare = { compareFrom: range.from, compareTo: range.to };

    it('trả totals + branches đúng hình dạng; tổng khớp /revenue/items cùng kỳ; kỳ so sánh trùng kỳ chính thì compareRevenue = revenue', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/reports/overview')
        .set('Authorization', authHeader(seed.accessToken))
        .query({ ...range, ...sameCompare })
        .expect(200);

      expect(Object.keys(res.body).sort()).toEqual(['branches', 'totals']);
      expect(Object.keys(res.body.totals).sort()).toEqual(['compareRevenue', 'invoiceCount', 'revenue']);
      expect(res.body.totals.compareRevenue).toBe(res.body.totals.revenue);

      const branch = res.body.branches.find((b: { id: string }) => b.id === seed.branchId);
      expect(Object.keys(branch).sort()).toEqual(['compareRevenue', 'id', 'invoiceCount', 'name', 'revenue']);
      // HD-0001 có dòng hàng 500000; HD-0005 huỷ KHÔNG được đếm.
      expect(branch.revenue).toBeGreaterThanOrEqual(500000);
      expect(branch.invoiceCount).toBeGreaterThanOrEqual(1);

      const items = await request(app.getHttpServer())
        .get('/mobile/reports/revenue/items')
        .set('Authorization', authHeader(seed.accessToken))
        .query({ ...range, limit: 1 })
        .expect(200);
      expect(res.body.totals.revenue).toBe(items.body.totalRevenue);
    });

    it('vắng kỳ so sánh → compareRevenue = 0 ở mọi dòng', async () => {
      const res = await request(app.getHttpServer())
        .get('/mobile/reports/overview')
        .set('Authorization', authHeader(seed.accessToken))
        .query(range)
        .expect(200);

      expect(res.body.totals.compareRevenue).toBe(0);
      for (const b of res.body.branches) expect(b.compareRevenue).toBe(0);
    });

    it('400 khi thiếu `from`, có khoá lạ, hoặc kỳ so sánh thiếu một vế', async () => {
      const get = () =>
        request(app.getHttpServer())
          .get('/mobile/reports/overview')
          .set('Authorization', authHeader(seed.accessToken));

      await get().query({ to: range.to }).expect(400);
      await get().query({ ...range, foo: 1 }).expect(400);
      await get().query({ ...range, compareFrom: range.from }).expect(400);
    });

    it('401 khi không có token', async () => {
      await request(app.getHttpServer()).get('/mobile/reports/overview').query(range).expect(401);
    });
  });

  describe('GET /mobile/reports/revenue-estimate', () => {
    const isoOf = (d: Date) => d.toISOString().slice(0, 10);
    const today = new Date();
    const range = {
      from: isoOf(new Date(today.getTime() - 30 * 86_400_000)),
      to: isoOf(today),
    };
    const get = () =>
      request(app.getHttpServer())
        .get('/mobile/reports/revenue-estimate')
        .set('Authorization', authHeader(seed.accessToken));
    const keysOf = (res: request.Response): string[] =>
      res.body.items.map((i: { key: string }) => i.key);

    it('time: khoá yyyy-MM-dd tăng dần; tổng khớp /revenue/items cùng kỳ (cùng CTE)', async () => {
      const res = await get()
        .query({ ...range, dateBasis: 'issued', groupBy: 'time' })
        .expect(200);

      expect(Object.keys(res.body).sort()).toEqual(['items', 'totals']);
      expect(Object.keys(res.body.totals).sort()).toEqual(['orderCount', 'revenue']);
      const keys = keysOf(res);
      expect(keys.length).toBeGreaterThanOrEqual(1);
      for (const k of keys) expect(k).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect([...keys].sort()).toEqual(keys);
      for (const i of res.body.items) {
        expect(Object.keys(i).sort()).toEqual(['key', 'label', 'orderCount', 'revenue']);
        expect(i.label).toBeNull();
      }

      const items = await request(app.getHttpServer())
        .get('/mobile/reports/revenue/items')
        .set('Authorization', authHeader(seed.accessToken))
        .query({ ...range, limit: 1 })
        .expect(200);
      expect(res.body.totals.revenue).toBe(items.body.totalRevenue);
    });

    it('status: có paid (HD-0001), KHÔNG có cancelled (HD-0005) hay draft (HD-0003)', async () => {
      const res = await get()
        .query({ ...range, dateBasis: 'issued', groupBy: 'status' })
        .expect(200);

      const keys = keysOf(res);
      expect(keys).toContain('paid');
      expect(keys).not.toContain('cancelled');
      expect(keys).not.toContain('draft');
    });

    it('payment: tiền mặt của HD-0001 và phần nợ của HD-0002 (không có dòng hàng vẫn được đếm)', async () => {
      const res = await get()
        .query({ ...range, dateBasis: 'issued', groupBy: 'payment' })
        .expect(200);

      const byKey = (key: string) => res.body.items.find((i: { key: string }) => i.key === key);
      expect(byKey('cash').revenue).toBeGreaterThanOrEqual(520000);
      expect(byKey('unpaid').revenue).toBeGreaterThanOrEqual(350000);
      expect(byKey('unpaid').orderCount).toBeGreaterThanOrEqual(1);
    });

    it('staff/creator: một dòng cho người tạo seed, label là tên; salesperson chưa gán → unassigned, label null', async () => {
      const creator = await get()
        .query({ ...range, dateBasis: 'issued', groupBy: 'staff', staffRole: 'creator' })
        .expect(200);
      const mine = creator.body.items.find((i: { key: string }) => i.key === seed.userId);
      expect(mine).toBeDefined();
      expect(typeof mine.label).toBe('string');

      const sales = await get()
        .query({ ...range, dateBasis: 'issued', groupBy: 'staff', staffRole: 'salesperson' })
        .expect(200);
      const unassigned = sales.body.items.find((i: { key: string }) => i.key === 'unassigned');
      expect(unassigned).toBeDefined();
      expect(unassigned.label).toBeNull();
    });

    it('channel: đúng một dòng in_store; dateBasis=created cũng 200', async () => {
      const res = await get()
        .query({ ...range, dateBasis: 'created', groupBy: 'channel' })
        .expect(200);
      expect(keysOf(res)).toEqual(['in_store']);
    });

    it('400 khi thiếu groupBy/dateBasis, khoá lạ, staff thiếu staffRole, hay staffRole đi lạc', async () => {
      await get().query({ ...range, dateBasis: 'issued' }).expect(400);
      await get().query({ ...range, groupBy: 'time' }).expect(400);
      await get().query({ ...range, dateBasis: 'issued', groupBy: 'time', foo: 1 }).expect(400);
      await get().query({ ...range, dateBasis: 'issued', groupBy: 'staff' }).expect(400);
      await get()
        .query({ ...range, dateBasis: 'issued', groupBy: 'time', staffRole: 'cashier' })
        .expect(400);
    });

    it('401 khi không có token', async () => {
      await request(app.getHttpServer())
        .get('/mobile/reports/revenue-estimate')
        .query({ ...range, dateBasis: 'issued', groupBy: 'time' })
        .expect(401);
    });
  });

  describe('GET /mobile/reports/overview/branches/:id', () => {
    const isoOf = (d: Date) => d.toISOString().slice(0, 10);
    const today = new Date();
    const range = {
      from: isoOf(new Date(today.getTime() - 30 * 86_400_000)),
      to: isoOf(today),
    };
    const path = `/mobile/reports/overview/branches/${seed.branchId}`;

    it('trả đúng hình dạng; total = dòng chi nhánh ở Tổng quan; paid + unpaid = total', async () => {
      const res = await request(app.getHttpServer())
        .get(path)
        .set('Authorization', authHeader(seed.accessToken))
        .query(range)
        .expect(200);

      expect(Object.keys(res.body).sort()).toEqual([
        'collected', 'id', 'inventory', 'name', 'newCustomers', 'pendingUnpaidCount', 'revenue',
      ]);
      expect(Object.keys(res.body.revenue).sort()).toEqual([
        'cancelledCount', 'invoiceCount', 'paidAmount', 'paidCount', 'total', 'unpaidAmount', 'unpaidCount',
      ]);
      expect(Object.keys(res.body.collected.sales).sort()).toEqual(['card', 'cash', 'transfer']);
      expect(res.body.revenue.paidAmount + res.body.revenue.unpaidAmount).toBe(res.body.revenue.total);

      const overview = await request(app.getHttpServer())
        .get('/mobile/reports/overview')
        .set('Authorization', authHeader(seed.accessToken))
        .query({ ...range, branchIds: [seed.branchId] })
        .expect(200);
      expect(res.body.revenue.total).toBe(overview.body.branches[0].revenue);
      expect(res.body.revenue.invoiceCount).toBe(overview.body.branches[0].invoiceCount);
    });

    it('400 thiếu `from`; 403 chi nhánh ngoài phân công; 400 id không phải uuid; 401 không token', async () => {
      const get = (p: string) =>
        request(app.getHttpServer()).get(p).set('Authorization', authHeader(seed.accessToken));

      await get(path).query({ to: range.to }).expect(400);
      await get('/mobile/reports/overview/branches/20000000-0000-4000-8000-0000000000ff').query(range).expect(403);
      await get('/mobile/reports/overview/branches/not-a-uuid').query(range).expect(400);
      await request(app.getHttpServer()).get(path).query(range).expect(401);
    });
  });

  describe('Route phẳng của backoffice/POS không bị đụng', () => {
    it('POST /auth/login vẫn hoạt động', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send(credentials())
        .expect(200);
    });

    it('POST /auth/login vẫn nhận key thừa như trước — mobile mới là nơi siết', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ ...credentials(), junk: 1 })
        .expect(200);
    });

    it('GET /admin/users/me vẫn trả bản đầy đủ', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/users/me')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      expect(res.body).toHaveProperty('firstName');
      expect(res.body).toHaveProperty('permissions');
    });
  });
  // ─── Tồn kho ──────────────────────────────────────────────────────

  describe('GET /mobile/inventory/*', () => {
    const storageId = 'ad000000-0000-4000-8000-000000000001';
    const locationId = 'ad000000-0000-4000-8000-000000000002';
    const productId = 'ae000000-0000-4000-8000-000000000001';
    const variantIds = [
      'ae000000-0000-4000-8000-000000000011',
      'ae000000-0000-4000-8000-000000000012',
    ];
    const orphanId = 'ae000000-0000-4000-8000-000000000021';

    /**
     * Một kho + một vị trí ở chi nhánh của seed; mẫu mã `INV-GELLI` có hai
     * biến thể (tồn 5 và 3 → gộp thành 8), item lẻ `INV-ZERO` nhập 4 rồi xuất
     * 4 (→ tồn 0, thuộc `out_of_stock`). Bút toán xuất ghi ngày 2026-09-05
     * để ca `asOf` trước ngày đó thấy tồn CHƯA trừ.
     */
    beforeAll(async () => {
      const ds = app.get(DataSource);

      await ds.query(
        `INSERT INTO storages (id, organization_id, branch_id, name, is_active, is_main_storage,
                               created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'Kho e2e', true, true, $4::uuid, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [storageId, seed.organizationId, seed.branchId, seed.userId],
      );
      await ds.query(
        `INSERT INTO locations (id, organization_id, branch_id, storage_id, code, name, type,
                                is_active, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, $4::uuid, 'E2E-01', 'Kệ e2e', 'SHELF', true,
                 $5::uuid, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [locationId, seed.organizationId, seed.branchId, storageId, seed.userId],
      );
      await ds.query(
        `INSERT INTO products (id, organization_id, code, name, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, 'INV-GELLI', 'Giay Gelli ton kho', $3::uuid, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [productId, seed.organizationId, seed.userId],
      );

      const items: [string, string, string, string | null][] = [
        [variantIds[0], 'INV-GELLI-39', 'Giay Gelli 39', productId],
        [variantIds[1], 'INV-GELLI-40', 'Giay Gelli 40', productId],
        [orphanId, 'INV-ZERO', 'Hang het ton', null],
      ];
      for (const [id, code, name, pid] of items) {
        await ds.query(
          `INSERT INTO items
             (id, organization_id, branch_id, code, name, unit, selling_price, purchase_price,
              is_active, is_pos_visible, product_id, created_by, created_at, updated_at)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'Đôi', 100, 50, true, true,
                   $6::uuid, $7::uuid, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`,
          [id, seed.organizationId, seed.branchId, code, name, pid, seed.userId],
        );
      }

      const entries: [string, number, number, string][] = [
        [variantIds[0], 5, 500, '2026-09-01T10:00:00Z'],
        [variantIds[1], 3, 300, '2026-09-01T10:00:00Z'],
        [orphanId, 4, 400, '2026-09-01T10:00:00Z'],
        [orphanId, -4, -400, '2026-09-05T10:00:00Z'],
      ];
      for (const [itemId, quantity, lineValue, postedAt] of entries) {
        await ds.query(
          `INSERT INTO stock_ledger_entries
             (id, organization_id, branch_id, item_id, location_id, movement_type,
              quantity, reference_type, reference_id, unit_cost, line_value,
              posted_at, created_by, created_at, updated_at)
           VALUES (gen_random_uuid(), $1::uuid, $2, $3::uuid, $4::uuid,
                   $5, $6, 'E2E_TEST', gen_random_uuid(), 100, $7,
                   $8::timestamptz, $9::uuid, NOW(), NOW())`,
          [
            seed.organizationId,
            seed.branchId,
            itemId,
            locationId,
            quantity > 0 ? 'PURCHASE_RECEIPT' : 'GOODS_ISSUE',
            quantity,
            lineValue,
            postedAt,
            seed.userId,
          ],
        );
      }
    });

    const get = (path: string) =>
      request(app.getHttpServer())
        .get(`/mobile/inventory${path}`)
        .set('Authorization', authHeader(seed.accessToken));

    it('products: mẫu mã gộp thành MỘT dòng, đúng bảy trường, tổng là của toàn tập', async () => {
      const res = await get('/products?asOf=2026-09-30&search=INV-').expect(200);

      expect(res.body).toEqual(
        expect.objectContaining({
          total: 2,
          page: 1,
          limit: 20,
          totalQuantity: 8,
          totalValue: 800,
        }),
      );
      const gelli = res.body.data.find((r: { id: string }) => r.id === productId);
      expect(Object.keys(gelli).sort()).toEqual([
        'code',
        'groupId',
        'id',
        'name',
        'quantity',
        'stockValue',
        'unit',
      ]);
      expect(gelli.quantity).toBe(8);
      expect(gelli.stockValue).toBe(800);
      expect(gelli.unit).toBe('Đôi');
    });

    it('products: level=variant tách từng biến thể; status=out_of_stock chỉ ra hàng tồn <= 0', async () => {
      const variants = await get(
        '/products?asOf=2026-09-30&search=INV-&level=variant',
      ).expect(200);
      expect(variants.body.total).toBe(3);

      const empty = await get(
        '/products?asOf=2026-09-30&search=INV-&status=out_of_stock',
      ).expect(200);
      expect(empty.body.data.map((r: { id: string }) => r.id)).toEqual([orphanId]);
    });

    it('products: asOf là mốc CUỐI — trước ngày xuất thì hàng còn tồn', async () => {
      const res = await get(
        '/products?asOf=2026-09-03&search=INV-ZERO',
      ).expect(200);

      expect(res.body.data[0].quantity).toBe(4);
    });

    it('products: sort=value_asc đảo thứ tự so với mặc định', async () => {
      const asc = await get('/products?asOf=2026-09-30&search=INV-&sort=value_asc').expect(200);
      const desc = await get('/products?asOf=2026-09-30&search=INV-&sort=value_desc').expect(200);

      expect(asc.body.data.map((r: { id: string }) => r.id)).toEqual(
        [...desc.body.data.map((r: { id: string }) => r.id)].reverse(),
      );
    });

    it('stores: thẻ của chi nhánh seed có kho e2e, tổng khớp danh sách mặt hàng', async () => {
      const res = await get(`/stores/${seed.branchId}?asOf=2026-09-30`).expect(200);

      expect(Object.keys(res.body).sort()).toEqual([
        'id',
        'name',
        'periodIn',
        'periodOut',
        'quantity',
        'stockValue',
        'storages',
      ]);
      // Kỳ = 2026-09-01 -> 2026-09-30: nhập 5+3+4, xuất 4.
      expect(res.body.periodIn).toBe(12);
      expect(res.body.periodOut).toBe(4);
      const storage = res.body.storages.find((s: { id: string }) => s.id === storageId);
      expect(storage).toEqual({ id: storageId, name: 'Kho e2e', quantity: 8 });

      const list = await get('/stores?asOf=2026-09-30').expect(200);
      expect(Array.isArray(list.body)).toBe(true);
      expect(list.body.map((s: { id: string }) => s.id)).toContain(seed.branchId);
    });

    it('kind=in_transit / incoming đọc phiếu chuyển: envelope y hệt on_hand, seed không có phiếu -> rỗng', async () => {
      for (const kind of ['in_transit', 'incoming']) {
        const res = await get(`/products?kind=${kind}&search=INV-`).expect(200);
        expect(res.body).toEqual({ data: [], total: 0, page: 1, limit: 20, totalQuantity: 0, totalValue: 0 });

        const stores = await get(`/stores/${seed.branchId}?kind=${kind}`).expect(200);
        expect(stores.body).toEqual(
          expect.objectContaining({ id: seed.branchId, quantity: 0, periodIn: 0, periodOut: 0 }),
        );

        const flow = await get(`/products/${orphanId}/stores/${seed.branchId}?kind=${kind}`).expect(200);
        expect(flow.body).toEqual(
          expect.objectContaining({ openingQuantity: 0, closingQuantity: 0 }),
        );
        expect(flow.body.inbound.lines).toEqual([]);
        expect(flow.body.outbound.lines).toEqual([]);

        const vouchers = await get(`/products/${orphanId}/stores/${seed.branchId}/vouchers?kind=${kind}`).expect(200);
        expect(vouchers.body.total).toBe(0);
      }
      await get('/products?kind=teleport').expect(400);
    });

    it('chi nhánh ngoài quyền -> 403; khoá lạ -> 400', async () => {
      await get('/products?branchIds=20000000-0000-4000-8000-0000000000ff').expect(403);
      await get('/stores/20000000-0000-4000-8000-0000000000ff').expect(403);
      await get('/stores?status=in_stock').expect(400);
      await get('/stores/not-a-uuid').expect(400);
    });

    it('drill-down: biến thể của mẫu mã cộng lại bằng dòng mẫu mã, kèm số theo kỳ', async () => {
      const res = await get(`/products/${productId}/variants?asOf=2026-09-30`).expect(200);

      expect(res.body).toHaveLength(2);
      expect(Object.keys(res.body[0]).sort()).toEqual([
        'code',
        'id',
        'name',
        'openingQuantity',
        'periodIn',
        'periodOut',
        'quantity',
        'stockValue',
        'unit',
      ]);
      const total = res.body.reduce((acc: number, v: { quantity: number }) => acc + v.quantity, 0);
      expect(total).toBe(8);
      // Nhập ngày 01/09 nằm TRONG kỳ tháng 9 → tồn đầu kỳ 0, nhập trong kỳ = tồn.
      const v39 = res.body.find((v: { id: string }) => v.id === variantIds[0]);
      expect(v39).toEqual(expect.objectContaining({ openingQuantity: 0, periodIn: 5, periodOut: 0, quantity: 5 }));

      // Id item lẻ -> đúng một dòng là chính nó.
      const single = await get(`/products/${orphanId}/variants?asOf=2026-09-30`).expect(200);
      expect(single.body.map((v: { id: string }) => v.id)).toEqual([orphanId]);
    });

    it('drill-down: cửa hàng đang giữ mặt hàng — CHỈ chi nhánh có bút toán, kho thu hẹp về mặt hàng', async () => {
      const res = await get(`/products/${productId}/stores?asOf=2026-09-30`).expect(200);

      expect(res.body.map((s: { id: string }) => s.id)).toEqual([seed.branchId]);
      expect(res.body[0].storages).toEqual([{ id: storageId, name: 'Kho e2e', quantity: 8 }]);
      expect(res.body[0].quantity).toBe(8);
    });

    it('drill-down: luồng tại một cửa hàng — tồn cuối = đầu + nhập − xuất, lines chỉ loại có phát sinh', async () => {
      const res = await get(`/products/${orphanId}/stores/${seed.branchId}?asOf=2026-09-30`).expect(200);

      expect(res.body).toEqual({
        storeId: seed.branchId,
        openingQuantity: 0,
        closingQuantity: 0,
        // `reference_type` của seed là `E2E_TEST`, không có nhãn -> giữ nguyên mã.
        inbound: { quantity: 4, value: 400, lines: [{ name: 'E2E_TEST', quantity: 4, value: 400 }] },
        outbound: { quantity: 4, value: 400, lines: [{ name: 'E2E_TEST', quantity: 4, value: 400 }] },
      });
    });

    it('drill-down: phiếu phân trang, chiều theo dấu, số tuyệt đối, tổng toàn tập, lọc theo kho', async () => {
      const res = await get(`/products/${orphanId}/stores/${seed.branchId}/vouchers?asOf=2026-09-30`).expect(200);

      expect(res.body).toEqual(
        expect.objectContaining({ total: 2, page: 1, limit: 20, totalQuantity: 8, totalValue: 800 }),
      );
      // Mới nhất trước: phiếu xuất ngày 05/09 đứng trên phiếu nhập ngày 01/09.
      expect(res.body.data.map((v: { direction: string; quantity: number }) => [v.direction, v.quantity])).toEqual([
        ['outbound', 4],
        ['inbound', 4],
      ]);
      expect(res.body.data[0]).toEqual(
        expect.objectContaining({ warehouseId: storageId, warehouseName: 'Kho e2e', unit: 'Đôi', code: 'E2E_TEST' }),
      );
      // `E2E_TEST` không phải loại phiếu app mở được -> `document` null (khoá vẫn có mặt).
      expect(res.body.data[0]).toHaveProperty('document', null);

      const byStorage = await get(
        `/products/${orphanId}/stores/${seed.branchId}/vouchers?asOf=2026-09-30&storageId=ad000000-0000-4000-8000-0000000000ff`,
      ).expect(200);
      expect(byStorage.body.total).toBe(0);

      const asc = await get(
        `/products/${productId}/stores/${seed.branchId}/vouchers?asOf=2026-09-30&sort=quantity_asc`,
      ).expect(200);
      expect(asc.body.data.map((v: { quantity: number }) => v.quantity)).toEqual([3, 5]);
    });

    it('drill-down: id đúng dạng uuid nhưng không phải mẫu mã/item -> 404 tiếng Việt; chi nhánh ngoài quyền -> 403', async () => {
      const notFound = await get('/products/ae000000-0000-4000-8000-0000000000ff/variants').expect(404);
      expect(notFound.body.message).toBe('Không tìm thấy hàng hoá.');

      await get(`/products/${productId}/stores/20000000-0000-4000-8000-0000000000ff`).expect(403);
      await get(`/products/${productId}/stores/${seed.branchId}?branchIds=${seed.branchId}`).expect(400);
    });

    it('danh mục: nhóm hàng phẳng ba trường, đơn vị gộp không phân biệt hoa/thường', async () => {
      const categories = await get('/categories').expect(200);
      expect(Array.isArray(categories.body)).toBe(true);
      for (const row of categories.body) {
        expect(Object.keys(row).sort()).toEqual(['id', 'name', 'parentId']);
      }

      const units = await get('/units').expect(200);
      const codes = units.body.map((u: { code: string }) => u.code);
      // Seed của khối này dùng `Đôi`; đơn vị về dạng chữ thường và không lặp.
      expect(codes).toContain('đôi');
      expect(new Set(codes).size).toBe(codes.length);
      const doi = units.body.find((u: { code: string }) => u.code === 'đôi');
      expect(doi.name.toLowerCase()).toBe('đôi');
    });

    it('401 khi không có token', async () => {
      await request(app.getHttpServer()).get('/mobile/inventory/products').expect(401);
    });
  });
});
