import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { NotificationTestService } from './notification-test.service';

const ORG = '10000000-0000-4000-8000-000000000001';
const DEVICE = '20000000-0000-4000-8000-000000000002';
/** Thiết bị thứ hai, của CÙNG một người với [DEVICE] — để kiểm việc gộp người nhận. */
const DEVICE_SAME_USER = '20000000-0000-4000-8000-000000000012';
/** Thiết bị của người khác. */
const DEVICE_OTHER_USER = '20000000-0000-4000-8000-000000000022';
const REVOKED_DEVICE = '20000000-0000-4000-8000-000000000032';

const deviceRows: Record<string, { user_id: string; revoked_at: Date | null }> = {
  [DEVICE]: { user_id: 'u-9', revoked_at: null },
  [DEVICE_SAME_USER]: { user_id: 'u-9', revoked_at: null },
  [DEVICE_OTHER_USER]: { user_id: 'u-8', revoked_at: null },
  [REVOKED_DEVICE]: { user_id: 'u-7', revoked_at: new Date() },
};
const actor: ActorContext = { userId: 'u-1', organizationId: ORG, roles: [] };

const invoiceDefinition = {
  type: 'invoice',
  trigger: { kind: 'event', topic: 'erp.sale.posted' },
  permissions: ['pos.invoice.read'],
  excludeActor: true,
  targetApps: ['erp_manager'],
  channels: ['fcm_push', 'websocket'],
  priority: 'high',
  defaultEnabled: true,
  shouldSend: () => false,
  build: async () => ({ data: { code: 'THẬT' } }),
};
const revenueDefinition = {
  ...invoiceDefinition,
  type: 'revenue',
  trigger: { kind: 'schedule', at: '09:00' },
  collect: jest.fn().mockResolvedValue([{ eventId: 'a' }, { eventId: 'b' }]),
};

function setup(overrides: { send?: jest.Mock; messaging?: boolean; rows?: unknown[] } = {}) {
  const send = overrides.send ?? jest.fn().mockResolvedValue('projects/p/messages/1');
  const dataSource = {
    query: jest.fn(async (sql: string, _params?: unknown[]) => {
      // `findDevice` / `findDevices` — hai câu DUY NHẤT đọc token đầy đủ.
      if (sql.includes('SELECT "id", "fcm_token"')) {
        const first = _params?.[0];
        const ids = Array.isArray(first) ? (first as string[]) : [String(first)];
        return ids
          .filter((id) => deviceRows[id])
          .map((id) => ({
            id,
            fcm_token: 'super-secret-token-abcd1234',
            platform: 'ios',
            locale: 'vi',
            ...deviceRows[id],
          }));
      }
      if (sql.includes('FROM "branches"')) return [{ name: 'Cửa hàng Q1' }];
      return overrides.rows ?? [];
    }),
  };
  const registry = {
    all: () => [invoiceDefinition, revenueDefinition],
    byType: (type: string) =>
      ({ invoice: invoiceDefinition, revenue: revenueDefinition })[type as 'invoice' | 'revenue'],
  };
  const dispatcher = { dispatch: jest.fn().mockResolvedValue({ status: 'created', notifications: 3, deliveries: 4 }) };
  const runner = {
    run: jest.fn().mockResolvedValue([
      { eventId: 'e-1', status: 'created', reason: null, notifications: 2, deliveries: 3 },
      // "created" mà 0 thông báo = eventId đã tồn tại → hôm nay gửi rồi.
      { eventId: 'e-2', status: 'created', reason: null, notifications: 0, deliveries: 0 },
      { eventId: 'e-3', status: 'skipped', reason: 'no-recipient', notifications: 0, deliveries: 0 },
    ]),
  };
  const fcm = { buildMessage: jest.fn().mockReturnValue({ token: 'built-message' }) };
  const firebase = { getMessaging: () => (overrides.messaging === false ? null : { send }) };

  const service = new NotificationTestService(
    dataSource as never,
    registry as never,
    dispatcher as never,
    runner as never,
    fcm as never,
    firebase as never,
  );
  return { service, dataSource, dispatcher, runner, fcm, send };
}

describe('NotificationTestService', () => {
  beforeEach(() => revenueDefinition.collect.mockClear());
  beforeEach(() => jest.clearAllMocks());

  describe('devices', () => {
    it('only ever exposes the tail of the FCM token', async () => {
      const { service, dataSource } = setup({
        rows: [
          {
            id: DEVICE,
            user_id: 'u-9',
            installation_id: 'inst',
            app: 'erp_manager',
            platform: 'ios',
            locale: 'vi',
            app_version: '1.0.0+5',
            environment: 'staging',
            last_seen_at: new Date('2026-09-23T01:00:00Z'),
            revoked_at: null,
            token_tail: 'abcd1234',
            user_name: 'Nguyễn Văn A',
            user_email: 'a@example.com',
          },
        ],
      });

      const devices = await service.listDevices(actor, false);

      expect(devices[0]).toMatchObject({ tokenTail: 'abcd1234', userName: 'Nguyễn Văn A' });
      expect(JSON.stringify(devices)).not.toContain('super-secret');
      // Tổ chức của người gọi là ràng buộc CỨNG, không phải tham số.
      expect(dataSource.query.mock.calls[0][1]?.[0]).toBe(ORG);
    });
  });

  describe('raw push', () => {
    it('reuses FcmPushChannel.buildMessage so the payload equals a real push', async () => {
      const { service, fcm, send } = setup();

      const result = await service.sendRawPush(actor, {
        deviceIds: [DEVICE],
        title: 'Xin chào',
        body: 'Thử thôi',
        targetType: 'invoice',
        targetId: 'inv-1',
      });

      const [job, text] = fcm.buildMessage.mock.calls[0];
      expect(job.device).toMatchObject({ id: DEVICE, fcmToken: 'super-secret-token-abcd1234' });
      expect(job.target).toEqual({ type: 'invoice', id: 'inv-1', slug: undefined, branchId: undefined });
      expect(text).toEqual({ title: 'Xin chào', body: 'Thử thôi' });
      expect(send).toHaveBeenCalledWith({ token: 'built-message' });
      expect(result).toEqual({
        sent: 1,
        failed: 0,
        results: [
          {
            deviceId: DEVICE,
            tokenTail: 'abcd1234',
            sent: true,
            messageId: 'projects/p/messages/1',
            error: null,
          },
        ],
      });
    });

    it('một máy hỏng KHÔNG kéo theo những máy còn lại', async () => {
      const send = jest
        .fn()
        .mockResolvedValueOnce('projects/p/messages/1')
        .mockRejectedValueOnce(
          Object.assign(new Error('token dead'), { code: 'messaging/registration-token-not-registered' }),
        )
        .mockResolvedValueOnce('projects/p/messages/3');
      const { service } = setup({ send });

      const result = await service.sendRawPush(actor, {
        deviceIds: [DEVICE, DEVICE_SAME_USER, DEVICE_OTHER_USER],
        title: 't',
        body: 'b',
      });

      expect(send).toHaveBeenCalledTimes(3);
      expect(result.sent).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.results[1]).toMatchObject({
        deviceId: DEVICE_SAME_USER,
        sent: false,
        error: expect.stringContaining('messaging/registration-token-not-registered'),
      });
    });

    it('thiết bị đã thu hồi → 400, KHÔNG gửi máy nào', async () => {
      const { service, send } = setup();

      await expect(
        service.sendRawPush(actor, { deviceIds: [DEVICE, REVOKED_DEVICE], title: 't', body: 'b' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(send).not.toHaveBeenCalled();
    });

    it('returns the FCM error code verbatim instead of throwing', async () => {
      const { service } = setup({
        send: jest.fn().mockRejectedValue(
          Object.assign(new Error('token dead'), { code: 'messaging/registration-token-not-registered' }),
        ),
      });

      await expect(
        service.sendRawPush(actor, { deviceIds: [DEVICE], title: 't', body: 'b' }),
      ).resolves.toMatchObject({
        sent: 0,
        failed: 1,
        results: [
          expect.objectContaining({
            sent: false,
            error: expect.stringContaining('messaging/registration-token-not-registered'),
          }),
        ],
      });
    });

    it('says plainly when Firebase is not configured', async () => {
      const { service } = setup({ messaging: false });

      await expect(
        service.sendRawPush(actor, { deviceIds: [DEVICE], title: 't', body: 'b' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('dispatch', () => {
    it('keeps the real recipients/channels and only overrides the data', async () => {
      const { service, dispatcher } = setup();

      const result = await service.dispatchTest(actor, {
        type: 'invoice',
        deviceIds: [DEVICE],
        branchId: '30000000-0000-4000-8000-000000000003',
        data: { code: 'HD-TEST' },
        targetType: 'stock_document',
        targetId: 'gr-1',
        targetSlug: 'goods-receipt',
      });

      const [definition, ctx] = dispatcher.dispatch.mock.calls[0];
      expect(definition.permissions).toEqual(['pos.invoice.read']);
      expect(definition.channels).toEqual(['fcm_push', 'websocket']);
      // `shouldSend` của bản thật trả false; bản thử luôn cho qua.
      expect(definition.shouldSend()).toBe(true);

      const built = await definition.build(ctx);
      expect(built.data).toMatchObject({ code: 'HD-TEST', store: 'Cửa hàng Q1', amount: 1234000 });
      // Chi nhánh của thông báo cũng là chi nhánh của đích.
      expect(built.target).toEqual({
        type: 'stock_document',
        id: 'gr-1',
        slug: 'goods-receipt',
        branchId: '30000000-0000-4000-8000-000000000003',
      });
      // Người nhận đến từ thiết bị đã chọn, KHÔNG từ bước dò theo quyền.
      expect(ctx.recipientUserIds).toEqual(['u-9']);
      expect(result).toEqual({
        status: 'created',
        reason: null,
        targetedUsers: 1,
        notifications: 3,
        deliveries: 4,
      });
    });

    it('gộp nhiều thiết bị của cùng một người thành MỘT người nhận', async () => {
      const { service, dispatcher } = setup();

      const result = await service.dispatchTest(actor, {
        type: 'invoice',
        deviceIds: [DEVICE, DEVICE_SAME_USER, DEVICE_OTHER_USER],
      });

      const [, ctx] = dispatcher.dispatch.mock.calls[0];
      expect(ctx.recipientUserIds).toEqual(['u-9', 'u-8']);
      expect(result.targetedUsers).toBe(2);
    });

    it('id thiết bị lạ → 404, KHÔNG gửi cho phần còn lại', async () => {
      const { service, dispatcher } = setup();

      await expect(
        service.dispatchTest(actor, {
          type: 'invoice',
          deviceIds: [DEVICE, '20000000-0000-4000-8000-0000000000ff'],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('thiết bị đã thu hồi → 400 thay vì lặng lẽ bỏ qua', async () => {
      const { service, dispatcher } = setup();

      await expect(
        service.dispatchTest(actor, { type: 'invoice', deviceIds: [DEVICE, REVOKED_DEVICE] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('two runs get different event ids, so pressing twice really sends twice', async () => {
      const { service, dispatcher } = setup();

      await service.dispatchTest(actor, { type: 'invoice', deviceIds: [DEVICE] });
      await service.dispatchTest(actor, { type: 'invoice', deviceIds: [DEVICE] });

      const [first, second] = dispatcher.dispatch.mock.calls.map(([, ctx]) => ctx.eventId);
      expect(first).not.toBe(second);
    });

    it('reports why nothing was sent', async () => {
      const { service, dispatcher } = setup();
      dispatcher.dispatch.mockResolvedValue({ status: 'skipped', reason: 'no-recipient' });

      await expect(
        service.dispatchTest(actor, { type: 'invoice', deviceIds: [DEVICE] }),
      ).resolves.toEqual({
        status: 'skipped',
        reason: 'no-recipient',
        targetedUsers: 1,
        notifications: 0,
        deliveries: 0,
      });
    });

    it('unknown type → 404', async () => {
      const { service } = setup();
      await expect(
        service.dispatchTest(actor, { type: 'nope', deviceIds: [DEVICE] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('run scheduled', () => {
    it('tách bạch bốn lý do im lặng thay vì chỉ đếm lượt bắn', async () => {
      const { service, runner } = setup();

      const result = await service.runScheduled(actor, { type: 'revenue' });

      expect(result).toMatchObject({
        type: 'revenue',
        firings: 3,
        notifications: 2,
        deliveries: 3,
        noRecipient: 1,
        duplicate: 1,
        failed: 0,
      });
      expect(result.details).toHaveLength(3);
      // `collect` KHÔNG được gọi thêm một lượt chỉ để đếm — số liệu lấy từ `run`.
      expect(revenueDefinition.collect).not.toHaveBeenCalled();
      expect(runner.run).toHaveBeenCalledTimes(1);
    });

    it('refuses an event-driven type', async () => {
      const { service, runner } = setup();

      await expect(service.runScheduled(actor, { type: 'invoice' })).rejects.toBeInstanceOf(BadRequestException);
      expect(runner.run).not.toHaveBeenCalled();
    });
  });
});
