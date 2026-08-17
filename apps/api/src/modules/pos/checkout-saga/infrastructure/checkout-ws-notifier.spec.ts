import { CheckoutWsNotifier } from './checkout-ws-notifier';
import { CheckoutContext } from '../application/checkout-step';

function ctx(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    actor: { userId: 'u1', organizationId: 'o1', branchId: 'b1', roles: [] },
    input: { invoiceId: 'inv-1', payments: [] },
    correlationId: 'corr-1',
    idempotencyKey: 'inv-1',
    dryRun: false,
    ...overrides,
  };
}

describe('CheckoutWsNotifier', () => {
  it('does nothing when ctx.wsNotification is unset', () => {
    const wsEmitter = { emitToBranch: jest.fn() };
    new CheckoutWsNotifier(wsEmitter as any).emit(ctx());
    expect(wsEmitter.emitToBranch).not.toHaveBeenCalled();
  });

  it('does nothing when the actor has no branchId, even if a notification is set', () => {
    const wsEmitter = { emitToBranch: jest.fn() };
    const notification = { eventType: 'POS_CHECKOUT_ACKNOWLEDGED' } as any;
    new CheckoutWsNotifier(wsEmitter as any).emit(
      ctx({ actor: { userId: 'u1', organizationId: 'o1', roles: [] }, wsNotification: notification }),
    );
    expect(wsEmitter.emitToBranch).not.toHaveBeenCalled();
  });

  it('forwards the notification to emitToBranch for the checkout actor branch', () => {
    const wsEmitter = { emitToBranch: jest.fn() };
    const notification = { eventType: 'POS_CHECKOUT_ACKNOWLEDGED', payload: { invoiceId: 'inv-1' } } as any;
    new CheckoutWsNotifier(wsEmitter as any).emit(ctx({ wsNotification: notification }));
    expect(wsEmitter.emitToBranch).toHaveBeenCalledWith('b1', notification);
  });
});
