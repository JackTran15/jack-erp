import { PersistInvoiceStep } from './persist-invoice.step';
import { InvoiceStatus } from '../../../entities/invoice.entity';
import { PromotionGiftMode } from '@erp/shared-interfaces';
import { CheckoutContext } from '../checkout-step';
import * as resolveLocations from '../../../services/resolve-branch-item-locations';

jest.mock('../../../services/resolve-branch-item-locations');
const resolveBranchItemLocations =
  resolveLocations.resolveBranchItemLocations as jest.Mock;

function ctx(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    actor: { userId: 'u1', organizationId: 'o1', branchId: 'b1', roles: [] },
    input: { invoiceId: 'inv-1', payments: [] },
    correlationId: 'corr-1',
    idempotencyKey: 'inv-1',
    dryRun: false,
    documentNumber: 'HD202608-00001',
    items: [],
    totals: {
      subtotal: 785000,
      manualDiscountAmount: 20000,
      promotionDiscount: 30000,
      pointsDiscountAmount: 0,
      depositAmount: 0,
      amountDue: 735000,
      totalPaid: 735000,
      remainder: 0,
      pointsEarned: 73,
      newStatus: InvoiceStatus.PAID,
    },
    ...overrides,
  };
}

function withManager(invoiceRepo: any) {
  return { getRepository: jest.fn(() => invoiceRepo) } as any;
}

describe('PersistInvoiceStep', () => {
  it('throws a plain Error when run outside a transaction', async () => {
    const step = new PersistInvoiceStep({} as any);
    await expect(step.execute(ctx())).rejects.toThrow(
      'persist-invoice ran outside a transaction',
    );
  });

  it('throws a plain Error when totals/invoice are missing', async () => {
    const manager = withManager({ save: jest.fn() });
    const step = new PersistInvoiceStep({} as any);
    await expect(
      step.execute(ctx({ manager, totals: undefined })),
    ).rejects.toThrow('persist-invoice ran before its prerequisite steps populated the context');
  });

  it('is a no-op on a replayed run', async () => {
    const invoiceRepo = { save: jest.fn() };
    const membershipCardService = { getPointBalanceForUpdate: jest.fn() };
    await new PersistInvoiceStep(membershipCardService as any).execute(
      ctx({ replayed: true, manager: withManager(invoiceRepo) }),
    );
    expect(invoiceRepo.save).not.toHaveBeenCalled();
  });

  it('writes every header field and combines manual + promotion discount', async () => {
    const invoiceRepo = { save: jest.fn((x: unknown) => x) };
    const membershipCardService = { getPointBalanceForUpdate: jest.fn() };
    const invoice: any = { id: 'inv-1', customerId: undefined, pointsRedeemed: 0 };
    const c = ctx({ invoice, manager: withManager(invoiceRepo) });

    await new PersistInvoiceStep(membershipCardService as any).execute(c);

    expect(invoice.isDraft).toBe(false);
    expect(invoice.status).toBe(InvoiceStatus.PAID);
    expect(invoice.code).toBe('HD202608-00001');
    expect(invoice.subtotal).toBe(785000);
    expect(invoice.discountAmount).toBe(50000); // 20000 + 30000
    expect(invoice.amountDue).toBe(735000);
    expect(invoice.totalPaid).toBe(735000);
    expect(invoice.pointsEarned).toBe(73);
    expect(invoice.issuedAt).toBeInstanceOf(Date);
    expect(invoiceRepo.save).toHaveBeenCalledWith(invoice);
  });

  it('projects pointsBalanceAfter from the locked card balance, redeemed and earned', async () => {
    const invoiceRepo = { save: jest.fn((x: unknown) => x) };
    const membershipCardService = {
      getPointBalanceForUpdate: jest.fn().mockResolvedValue(100),
    };
    const invoice: any = { id: 'inv-1', customerId: 'cust-1', pointsRedeemed: 20 };
    const c = ctx({ invoice, manager: withManager(invoiceRepo) });

    await new PersistInvoiceStep(membershipCardService as any).execute(c);

    expect(membershipCardService.getPointBalanceForUpdate).toHaveBeenCalledWith(
      'cust-1',
      c.manager,
      c.actor,
    );
    expect(invoice.pointsBalanceAfter).toBe(100 - 20 + 73); // 153
  });

  it('does not query the card, and leaves pointsBalanceAfter null, for a walk-in customer', async () => {
    const invoiceRepo = { save: jest.fn((x: unknown) => x) };
    const membershipCardService = { getPointBalanceForUpdate: jest.fn() };
    const invoice: any = { id: 'inv-1', customerId: undefined, pointsRedeemed: 0 };
    const c = ctx({ invoice, manager: withManager(invoiceRepo) });

    await new PersistInvoiceStep(membershipCardService as any).execute(c);

    expect(membershipCardService.getPointBalanceForUpdate).not.toHaveBeenCalled();
    expect(invoice.pointsBalanceAfter).toBeNull();
  });

  it('floors pointsBalanceAfter at 0, never negative', async () => {
    const invoiceRepo = { save: jest.fn((x: unknown) => x) };
    const membershipCardService = {
      getPointBalanceForUpdate: jest.fn().mockResolvedValue(10),
    };
    const invoice: any = { id: 'inv-1', customerId: 'cust-1', pointsRedeemed: 50 };
    const c = ctx({
      invoice,
      manager: withManager(invoiceRepo),
      totals: { ...ctx().totals!, pointsEarned: 0 },
    });

    await new PersistInvoiceStep(membershipCardService as any).execute(c);

    expect(invoice.pointsBalanceAfter).toBe(0); // 10 - 50 + 0 would be negative
  });

  describe('gift lines (T-04-04)', () => {
    function withGiftManager(opts: {
      invoiceRepo?: any;
      promotionRepo?: any;
      catalogItems?: any[];
    } = {}) {
      const invoiceRepo = opts.invoiceRepo ?? { save: jest.fn((x: unknown) => x) };
      const promotionRepo =
        opts.promotionRepo ?? { create: jest.fn((x: unknown) => x), save: jest.fn() };
      return {
        getRepository: jest.fn((entity: any) =>
          entity?.name === 'InvoiceCheckoutPromotionEntity' ? promotionRepo : invoiceRepo,
        ),
        findBy: jest.fn().mockResolvedValue(opts.catalogItems ?? []),
        create: jest.fn((_entity: any, data: any) => data),
        save: jest.fn((x: unknown) => x),
      } as any;
    }

    const giftProgram: any = {
      programId: 'prog-1',
      code: 'GIFT10',
      name: 'Tặng 1 sản phẩm',
      type: 'GIFT_ITEM',
      priority: 1,
      discountAmount: 0,
      lineDiscounts: [],
      gifts: [
        {
          itemId: 'gift-item-1',
          itemCode: 'GFT-1',
          itemName: 'Quà tặng 1',
          unit: 'cái',
          quantity: 1,
          unitPrice: 15000,
          mode: PromotionGiftMode.ALL_OF,
        },
      ],
    };

    beforeEach(() => {
      resolveBranchItemLocations.mockReset();
    });

    it('does nothing when no applied program has a gift', async () => {
      const manager = withGiftManager();
      const invoice: any = { id: 'inv-1', customerId: undefined, pointsRedeemed: 0 };
      const c = ctx({
        invoice,
        manager,
        promotion: { promotionDiscount: 0, appliedPrograms: [], lineDiscounts: [] },
      });

      await new PersistInvoiceStep({ getPointBalanceForUpdate: jest.fn() } as any).execute(c);

      expect(resolveBranchItemLocations).not.toHaveBeenCalled();
      expect(c.items).toHaveLength(0);
    });

    it('appends an is_gift=true line, unitPrice/lineTotal 0, resolved location, sortOrder after existing lines', async () => {
      resolveBranchItemLocations.mockResolvedValue(new Map([['gift-item-1', 'loc-1']]));
      const manager = withGiftManager({ catalogItems: [{ id: 'gift-item-1', purchasePrice: 8000 }] });
      const invoice: any = { id: 'inv-1', customerId: undefined, pointsRedeemed: 0 };
      const existingLine: any = { sortOrder: 2 };
      const c = ctx({
        invoice,
        manager,
        items: [existingLine],
        promotion: { promotionDiscount: 0, appliedPrograms: [giftProgram], lineDiscounts: [] },
      });

      await new PersistInvoiceStep({ getPointBalanceForUpdate: jest.fn() } as any).execute(c);

      expect(resolveBranchItemLocations).toHaveBeenCalledWith(
        manager,
        ['gift-item-1'],
        c.actor,
        { showroomOnly: true },
      );
      expect(c.items).toHaveLength(2);
      const giftLine = c.items![1];
      expect(giftLine).toMatchObject({
        itemId: 'gift-item-1',
        locationId: 'loc-1',
        itemCode: 'GFT-1',
        itemName: 'Quà tặng 1',
        unit: 'cái',
        quantity: 1,
        unitPrice: 0,
        unitPriceDefault: 15000,
        costPrice: 8000,
        lineTotal: 0,
        isGift: true,
        promotionProgramId: 'prog-1',
        sortOrder: 3, // after the existing line's sortOrder=2
      });
      expect(manager.save).toHaveBeenCalledWith([giftLine]);
    });

    it('honors only the first ONE_OF candidate per program, and keeps every ALL_OF gift', async () => {
      resolveBranchItemLocations.mockResolvedValue(
        new Map([
          ['gift-item-1', 'loc-1'],
          ['gift-a', 'loc-a'],
          ['gift-b', 'loc-b'],
        ]),
      );
      const manager = withGiftManager();
      const invoice: any = { id: 'inv-1', customerId: undefined, pointsRedeemed: 0 };
      const program: any = {
        ...giftProgram,
        gifts: [
          { ...giftProgram.gifts[0] }, // ALL_OF, always included
          {
            itemId: 'gift-a',
            itemCode: 'GFT-A',
            itemName: 'Quà A',
            unit: 'cái',
            quantity: 1,
            unitPrice: 10000,
            mode: PromotionGiftMode.ONE_OF,
          },
          {
            itemId: 'gift-b',
            itemCode: 'GFT-B',
            itemName: 'Quà B',
            unit: 'cái',
            quantity: 1,
            unitPrice: 20000,
            mode: PromotionGiftMode.ONE_OF,
          },
        ],
      };
      const c = ctx({
        invoice,
        manager,
        promotion: { promotionDiscount: 0, appliedPrograms: [program], lineDiscounts: [] },
      });

      await new PersistInvoiceStep({ getPointBalanceForUpdate: jest.fn() } as any).execute(c);

      expect(c.items!.map((i: any) => i.itemId)).toEqual(['gift-item-1', 'gift-a']);
    });

    it('throws GIFT_ITEM_NO_LOCATION and never saves anything when a gift item has no location in branch', async () => {
      resolveBranchItemLocations.mockResolvedValue(new Map());
      const manager = withGiftManager();
      const invoice: any = { id: 'inv-1', customerId: undefined, pointsRedeemed: 0 };
      const c = ctx({
        invoice,
        manager,
        promotion: { promotionDiscount: 0, appliedPrograms: [giftProgram], lineDiscounts: [] },
      });

      await expect(
        new PersistInvoiceStep({ getPointBalanceForUpdate: jest.fn() } as any).execute(c),
      ).rejects.toMatchObject({
        response: { code: 'GIFT_ITEM_NO_LOCATION' },
      });
      expect(manager.save).not.toHaveBeenCalled();
    });
  });

  describe('promotion snapshot (T-04-04)', () => {
    function withSnapshotManager(promotionRepo: any) {
      return {
        getRepository: jest.fn((entity: any) =>
          entity?.name === 'InvoiceCheckoutPromotionEntity'
            ? promotionRepo
            : { save: jest.fn((x: unknown) => x) },
        ),
        findBy: jest.fn().mockResolvedValue([]),
        create: jest.fn((_entity: any, data: any) => data),
        save: jest.fn((x: unknown) => x),
      } as any;
    }

    it('writes exactly one snapshot row per applied program, discount-only programs included', async () => {
      const promotionRepo = { create: jest.fn((x: unknown) => x), save: jest.fn() };
      const manager = withSnapshotManager(promotionRepo);
      const invoice: any = { id: 'inv-1', customerId: undefined, pointsRedeemed: 0 };
      const discountProgram: any = {
        programId: 'prog-2',
        code: 'SALE30',
        name: 'Giảm 30%',
        type: 'PERCENT_ORDER',
        priority: 1,
        discountAmount: 30000,
        lineDiscounts: [{ lineId: 'line-1', discountAmount: 30000, unitPriceAfter: 70000 }],
        gifts: [],
      };
      const c = ctx({
        invoice,
        manager,
        promotion: { promotionDiscount: 30000, appliedPrograms: [discountProgram], lineDiscounts: [] },
      });

      await new PersistInvoiceStep({ getPointBalanceForUpdate: jest.fn() } as any).execute(c);

      expect(promotionRepo.create).toHaveBeenCalledTimes(1);
      expect(promotionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          invoiceId: 'inv-1',
          programId: 'prog-2',
          code: 'SALE30',
          name: 'Giảm 30%',
          type: 'PERCENT_ORDER',
          priority: 1,
          discountAmount: 30000,
          lineDiscounts: discountProgram.lineDiscounts,
          gifts: [],
        }),
      );
      expect(promotionRepo.save).toHaveBeenCalledTimes(1);
    });

    it('writes no snapshot row when no program applied', async () => {
      const promotionRepo = { create: jest.fn(), save: jest.fn() };
      const manager = withSnapshotManager(promotionRepo);
      const invoice: any = { id: 'inv-1', customerId: undefined, pointsRedeemed: 0 };
      const c = ctx({ invoice, manager });

      await new PersistInvoiceStep({ getPointBalanceForUpdate: jest.fn() } as any).execute(c);

      expect(promotionRepo.create).not.toHaveBeenCalled();
      expect(promotionRepo.save).not.toHaveBeenCalled();
    });
  });
});
