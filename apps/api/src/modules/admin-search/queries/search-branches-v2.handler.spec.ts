import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BranchStatus } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { StringOperator } from '../../../common/filters/filter.dto';
import { BranchEntity } from '../../branch/branch.entity';
import { SearchBranchesV2Handler } from './search-branches-v2.handler';
import { SearchBranchesV2Query } from './search-branches-v2.query';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: undefined,
  roles: [],
};

function makeQb(result: [unknown[], number]) {
  const qb: any = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getManyAndCount: jest.fn().mockResolvedValue(result),
  };
  return qb;
}

describe('SearchBranchesV2Handler', () => {
  let handler: SearchBranchesV2Handler;
  let qb: ReturnType<typeof makeQb>;

  async function build(rows: unknown[], total = rows.length) {
    qb = makeQb([rows, total]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchBranchesV2Handler,
        {
          provide: getRepositoryToken(BranchEntity),
          useValue: { createQueryBuilder: jest.fn(() => qb) },
        },
      ],
    }).compile();
    handler = module.get(SearchBranchesV2Handler);
  }

  it('scopes by organization and preserves the createdAt DESC default sort', async () => {
    await build([]);
    await handler.execute(new SearchBranchesV2Query({}, actor));

    expect(qb.where).toHaveBeenCalledWith('branch.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(qb.orderBy).toHaveBeenCalledWith('branch.createdAt', 'DESC');
  });

  it('applies name, address, and status filters', async () => {
    await build([]);
    await handler.execute(
      new SearchBranchesV2Query(
        {
          name: { operator: StringOperator.CONTAINS, value: 'Hà Nội' },
          address: { operator: StringOperator.CONTAINS, value: 'Hoàn Kiếm' },
          status: { value: BranchStatus.ACTIVE },
        },
        actor,
      ),
    );

    const sql = qb.andWhere.mock.calls.map((call: unknown[]) => call[0]);
    expect(sql).toEqual(
      expect.arrayContaining([
        expect.stringContaining('branch.name ILIKE'),
        expect.stringContaining('branch.address ILIKE'),
        expect.stringContaining('branch.status ='),
      ]),
    );
  });

  it('returns the paged search envelope', async () => {
    const rows = [{ id: 'branch-1', name: 'Hà Nội' }];
    await build(rows, 4);

    const result = await handler.execute(
      new SearchBranchesV2Query({ page: 2, limit: 2 }, actor),
    );

    expect(qb.skip).toHaveBeenCalledWith(2);
    expect(qb.take).toHaveBeenCalledWith(2);
    expect(result).toEqual({ data: rows, total: 4, page: 2, limit: 2 });
  });
});
