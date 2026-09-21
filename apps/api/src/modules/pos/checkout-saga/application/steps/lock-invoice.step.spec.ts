import { ConflictException } from '@nestjs/common';
import { LockInvoiceStep } from './lock-invoice.step';
import { InvoiceStatus } from '../../../entities/invoice.entity';
import { CheckoutContext } from '../checkout-step';

function ctx(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    actor: { userId: 'u1', organizationId: 'o1', roles: [] },
    input: { invoiceId: 'inv-1', payments: [] },
    correlationId: 'corr-1',
    idempotencyKey: 'inv-1',
    dryRun: false,
    ...overrides,
  };
}

function withManager(getOne: jest.Mock) {
  const qb = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne,
  };
  return { createQueryBuilder: jest.fn(() => qb) } as any;
}

describe('LockInvoiceStep', () => {
  it('throws a plain Error when run outside a transaction', async () => {
    await expect(new LockInvoiceStep().execute(ctx())).rejects.toThrow(
      'lock-invoice ran outside a transaction',
    );
  });

  it('is a no-op on a replayed run — nothing left to lock', async () => {
    const getOne = jest.fn();
    const manager = withManager(getOne);
    await new LockInvoiceStep().execute(ctx({ replayed: true, manager }));
    expect(getOne).not.toHaveBeenCalled();
  });

  it('locks the row with pessimistic_write and re-assigns ctx.invoice on a valid draft', async () => {
    const locked = { id: 'inv-1', isDraft: true, status: InvoiceStatus.DRAFT };
    const getOne = jest.fn().mockResolvedValue(locked);
    const manager = withManager(getOne);
    const qb = manager.createQueryBuilder();

    const c = ctx({ manager });
    await new LockInvoiceStep().execute(c);

    expect(qb.setLock).toHaveBeenCalledWith('pessimistic_write');
    expect(c.invoice).toBe(locked);
  });

  // Regression: clamp-points (preflight) lowers pointsRedeemed/pointsDiscountAmount
  // on the in-memory draft; this step then swaps ctx.invoice for a fresh DB row
  // that still holds the requested (unclamped) numbers. persist-invoice and
  // redeem-points read ctx.invoice, so without carrying the clamp across, the
  // card was debited — and the invoice stored — the full requested points
  // while amountDue had been computed from the clamped ones.
  it('keeps the points clamp-points already applied when swapping in the locked row', async () => {
    const locked = {
      id: 'inv-1',
      isDraft: true,
      status: InvoiceStatus.DRAFT,
      customerId: 'cus-1',
      pointsRedeemed: 1000,
      pointsDiscountAmount: 500_000,
    };
    const manager = withManager(jest.fn().mockResolvedValue(locked));
    const preflightInvoice = { ...locked, pointsRedeemed: 928, pointsDiscountAmount: 464_000 };

    const c = ctx({ manager, invoice: preflightInvoice as any });
    await new LockInvoiceStep().execute(c);

    expect(c.invoice).toBe(locked);
    expect(c.invoice!.pointsRedeemed).toBe(928);
    expect(c.invoice!.pointsDiscountAmount).toBe(464_000);
  });

  it('leaves the locked row points untouched when no preflight invoice is on the context', async () => {
    const locked = {
      id: 'inv-1',
      isDraft: true,
      status: InvoiceStatus.DRAFT,
      pointsRedeemed: 10,
      pointsDiscountAmount: 5_000,
    };
    const manager = withManager(jest.fn().mockResolvedValue(locked));

    const c = ctx({ manager });
    await new LockInvoiceStep().execute(c);

    expect(c.invoice!.pointsRedeemed).toBe(10);
    expect(c.invoice!.pointsDiscountAmount).toBe(5_000);
  });

  it('rejects with 409 INVOICE_NOT_CHECKOUTABLE when the row is gone', async () => {
    const manager = withManager(jest.fn().mockResolvedValue(null));
    await expect(new LockInvoiceStep().execute(ctx({ manager }))).rejects.toMatchObject({
      response: { code: 'INVOICE_NOT_CHECKOUTABLE' },
    });
  });

  it('rejects with 409 INVOICE_NOT_CHECKOUTABLE when another request already checked it out', async () => {
    const manager = withManager(
      jest.fn().mockResolvedValue({ id: 'inv-1', isDraft: false, status: InvoiceStatus.PAID }),
    );
    const err = await new LockInvoiceStep().execute(ctx({ manager })).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getResponse()).toMatchObject({ code: 'INVOICE_NOT_CHECKOUTABLE' });
  });
});
