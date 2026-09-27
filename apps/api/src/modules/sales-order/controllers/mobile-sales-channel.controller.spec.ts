import { Repository } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { SalesChannelEntity } from '../entities/sales-channel.entity';
import { MobileSalesChannelController } from './mobile-sales-channel.controller';

/**
 * Sidebar kênh (AC-01): chỉ kênh active của tổ chức actor. Repo giả áp đúng
 * `where`/`order`/`select` mà controller truyền vào, nên thiếu một điều kiện
 * lọc là kênh sai lọt ra kết quả.
 */
describe('MobileSalesChannelController', () => {
  const actor = {
    userId: 'user-1',
    organizationId: 'org-A',
    branchId: 'branch-A',
    roles: [],
  } as unknown as ActorContext;

  const rows = [
    { id: 'c-shopee', organizationId: 'org-A', code: 'SHOPEE', name: 'Shopee', isActive: true },
    { id: 'c-zalo', organizationId: 'org-A', code: 'ZALO', name: 'Zalo', isActive: false },
    { id: 'c-web', organizationId: 'org-A', code: 'WEB', name: 'Bán qua Web', isActive: true },
    { id: 'c-other', organizationId: 'org-B', code: 'TIKTOK', name: 'Tiktok', isActive: true },
  ] as SalesChannelEntity[];

  type FindArgs = {
    select: Record<string, boolean>;
    where: Partial<Record<keyof SalesChannelEntity, unknown>>;
    order: { name: 'ASC' | 'DESC' };
  };

  function makeController() {
    const find = jest.fn(async ({ select, where, order }: FindArgs) =>
      rows
        .filter((r) =>
          Object.entries(where).every(([k, v]) => r[k as keyof SalesChannelEntity] === v),
        )
        .sort((a, b) => (order.name === 'ASC' ? 1 : -1) * a.name.localeCompare(b.name))
        .map((r) =>
          Object.fromEntries(
            Object.keys(select)
              .filter((k) => select[k])
              .map((k) => [k, r[k as keyof SalesChannelEntity]]),
          ),
        ),
    );
    const repo = { find } as unknown as Repository<SalesChannelEntity>;
    return { controller: new MobileSalesChannelController(repo), find };
  }

  it('trả kênh active của tổ chức actor, loại kênh inactive và kênh tổ chức khác', async () => {
    const { controller, find } = makeController();

    const result = await controller.list(actor);

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'org-A', isActive: true },
      }),
    );
    expect(result.map((c) => c.id)).toEqual(['c-web', 'c-shopee']);
    expect(result.map((c) => c.id)).not.toContain('c-zalo');
    expect(result.map((c) => c.id)).not.toContain('c-other');
  });

  it('chỉ trả { id, code, name }, sắp theo name', async () => {
    const { controller, find } = makeController();

    const result = await controller.list(actor);

    expect(find).toHaveBeenCalledWith(expect.objectContaining({ order: { name: 'ASC' } }));
    expect(result).toEqual([
      { id: 'c-web', code: 'WEB', name: 'Bán qua Web' },
      { id: 'c-shopee', code: 'SHOPEE', name: 'Shopee' },
    ]);
  });
});
