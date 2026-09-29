import { ConflictException } from '@nestjs/common';
import { DeletionPolicy, ScopingPolicy } from '@erp/shared-interfaces';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { MobileDeliveryPartnerController } from './controllers/mobile-sales-channel.controller';
import {
  DELIVERY_PARTNER_ENTITY_CONFIG,
  DELIVERY_PARTNER_SERVICE_TOKEN,
  DeliveryPartnerCrudService,
} from './delivery-partner-crud.service';
import { DeliveryPartnerEntity } from './entities/delivery-partner.entity';
import { SALES_CHANNEL_ENTITY_CONFIG } from './sales-channel-crud.service';

const actorA = {
  userId: 'user-1',
  organizationId: 'org-A',
  branchId: 'branch-A',
  roles: [],
} as unknown as ActorContext;
const actorB = { ...actorA, organizationId: 'org-B', branchId: 'branch-B' } as ActorContext;

/**
 * AC-10 — CRUD đối tác giao hàng qua nền generic (ADR-02).
 *
 * Repo giả áp đúng unique index `UQ_delivery_partners_org_code`
 * (organization_id, code) WHERE deleted_at IS NULL: trùng thì ném
 * `QueryFailedError` mã 23505 như Postgres.
 */
describe('DeliveryPartnerCrudService', () => {
  function makeService() {
    const rows: Partial<DeliveryPartnerEntity>[] = [];
    const repo = {
      create: jest.fn((data: Partial<DeliveryPartnerEntity>) => ({ ...data })),
      save: jest.fn(async (entity: Partial<DeliveryPartnerEntity>) => {
        const clash = rows.some(
          (r) => !r.deletedAt && r.organizationId === entity.organizationId && r.code === entity.code,
        );
        if (clash) {
          throw new QueryFailedError(
            'INSERT INTO "delivery_partners"',
            [],
            Object.assign(new Error('duplicate key value violates unique constraint'), {
              code: '23505',
            }),
          );
        }
        const saved = { ...entity, id: `dp-${rows.length + 1}` };
        rows.push(saved);
        return saved;
      }),
    } as unknown as Repository<DeliveryPartnerEntity>;
    return { service: new DeliveryPartnerCrudService(repo, {} as DataSource), rows };
  }

  it('tạo đối tác gắn organization_id của actor', async () => {
    const { service, rows } = makeService();

    const saved = await service.create({ code: 'GHN', name: 'Giao Hàng Nhanh' }, actorA);

    expect(saved).toMatchObject({ code: 'GHN', name: 'Giao Hàng Nhanh', organizationId: 'org-A' });
    expect(rows).toHaveLength(1);
  });

  it('trùng mã trong cùng tổ chức → 409, không thêm dòng', async () => {
    const { service, rows } = makeService();
    await service.create({ code: 'GHN', name: 'Giao Hàng Nhanh' }, actorA);

    const second = service.create({ code: 'GHN', name: 'GHN lần hai' }, actorA);

    await expect(second).rejects.toBeInstanceOf(ConflictException);
    await expect(second).rejects.toMatchObject({ status: 409 });
    expect(rows).toHaveLength(1);
  });

  it('cùng mã ở tổ chức khác không trùng', async () => {
    const { service, rows } = makeService();
    await service.create({ code: 'GHN', name: 'Giao Hàng Nhanh' }, actorA);

    await expect(service.create({ code: 'GHN', name: 'Giao Hàng Nhanh' }, actorB)).resolves.toMatchObject({
      organizationId: 'org-B',
    });
    expect(rows).toHaveLength(2);
  });

  it('config: entityKey delivery-partners, scoping tổ chức, xoá mềm, quyền như sales-channels', () => {
    expect(DELIVERY_PARTNER_ENTITY_CONFIG).toMatchObject({
      entityKey: 'delivery-partners',
      displayName: 'Đối tác giao hàng',
      scopingPolicy: ScopingPolicy.ORGANIZATION,
      deletionPolicy: DeletionPolicy.SOFT,
      searchableFields: ['code', 'name'],
    });
    expect(DELIVERY_PARTNER_ENTITY_CONFIG.fields.map((f) => f.key)).toEqual(
      expect.arrayContaining(['code', 'name', 'isActive']),
    );
    expect(DELIVERY_PARTNER_ENTITY_CONFIG.permissions).toEqual(SALES_CHANNEL_ENTITY_CONFIG.permissions);
    expect(DELIVERY_PARTNER_SERVICE_TOKEN).toBe('DeliveryPartnerCrudService');
  });
});

/**
 * AC-11 — POS chỉ thấy đối tác active của tổ chức actor. Repo giả áp đúng
 * `where`/`order`/`select` controller truyền vào, nên thiếu một điều kiện lọc
 * là đối tác sai lọt ra kết quả.
 */
describe('MobileDeliveryPartnerController', () => {
  const rows = [
    { id: 'p-ghtk', organizationId: 'org-A', code: 'GHTK', name: 'Giao Hàng Tiết Kiệm', isActive: false },
    { id: 'p-vtp', organizationId: 'org-A', code: 'VTP', name: 'Viettel Post', isActive: true },
    { id: 'p-ghn', organizationId: 'org-A', code: 'GHN', name: 'Giao Hàng Nhanh', isActive: true },
    { id: 'p-other', organizationId: 'org-B', code: 'JT', name: 'J&T Express', isActive: true },
  ] as DeliveryPartnerEntity[];

  type FindArgs = {
    select: Record<string, boolean>;
    where: Partial<Record<keyof DeliveryPartnerEntity, unknown>>;
    order: { name: 'ASC' | 'DESC' };
  };

  function makeController() {
    const find = jest.fn(async ({ select, where, order }: FindArgs) =>
      rows
        .filter((r) =>
          Object.entries(where).every(([k, v]) => r[k as keyof DeliveryPartnerEntity] === v),
        )
        .sort((a, b) => (order.name === 'ASC' ? 1 : -1) * a.name.localeCompare(b.name))
        .map((r) =>
          Object.fromEntries(
            Object.keys(select)
              .filter((k) => select[k])
              .map((k) => [k, r[k as keyof DeliveryPartnerEntity]]),
          ),
        ),
    );
    const repo = { find } as unknown as Repository<DeliveryPartnerEntity>;
    return { controller: new MobileDeliveryPartnerController(repo), find };
  }

  it('loại đối tác inactive và đối tác của tổ chức khác', async () => {
    const { controller, find } = makeController();

    const result = await controller.list(actorA);

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-A', isActive: true } }),
    );
    const ids = result.map((p) => p.id);
    expect(ids).not.toContain('p-ghtk');
    expect(ids).not.toContain('p-other');
  });

  it('chỉ trả { id, code, name }, sắp theo name', async () => {
    const { controller } = makeController();

    const result = await controller.list(actorA);

    expect(result).toEqual([
      { id: 'p-ghn', code: 'GHN', name: 'Giao Hàng Nhanh' },
      { id: 'p-vtp', code: 'VTP', name: 'Viettel Post' },
    ]);
  });
});
