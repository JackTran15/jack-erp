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

  // ─── Tương thích ngược ────────────────────────────────────────────

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
});
