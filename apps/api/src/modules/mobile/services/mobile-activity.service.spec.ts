import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  MobileActivityBatchDto,
  MobileActivityItemDto,
} from '../dto/mobile-activity.dto';
import { MobileActivityLogWriter } from './mobile-activity-log-writer';
import {
  MOBILE_ACTIVITY_DATA_MAX_BYTES,
  MOBILE_ACTIVITY_RATE_LIMIT,
  MobileActivityService,
} from './mobile-activity.service';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  branchIds: ['branch-1'],
  roles: [],
};

function item(overrides: Partial<MobileActivityItemDto> = {}): MobileActivityItemDto {
  return {
    activityId: 'a-1',
    ts: '2026-09-16T08:12:03.412Z',
    sessionId: 's-1',
    seq: 4,
    type: 'action',
    screen: 'stock_document_list',
    action: 'tap',
    target: 'btn_open_filter',
    ...overrides,
  };
}

function batch(items: MobileActivityItemDto[]): MobileActivityBatchDto {
  return { appVersion: '1.0.3+42', platform: 'ios', catalogVersion: 1, activities: items };
}

const now = new Date('2026-09-16T08:12:05.020Z');

describe('MobileActivityService', () => {
  let service: MobileActivityService;
  let append: jest.Mock;

  beforeEach(() => {
    append = jest.fn().mockResolvedValue(undefined);
    service = new MobileActivityService({ append } as unknown as MobileActivityLogWriter);
  });

  it('ghi mỗi activity một dòng snake_case, gắn thông tin server', async () => {
    await service.record(actor, batch([item(), item({ activityId: 'a-2', seq: 5 })]), now);

    expect(append).toHaveBeenCalledTimes(1);
    const [lines, at] = append.mock.calls[0];
    expect(at).toBe(now);
    expect(lines).toHaveLength(2);

    const line = JSON.parse(lines[0]);
    expect(line).toMatchObject({
      activity_id: 'a-1',
      ts: '2026-09-16T08:12:03.412Z',
      received_at: '2026-09-16T08:12:05.020Z',
      user_id: 'user-1',
      organization_id: 'org-1',
      branch_id: 'branch-1',
      session_id: 's-1',
      seq: 4,
      type: 'action',
      screen: 'stock_document_list',
      action: 'tap',
      target: 'btn_open_filter',
      component: null,
      flow_id: null,
      app_version: '1.0.3+42',
      platform: 'ios',
      catalog_version: 1,
    });
    expect(line.data_truncated).toBeUndefined();
  });

  it('user_id lấy từ token, KHÔNG từ body', () => {
    const forged = { ...item(), userId: 'someone-else' } as MobileActivityItemDto;
    const line = service.toLine({ actor, batch: batch([forged]), item: forged, receivedAt: now });
    expect(line.user_id).toBe('user-1');
  });

  it('data quá trần thì bị bỏ và gắn data_truncated', () => {
    const big = { blob: 'x'.repeat(MOBILE_ACTIVITY_DATA_MAX_BYTES) };
    const line = service.toLine({ actor, batch: batch([]), item: item({ data: big }), receivedAt: now });
    expect(line.data).toBeNull();
    expect(line.data_truncated).toBe(true);

    const small = service.toLine({ actor, batch: batch([]), item: item({ data: { kind: 'goods-receipt' } }), receivedAt: now });
    expect(small.data).toEqual({ kind: 'goods-receipt' });
  });

  it('vượt rate limit trong một phút thì 429 và không ghi; sang phút mới thì hết', async () => {
    for (let i = 0; i < MOBILE_ACTIVITY_RATE_LIMIT; i++) {
      await service.record(actor, batch([item()]), now);
    }
    append.mockClear();

    await expect(service.record(actor, batch([item()]), now)).rejects.toMatchObject({ status: 429 });
    expect(append).not.toHaveBeenCalled();

    // Người khác cùng phút không bị ảnh hưởng.
    await service.record({ ...actor, userId: 'user-2' }, batch([item()]), now);

    const nextMinute = new Date(now.getTime() + 60_000);
    await expect(service.record(actor, batch([item()]), nextMinute)).resolves.toBeUndefined();
  });

  it('ghi file lỗi thì ném ra để app giữ lại batch', async () => {
    append.mockRejectedValue(new Error('EACCES'));
    await expect(service.record(actor, batch([item()]), now)).rejects.toThrow('EACCES');
  });
});
