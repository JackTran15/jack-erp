import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TransferStatus } from '@erp/shared-interfaces';
import {
  StringOperator,
  CompareOperator,
} from '../../../../common/filters/filter.dto';
import { StockTransferEntity } from '../stock-transfer.entity';
import { UserEntity } from '../../../auth/user.entity';
import { SearchStockTransfersV2Handler } from './search-stock-transfers-v2.handler';
import { SearchStockTransfersV2Query } from './search-stock-transfers-v2.query';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'admin-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

function makeQb(result: [unknown[], number]) {
  const qb: any = {
    leftJoinAndSelect: jest.fn(() => qb),
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    skip: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getManyAndCount: jest.fn().mockResolvedValue(result),
  };
  return qb;
}

describe('SearchStockTransfersV2Handler', () => {
  let handler: SearchStockTransfersV2Handler;
  let repo: { createQueryBuilder: jest.Mock };
  let userRepo: { find: jest.Mock };
  let qb: ReturnType<typeof makeQb>;

  async function build(rows: unknown[], total = rows.length, users: unknown[] = []) {
    qb = makeQb([rows, total]);
    repo = { createQueryBuilder: jest.fn(() => qb) };
    userRepo = { find: jest.fn().mockResolvedValue(users) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchStockTransfersV2Handler,
        { provide: getRepositoryToken(StockTransferEntity), useValue: repo },
        { provide: getRepositoryToken(UserEntity), useValue: userRepo },
      ],
    }).compile();
    handler = module.get(SearchStockTransfersV2Handler);
  }

  it('scopes by org + branch, hides CANCELLED, joins lines, orders by createdAt', async () => {
    await build([]);
    await handler.execute(new SearchStockTransfersV2Query({}, actor));

    expect(qb.where).toHaveBeenCalledWith('st.organizationId = :orgId', {
      orgId: 'org-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('st.status != :cancelled', {
      cancelled: TransferStatus.CANCELLED,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('st.branchId = :branchId', {
      branchId: 'branch-1',
    });
    expect(qb.leftJoinAndSelect).toHaveBeenCalledWith('st.lines', 'lines');
    expect(qb.orderBy).toHaveBeenCalledWith('st.createdAt', 'DESC');
  });

  it('omits the branch filter when the actor has no active branch', async () => {
    await build([]);
    await handler.execute(
      new SearchStockTransfersV2Query({}, { ...actor, branchId: undefined }),
    );
    const andWhereCalls = qb.andWhere.mock.calls.map((c: unknown[]) => c[0]);
    expect(andWhereCalls).not.toContain('st.branchId = :branchId');
  });

  it('paginates and inlines transporter + totalAmount per row', async () => {
    const rows = [
      {
        id: 'st-1',
        documentNumber: 'CK000001',
        transporterUserId: 'u-1',
        lines: [{ lineValue: '356000' }, { lineValue: '285000' }],
      },
    ];
    await build(rows, 12, [
      { id: 'u-1', firstName: 'Phan', lastName: 'Thanh Hà', organizationId: 'org-1' },
    ]);

    const result = await handler.execute(
      new SearchStockTransfersV2Query({ page: 2, limit: 10 }, actor),
    );

    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
    expect(result.total).toBe(12);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
    expect(result.data[0].transporter).toEqual({
      id: 'u-1',
      fullName: 'Phan Thanh Hà',
    });
    expect(result.data[0].totalAmount).toBe(641000);
  });

  it('applies documentNumber, party (transporter), notes, date and totalAmount filters', async () => {
    await build([]);
    await handler.execute(
      new SearchStockTransfersV2Query(
        {
          documentNumber: { operator: StringOperator.CONTAINS, value: 'CK' },
          party: { operator: StringOperator.CONTAINS, value: 'Hà' },
          notes: { operator: StringOperator.CONTAINS, value: 'akenzy' },
          date: { operator: CompareOperator.LTE, value: '2026-06-09' },
          totalAmount: { operator: CompareOperator.LTE, value: 1000000 },
        },
        actor,
      ),
    );

    const andWhereSql = qb.andWhere.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(andWhereSql).toEqual(
      expect.arrayContaining([
        expect.stringContaining('st.documentNumber ILIKE'),
        expect.stringContaining('u.first_name'),
        expect.stringContaining('st.notes ILIKE'),
        // Single-date compare casts both sides to ::date.
        expect.stringContaining('::date <='),
        expect.stringContaining('SUM(l.line_value)'),
      ]),
    );
  });
});
