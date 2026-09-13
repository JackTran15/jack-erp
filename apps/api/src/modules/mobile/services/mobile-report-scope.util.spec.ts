import { ForbiddenException } from '@nestjs/common';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { resolveReportBranchScope } from './mobile-report-scope.util';

const BRANCH_A = '20000000-0000-4000-8000-000000000001';
const BRANCH_B = '20000000-0000-4000-8000-000000000002';
const BRANCH_C = '20000000-0000-4000-8000-000000000003';

const actorOf = (branchIds: string[]): ActorContext => ({
  userId: 'u-1',
  organizationId: 'org-1',
  branchIds,
  roles: [],
});

/** Mobile chỉ có tập PHÂN CÔNG — không có vế hợp nhất, cố ý (xem doc util). */
describe('resolveReportBranchScope', () => {
  it('không phân công → 403 chứ không phải tập rỗng', () => {
    expect(() => resolveReportBranchScope({ actor: actorOf([]) })).toThrow(
      new ForbiddenException('No branch access assigned'),
    );
  });

  it('vắng requested → đúng tập phân công', () => {
    expect(
      resolveReportBranchScope({ actor: actorOf([BRANCH_A, BRANCH_B]) }),
    ).toEqual([BRANCH_A, BRANCH_B]);
  });

  it('xin ngoài phân công → 403 nêu đúng id bị từ chối', () => {
    expect(() =>
      resolveReportBranchScope({
        requested: [BRANCH_A, BRANCH_C],
        actor: actorOf([BRANCH_A, BRANCH_B]),
      }),
    ).toThrow(new ForbiddenException(`Access denied for stores: ${BRANCH_C}`));
  });

  it('xin trong phân công → đúng tập xin, khử trùng', () => {
    expect(
      resolveReportBranchScope({
        requested: [BRANCH_B, BRANCH_B],
        actor: actorOf([BRANCH_A, BRANCH_B]),
      }),
    ).toEqual([BRANCH_B]);
  });

  it('mảng requested rỗng = vắng → tập phân công', () => {
    expect(
      resolveReportBranchScope({ requested: [], actor: actorOf([BRANCH_A]) }),
    ).toEqual([BRANCH_A]);
  });
});
