import { PUSH_TEMPLATES } from '../../templates';
import { TemplateRenderer } from '../templates/template-renderer.service';
import { FcmPushChannel } from './fcm-push.channel';
import type { DeliveryJob } from './notification-channel.interface';

const job = (overrides: Partial<DeliveryJob> = {}): DeliveryJob => ({
  deliveryId: 'd1',
  notificationId: 'n1',
  organizationId: 'org',
  userId: 'u1',
  type: 'invoice',
  data: { actor: 'A', code: 'HD1', amount: 1000, store: 'S' },
  target: { type: 'invoice', id: 'inv-1' },
  priority: 'high',
  device: { id: 'dev-1', fcmToken: 'token-abcdefgh', platform: 'ios', locale: 'vi' },
  unreadCount: 3,
  ttlSeconds: 3600,
  ...overrides,
});

const error = (code: string, message = code) => Object.assign(new Error(message), { code });

function setup(send: jest.Mock | null) {
  const firebase = { getMessaging: () => (send ? { send } : null) };
  return new FcmPushChannel(firebase as any, new TemplateRenderer(PUSH_TEMPLATES));
}

describe('FcmPushChannel', () => {
  it('sends notification + flat string data + platform blocks', async () => {
    const send = jest.fn().mockResolvedValue('projects/p/messages/1');
    const result = await setup(send).deliver(job());

    expect(result).toEqual({ outcome: 'sent', providerMessageId: 'projects/p/messages/1' });
    const message = send.mock.calls[0][0];
    expect(message.token).toBe('token-abcdefgh');
    expect(message.notification.title).toBe('Hoá đơn mới HD1');
    expect(message.data).toEqual({
      notificationId: 'n1',
      type: 'invoice',
      organizationId: 'org',
      targetType: 'invoice',
      targetId: 'inv-1',
      targetSlug: '',
      targetBranchId: '',
      v: '1',
    });
    for (const value of Object.values(message.data)) expect(typeof value).toBe('string');
    expect(message.android.notification.channelId).toBe('erp_documents');
    expect(message.android.notification.tag).toBe('n1');
    expect(message.apns.payload.aps.badge).toBe(3);
    expect(message.apns.headers['apns-priority']).toBe('10');
  });

  it('normal priority goes to the daily channel', async () => {
    const send = jest.fn().mockResolvedValue('id');
    await setup(send).deliver(job({ priority: 'normal' }));
    expect(send.mock.calls[0][0].android.notification.channelId).toBe('erp_daily');
    expect(send.mock.calls[0][0].apns.headers['apns-priority']).toBe('5');
  });

  it('retries (does not drop) when Firebase is not configured', async () => {
    await expect(setup(null).deliver(job())).resolves.toEqual({ outcome: 'retry', error: 'firebase-not-configured' });
  });

  it.each([
    ['messaging/registration-token-not-registered', { outcome: 'drop', revokeDevice: true }],
    ['messaging/invalid-registration-token', { outcome: 'drop', revokeDevice: true }],
    ['messaging/unavailable', { outcome: 'retry' }],
    ['messaging/third-party-auth-error', { outcome: 'retry' }],
    ['messaging/invalid-argument', { outcome: 'drop' }],
  ])('classifies %s', async (code, expected) => {
    const send = jest.fn().mockRejectedValue(error(code, 'payload rejected'));
    const result = await setup(send).deliver(job());
    expect(result).toMatchObject(expected);
    if (!('revokeDevice' in expected)) expect((result as any).revokeDevice).toBeFalsy();
  });

  it('invalid-argument about the token revokes the device', async () => {
    const send = jest.fn().mockRejectedValue(error('messaging/invalid-argument', 'The registration token is not valid'));
    await expect(setup(send).deliver(job())).resolves.toMatchObject({ outcome: 'drop', revokeDevice: true });
  });
});
