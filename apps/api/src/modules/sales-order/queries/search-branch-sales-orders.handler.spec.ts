import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { CompareOperator, StringOperator } from '../../../common/filters/filter.dto';
import { UserEntity } from '../../auth/user.entity';
import { InvoiceDebtEntity } from '../../pos/entities/invoice-debt.entity';
import { InvoiceEntity, InvoiceStatus } from '../../pos/entities/invoice.entity';
import {
  BranchDeliveryOrderRow,
  BranchDeliveryTab,
  BranchSalesOrderDateField,
  BranchSalesOrderView,
  SearchBranchSalesOrdersDto,
} from '../dto/search-branch-sales-orders.dto';
import { DeliveryStatus, SalesOrderEntity, SalesOrderStatus } from '../entities/sales-order.entity';
import { DELIVERY_TRANSITIONS } from '../sales-order.constants';
import { SearchBranchSalesOrdersHandler } from './search-branch-sales-orders.handler';
import { SearchBranchSalesOrdersQuery } from './search-branch-sales-orders.query';

const CHANNEL_WEB = '11111111-1111-4111-8111-111111111111';

const actor: ActorContext = {
  userId: 'cashier-1',
  organizationId: 'org-1',
  branchId: 'branch-a',
  roles: [],
};

interface FakeQb {
  leftJoin: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  offset: jest.Mock;
  limit: jest.Mock;
  getManyAndCount: jest.Mock;
}

function makeQb(rows: unknown[], total: number): FakeQb {
  const qb: Partial<FakeQb> = {};
  const self = () => qb as FakeQb;
  Object.assign(qb, {
    leftJoin: jest.fn(self),
    where: jest.fn(self),
    andWhere: jest.fn(self),
    orderBy: jest.fn(self),
    addOrderBy: jest.fn(self),
    offset: jest.fn(self),
    limit: jest.fn(self),
    getManyAndCount: jest.fn().mockResolvedValue([rows, total]),
  });
  return qb as FakeQb;
}

function online(extra: Partial<SearchBranchSalesOrdersDto> = {}): SearchBranchSalesOrdersDto {
  return { view: BranchSalesOrderView.ONLINE, channelId: CHANNEL_WEB, ...extra };
}

function delivery(extra: Partial<SearchBranchSalesOrdersDto> = {}): SearchBranchSalesOrdersDto {
  return { view: BranchSalesOrderView.DELIVERY, ...extra };
}

/** The (predicate, params) pair whose predicate starts with `prefix`. */
function clause(qb: FakeQb, prefix: string): [string, Record<string, unknown>] {
  const call = qb.andWhere.mock.calls.find(
    (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).startsWith(prefix),
  );
  expect(call).toBeDefined();
  return call as [string, Record<string, unknown>];
}

function predicates(qb: FakeQb): string[] {
  return qb.andWhere.mock.calls.map((c: unknown[]) => c[0] as string);
}

describe('SearchBranchSalesOrdersHandler', () => {
  let handler: SearchBranchSalesOrdersHandler;
  let qb: FakeQb;
  let invoiceRepo: { find: jest.Mock };
  let managerFind: jest.Mock;

  async function build(
    rows: unknown[] = [],
    total = 0,
    invoices: unknown[] = [],
    debts: unknown[] = [],
    users: unknown[] = [],
  ) {
    qb = makeQb(rows, total);
    const repo = { createQueryBuilder: jest.fn(() => qb) };
    invoiceRepo = { find: jest.fn().mockResolvedValue(invoices) };
    managerFind = jest.fn((entity: unknown) =>
      Promise.resolve(entity === InvoiceDebtEntity ? debts : entity === UserEntity ? users : []),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchBranchSalesOrdersHandler,
        { provide: getRepositoryToken(SalesOrderEntity), useValue: repo },
        { provide: getRepositoryToken(InvoiceEntity), useValue: invoiceRepo },
        { provide: DataSource, useValue: { manager: { find: managerFind } } },
      ],
    }).compile();
    handler = module.get(SearchBranchSalesOrdersHandler);
  }

  describe('scope (AC-02, AC-03)', () => {
    it('scopes to organization + active branch + selected channel and excludes DRAFT', async () => {
      await build();
      await handler.execute(new SearchBranchSalesOrdersQuery(online(), actor));

      expect(qb.where).toHaveBeenCalledWith('so.organizationId = :orgId', { orgId: 'org-1' });
      // Other branch (SO-9) excluded: the branch is the actor's, not a body field.
      expect(qb.andWhere).toHaveBeenCalledWith('so.branchId = :branchId', { branchId: 'branch-a' });
      // DRAFT never appears, whatever the status tab.
      expect(qb.andWhere).toHaveBeenCalledWith('so.status != :draftStatus', {
        draftStatus: SalesOrderStatus.DRAFT,
      });
      // Other channel (SO-2) excluded.
      expect(qb.andWhere).toHaveBeenCalledWith('so.salesChannelId = :channelId', {
        channelId: CHANNEL_WEB,
      });
    });

    it('the invoice join carries organizationId in its ON clause', async () => {
      await build();
      await handler.execute(new SearchBranchSalesOrdersQuery(online(), actor));

      expect(qb.leftJoin).toHaveBeenCalledWith(
        InvoiceEntity,
        'inv',
        'inv.id = so.invoiceId AND inv.organizationId = so.organizationId',
      );
    });

    it('refuses to run without an active branch rather than dropping the branch predicate', async () => {
      await build();
      await expect(
        handler.execute(new SearchBranchSalesOrdersQuery(online(), { ...actor, branchId: undefined })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(qb.getManyAndCount).not.toHaveBeenCalled();
    });

    it('ONLINE without a channel is rejected with 400', async () => {
      await build();
      await expect(
        handler.execute(
          new SearchBranchSalesOrdersQuery({ view: BranchSalesOrderView.ONLINE }, actor),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('status + date (AC-03)', () => {
    it('status tab narrows to that status', async () => {
      await build();
      await handler.execute(
        new SearchBranchSalesOrdersQuery(online({ status: SalesOrderStatus.SENT }), actor),
      );
      expect(qb.andWhere).toHaveBeenCalledWith('so.status = :status', { status: SalesOrderStatus.SENT });
    });

    it('"Tất cả" (no status) adds no status equality, only the DRAFT exclusion', async () => {
      await build();
      await handler.execute(new SearchBranchSalesOrdersQuery(online(), actor));
      expect(predicates(qb)).not.toContain('so.status = :status');
    });

    it('"Hôm nay" is the Asia/Ho_Chi_Minh day: 23:30 VN is in, 00:30 VN next day is out', async () => {
      await build();
      await handler.execute(
        new SearchBranchSalesOrdersQuery(online({ from: '2026-09-24', to: '2026-09-24' }), actor),
      );

      const [, fromParams] = clause(qb, 'so.createdAt >=');
      const [, toParams] = clause(qb, 'so.createdAt <');
      const from = Object.values(fromParams)[0] as string;
      const to = Object.values(toParams)[0] as string;

      // 2026-09-24 00:00 VN = 2026-09-23 17:00Z; the window is half-open.
      expect(from).toBe('2026-09-23T17:00:00.000Z');
      expect(to).toBe('2026-09-24T17:00:00.000Z');

      const inWindow = (iso: string) => {
        const t = new Date(iso).getTime();
        return t >= new Date(from).getTime() && t < new Date(to).getTime();
      };
      // 23:30 VN on the 24th — still "today", though already 16:30Z.
      expect(inWindow('2026-09-24T23:30:00+07:00')).toBe(true);
      // 23:30 VN the day before — its UTC date is the 23rd too, but it is yesterday.
      expect(inWindow('2026-09-23T23:30:00+07:00')).toBe(false);
      // 00:30 VN on the 25th — its UTC date is the 24th, but it is tomorrow.
      expect(inWindow('2026-09-25T00:30:00+07:00')).toBe(false);
    });

    it('dateField DELIVERED / INVOICED move the window to delivered_at / invoice issued_at', async () => {
      await build();
      await handler.execute(
        new SearchBranchSalesOrdersQuery(
          online({ dateField: BranchSalesOrderDateField.DELIVERED, from: '2026-09-24' }),
          actor,
        ),
      );
      expect(clause(qb, 'so.deliveredAt >=')).toBeDefined();

      await build();
      await handler.execute(
        new SearchBranchSalesOrdersQuery(
          online({ dateField: BranchSalesOrderDateField.INVOICED, to: '2026-09-24' }),
          actor,
        ),
      );
      expect(clause(qb, 'inv.issuedAt <')).toBeDefined();
    });
  });

  describe('column filters (AC-04)', () => {
    it('`*` on Mã đơn hàng (OCM) is ILIKE %term% on external_order_id', async () => {
      await build();
      await handler.execute(
        new SearchBranchSalesOrdersQuery(
          online({ columnFilters: { externalOrderId: { operator: StringOperator.CONTAINS, value: 'abc' } } }),
          actor,
        ),
      );
      const [predicate, params] = clause(qb, 'so.externalOrderId ILIKE');
      expect(predicate).toMatch(/^so\.externalOrderId ILIKE :\w+$/);
      expect(Object.values(params)).toEqual(['%abc%']);
    });

    it('`<=` on Tổng thanh toán compares amount_due', async () => {
      await build();
      await handler.execute(
        new SearchBranchSalesOrdersQuery(
          online({ columnFilters: { amountDue: { operator: CompareOperator.LTE, value: 500000 } } }),
          actor,
        ),
      );
      const [predicate, params] = clause(qb, 'so.amountDue');
      expect(predicate).toMatch(/^so\.amountDue <= :\w+$/);
      expect(Object.values(params)).toEqual([500000]);
    });

    it('Thông tin giao hàng ORs one parenthesised predicate over every source column', async () => {
      await build();
      await handler.execute(
        new SearchBranchSalesOrdersQuery(
          online({ columnFilters: { deliveryInfo: { operator: StringOperator.CONTAINS, value: '0909' } } }),
          actor,
        ),
      );
      const [predicate, params] = clause(qb, '(so.recipientName');
      expect(predicate.startsWith('(') && predicate.endsWith(')')).toBe(true);
      expect(predicate.split(' OR ')).toHaveLength(5);
      for (const col of ['recipientPhone', 'shipAddressLine', 'shipWardName', 'shipProvinceName']) {
        expect(predicate).toContain(`so.${col} ILIKE :deliveryInfo`);
      }
      expect(params).toEqual({ deliveryInfo: '%0909%' });
    });

    it('`!` on Thông tin giao hàng must hold for every column (AND), NULL-safe', async () => {
      await build();
      await handler.execute(
        new SearchBranchSalesOrdersQuery(
          online({ columnFilters: { deliveryInfo: { operator: StringOperator.NOT_CONTAINS, value: 'x' } } }),
          actor,
        ),
      );
      const [predicate] = clause(qb, "(COALESCE(so.recipientName, '')");
      expect(predicate).not.toContain(' OR ');
      expect(predicate.split(' AND ')).toHaveLength(5);
    });

    it('maps the remaining columns to their sources', async () => {
      await build();
      await handler.execute(
        new SearchBranchSalesOrdersQuery(
          online({
            columnFilters: {
              orderDate: { from: '2026-09-01' },
              status: { value: SalesOrderStatus.PROCESSED },
              deliveryPartnerName: { operator: StringOperator.STARTS_WITH, value: 'GHN' },
              salespersonName: { operator: StringOperator.EQUALS, value: 'Lan' },
              invoiceCode: { operator: StringOperator.CONTAINS, value: 'HD' },
              note: { operator: StringOperator.ENDS_WITH, value: 'gấp' },
            },
          }),
          actor,
        ),
      );
      expect(Object.values(clause(qb, 'so.createdAt >=')[1])).toEqual(['2026-08-31T17:00:00.000Z']);
      expect(Object.values(clause(qb, 'so.status = :p_')[1])).toEqual([SalesOrderStatus.PROCESSED]);
      expect(Object.values(clause(qb, 'so.deliveryPartnerName ILIKE')[1])).toEqual(['GHN%']);
      expect(Object.values(clause(qb, 'so.salespersonName =')[1])).toEqual(['Lan']);
      expect(Object.values(clause(qb, 'inv.code ILIKE')[1])).toEqual(['%HD%']);
      expect(Object.values(clause(qb, 'so.note ILIKE')[1])).toEqual(['%gấp']);
    });

    it('paginates with offset/limit and returns total for "x-y/z kết quả"', async () => {
      await build([], 45);
      const result = await handler.execute(
        new SearchBranchSalesOrdersQuery(online({ page: 3, limit: 20 }), actor),
      );
      expect(qb.orderBy).toHaveBeenCalledWith('so.createdAt', 'DESC');
      expect(qb.offset).toHaveBeenCalledWith(40);
      expect(qb.limit).toHaveBeenCalledWith(20);
      expect(result).toEqual({ data: [], total: 45, page: 3, limit: 20 });
    });
  });

  describe('Nhãn "Thiếu hàng" (AC-05)', () => {
    it('stockShort filter narrows on stock_short', async () => {
      await build();
      await handler.execute(new SearchBranchSalesOrdersQuery(online({ stockShort: true }), actor));
      expect(qb.andWhere).toHaveBeenCalledWith('so.stockShort = :stockShort', { stockShort: true });
    });

    it('no stockShort filter when absent', async () => {
      await build();
      await handler.execute(new SearchBranchSalesOrdersQuery(online(), actor));
      expect(predicates(qb)).not.toContain('so.stockShort = :stockShort');
    });
  });

  describe('row shape (AC-02, AC-05)', () => {
    it('returns the 10 columns + id/status/stockShort, invoice code resolved org-scoped', async () => {
      const createdAt = new Date('2026-09-24T03:00:00Z');
      const so1 = {
        id: 'so-1',
        status: SalesOrderStatus.SENT,
        stockShort: true,
        externalOrderId: 'WEB-abc-1',
        createdAt,
        recipientName: 'Nguyễn A',
        recipientPhone: '0909000111',
        shipAddressLine: '1 Lê Lợi',
        shipWardName: 'Phường Bến Nghé',
        shipProvinceName: 'TP Hồ Chí Minh',
        amountDue: '450000.00',
        deliveryPartnerName: 'GHN',
        salespersonName: null,
        invoiceId: 'inv-1',
        note: 'Giao giờ hành chính',
        // Not part of the row.
        documentNumber: 'DT000001',
        organizationId: 'org-1',
      };
      await build([so1], 1, [{ id: 'inv-1', code: 'HD000123' }]);

      const result = await handler.execute(new SearchBranchSalesOrdersQuery(online(), actor));

      expect(invoiceRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
      );
      expect(result.data).toEqual([
        {
          id: 'so-1',
          status: SalesOrderStatus.SENT,
          stockShort: true,
          externalOrderId: 'WEB-abc-1',
          createdAt,
          recipientName: 'Nguyễn A',
          recipientPhone: '0909000111',
          shipAddressLine: '1 Lê Lợi',
          shipWardName: 'Phường Bến Nghé',
          shipProvinceName: 'TP Hồ Chí Minh',
          amountDue: 450000,
          deliveryPartnerName: 'GHN',
          salespersonName: null,
          invoiceId: 'inv-1',
          invoiceCode: 'HD000123',
          note: 'Giao giờ hành chính',
        },
      ]);
    });

    it('skips the invoice lookup when no row has an invoice', async () => {
      await build([{ id: 'so-2', invoiceId: null, amountDue: '0' }], 1);
      const result = await handler.execute(new SearchBranchSalesOrdersQuery(online(), actor));
      expect(invoiceRepo.find).not.toHaveBeenCalled();
      expect(result.data[0].invoiceCode).toBeNull();
    });
  });

  describe('DELIVERY view — scope (AC-12, AC-16)', () => {
    it('scopes to organization + active branch, lifecycle orders only, no DRAFT/channel predicate', async () => {
      await build();
      await handler.execute(new SearchBranchSalesOrdersQuery(delivery(), actor));

      expect(qb.where).toHaveBeenCalledWith('so.organizationId = :orgId', { orgId: 'org-1' });
      expect(qb.andWhere).toHaveBeenCalledWith('so.branchId = :branchId', { branchId: 'branch-a' });
      expect(qb.andWhere).toHaveBeenCalledWith('so.deliveryStatus IS NOT NULL');
      // "Tất cả": no tab predicate at all.
      expect(predicates(qb)).toEqual([
        'so.branchId = :branchId',
        'so.deliveryStatus IS NOT NULL',
      ]);
    });

    it('channelId is optional and narrows when given', async () => {
      await build();
      await handler.execute(new SearchBranchSalesOrdersQuery(delivery({ channelId: CHANNEL_WEB }), actor));
      expect(qb.andWhere).toHaveBeenCalledWith('so.salesChannelId = :channelId', { channelId: CHANNEL_WEB });
    });

    it('invoice and debt joins both carry organizationId in their ON clause', async () => {
      await build();
      await handler.execute(new SearchBranchSalesOrdersQuery(delivery(), actor));
      expect(qb.leftJoin).toHaveBeenCalledWith(
        InvoiceEntity,
        'inv',
        'inv.id = so.invoiceId AND inv.organizationId = so.organizationId',
      );
      expect(qb.leftJoin).toHaveBeenCalledWith(
        InvoiceDebtEntity,
        'debt',
        'debt.invoiceId = inv.id AND debt.organizationId = so.organizationId',
      );
    });

    it('SO-9 of another branch is excluded under every tab and every filter (AC-16)', async () => {
      const tabs: Array<BranchDeliveryTab | undefined> = [undefined, ...Object.values(BranchDeliveryTab)];
      for (const deliveryTab of tabs) {
        await build();
        await handler.execute(
          new SearchBranchSalesOrdersQuery(
            delivery({
              deliveryTab,
              dateField: BranchSalesOrderDateField.DELIVERED,
              from: '2026-09-18',
              stockShort: true,
              columnFilters: { trackingCode: { operator: StringOperator.CONTAINS, value: 'VD' } },
            }),
            actor,
          ),
        );
        expect(qb.where).toHaveBeenCalledWith('so.organizationId = :orgId', { orgId: 'org-1' });
        expect(qb.andWhere).toHaveBeenCalledWith('so.branchId = :branchId', { branchId: 'branch-a' });
        expect(qb.andWhere).toHaveBeenCalledWith('so.deliveryStatus IS NOT NULL');
      }
    });

    it('refuses to run without an active branch', async () => {
      await build();
      await expect(
        handler.execute(new SearchBranchSalesOrdersQuery(delivery(), { ...actor, branchId: undefined })),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(qb.getManyAndCount).not.toHaveBeenCalled();
    });
  });

  describe('DELIVERY view — tabs (AC-12, AC-13)', () => {
    const liveStatuses = [
      DeliveryStatus.AWAITING_PICKUP,
      DeliveryStatus.IN_TRANSIT,
      DeliveryStatus.AWAITING_COD,
      DeliveryStatus.COMPLETED,
      DeliveryStatus.FAILED,
    ];

    it.each(liveStatuses)('tab %s = that delivery status, cancelled orders excluded', async (status) => {
      await build();
      await handler.execute(
        new SearchBranchSalesOrdersQuery(delivery({ deliveryTab: status as unknown as BranchDeliveryTab }), actor),
      );
      expect(qb.andWhere).toHaveBeenCalledWith('so.deliveryStatus = :deliveryTab', { deliveryTab: status });
      expect(qb.andWhere).toHaveBeenCalledWith('so.status != :cancelledStatus', {
        cancelledStatus: SalesOrderStatus.CANCELLED,
      });
    });

    it('tab RETURNED keeps its orders although they are CANCELLED (ADR-04)', async () => {
      await build();
      await handler.execute(new SearchBranchSalesOrdersQuery(delivery({ deliveryTab: BranchDeliveryTab.RETURNED }), actor));
      expect(qb.andWhere).toHaveBeenCalledWith('so.deliveryStatus = :deliveryTab', {
        deliveryTab: DeliveryStatus.RETURNED,
      });
      expect(predicates(qb)).not.toContain('so.status != :cancelledStatus');
    });

    it('tab Đã huỷ = status CANCELLED among lifecycle orders', async () => {
      await build();
      await handler.execute(new SearchBranchSalesOrdersQuery(delivery({ deliveryTab: BranchDeliveryTab.CANCELLED }), actor));
      expect(qb.andWhere).toHaveBeenCalledWith('so.deliveryStatus IS NOT NULL');
      expect(qb.andWhere).toHaveBeenCalledWith('so.status = :cancelledStatus', {
        cancelledStatus: SalesOrderStatus.CANCELLED,
      });
      expect(predicates(qb)).not.toContain('so.deliveryStatus = :deliveryTab');
    });

    it('tab Đã thanh toán = invoice status paid, no delivery-status predicate (A-06)', async () => {
      await build();
      await handler.execute(new SearchBranchSalesOrdersQuery(delivery({ deliveryTab: BranchDeliveryTab.PAID }), actor));
      expect(qb.andWhere).toHaveBeenCalledWith('inv.status = :paidStatus', { paidStatus: InvoiceStatus.PAID });
      // So a COMPLETED order with a paid invoice sits in both tabs.
      expect(predicates(qb)).toEqual([
        'so.branchId = :branchId',
        'so.deliveryStatus IS NOT NULL',
        'inv.status = :paidStatus',
      ]);
    });

    it('tab Chưa thanh toán/Lưu tạm = live draft invoice OR debt/partial_debt, parenthesised (A-06)', async () => {
      await build();
      await handler.execute(new SearchBranchSalesOrdersQuery(delivery({ deliveryTab: BranchDeliveryTab.UNPAID }), actor));
      const [predicate, params] = clause(qb, '(inv.status != :invoiceCancelledStatus');
      expect(predicate).toBe(
        '(inv.status != :invoiceCancelledStatus AND (inv.isDraft = true OR inv.status IN (:...unpaidStatuses)))',
      );
      expect(params).toEqual({
        invoiceCancelledStatus: InvoiceStatus.CANCELLED,
        unpaidStatuses: [InvoiceStatus.DEBT, InvoiceStatus.PARTIAL_DEBT],
      });
      expect(predicates(qb)).not.toContain('so.deliveryStatus = :deliveryTab');
    });

    describe('web order cancelled after Nhận xử lý, before checkout (draft invoice cancelled, is_draft still true)', () => {
      /**
       * Evaluates the tab's invoice predicate — exactly as the handler emitted
       * it — against one non-null invoice row. Covers only the grammar these
       * two tabs use: `=`, `!=`, `IN (:...p)`, `AND`, `OR`, parentheses.
       */
      function matches(
        tab: BranchDeliveryTab,
        prefix: string,
        invoice: { isDraft: boolean; status: InvoiceStatus },
      ): boolean {
        const [sql, params] = clause(qb, prefix);
        const js = sql
          .replace(/inv\.status IN \(:\.\.\.(\w+)\)/g, (_, k: string) => `${JSON.stringify(params[k])}.includes(inv.status)`)
          .replace(/:(\w+)/g, (_, k: string) => JSON.stringify(params[k]))
          .replace(/ != /g, ' !== ')
          .replace(/ = /g, ' === ')
          .replace(/ AND /g, ' && ')
          .replace(/ OR /g, ' || ');
        expect(tab).toBeDefined();
        return new Function('inv', `return ${js};`)(invoice) as boolean;
      }
      const cancelledDraft = { isDraft: true, status: InvoiceStatus.CANCELLED };

      it('is NOT in Chưa thanh toán/Lưu tạm, while a live draft and a debt invoice are', async () => {
        await build();
        await handler.execute(new SearchBranchSalesOrdersQuery(delivery({ deliveryTab: BranchDeliveryTab.UNPAID }), actor));
        const prefix = '(inv.status != :invoiceCancelledStatus';
        expect(matches(BranchDeliveryTab.UNPAID, prefix, cancelledDraft)).toBe(false);
        expect(matches(BranchDeliveryTab.UNPAID, prefix, { isDraft: true, status: InvoiceStatus.DRAFT })).toBe(true);
        expect(matches(BranchDeliveryTab.UNPAID, prefix, { isDraft: false, status: InvoiceStatus.DEBT })).toBe(true);
        expect(matches(BranchDeliveryTab.UNPAID, prefix, { isDraft: false, status: InvoiceStatus.PARTIAL_DEBT })).toBe(true);
        expect(matches(BranchDeliveryTab.UNPAID, prefix, { isDraft: false, status: InvoiceStatus.PAID })).toBe(false);
      });

      it('is NOT in Đã thanh toán either (status = paid cannot match a cancelled invoice)', async () => {
        await build();
        await handler.execute(new SearchBranchSalesOrdersQuery(delivery({ deliveryTab: BranchDeliveryTab.PAID }), actor));
        expect(matches(BranchDeliveryTab.PAID, 'inv.status = :paidStatus', cancelledDraft)).toBe(false);
        expect(
          matches(BranchDeliveryTab.PAID, 'inv.status = :paidStatus', { isDraft: false, status: InvoiceStatus.CANCELLED }),
        ).toBe(false);
        expect(
          matches(BranchDeliveryTab.PAID, 'inv.status = :paidStatus', { isDraft: false, status: InvoiceStatus.PAID }),
        ).toBe(true);
      });
    });
  });

  describe('DELIVERY view — date type + label (AC-14)', () => {
    it('Ngày GH + "7 ngày gần đây" is a delivered_at window in Asia/Ho_Chi_Minh days', async () => {
      await build();
      await handler.execute(
        new SearchBranchSalesOrdersQuery(
          delivery({ dateField: BranchSalesOrderDateField.DELIVERED, from: '2026-09-18', to: '2026-09-24' }),
          actor,
        ),
      );
      const from = Object.values(clause(qb, 'so.deliveredAt >=')[1])[0] as string;
      const to = Object.values(clause(qb, 'so.deliveredAt <')[1])[0] as string;
      expect(from).toBe('2026-09-17T17:00:00.000Z');
      expect(to).toBe('2026-09-24T17:00:00.000Z');

      const inWindow = (iso: string) => {
        const t = new Date(iso).getTime();
        return t >= new Date(from).getTime() && t < new Date(to).getTime();
      };
      // 00:30 VN on the 18th (17:30Z on the 17th) is in; 23:30 VN on the 17th is out.
      expect(inWindow('2026-09-18T00:30:00+07:00')).toBe(true);
      expect(inWindow('2026-09-17T23:30:00+07:00')).toBe(false);
      // 23:30 VN on the 24th is in; 00:30 VN on the 25th (17:30Z on the 24th) is out.
      expect(inWindow('2026-09-24T23:30:00+07:00')).toBe(true);
      expect(inWindow('2026-09-25T00:30:00+07:00')).toBe(false);
      // The created_at window is not applied in its place.
      expect(predicates(qb).some((p) => p.startsWith('so.createdAt'))).toBe(false);
    });

    it('Ngày HĐ moves the window to invoice issued_at; default is created_at', async () => {
      await build();
      await handler.execute(
        new SearchBranchSalesOrdersQuery(delivery({ dateField: BranchSalesOrderDateField.INVOICED, from: '2026-09-24' }), actor),
      );
      expect(clause(qb, 'inv.issuedAt >=')).toBeDefined();

      await build();
      await handler.execute(new SearchBranchSalesOrdersQuery(delivery({ from: '2026-09-24' }), actor));
      expect(clause(qb, 'so.createdAt >=')).toBeDefined();
    });

    it('nhãn "Thiếu hàng" narrows on stock_short', async () => {
      await build();
      await handler.execute(new SearchBranchSalesOrdersQuery(delivery({ stockShort: true }), actor));
      expect(qb.andWhere).toHaveBeenCalledWith('so.stockShort = :stockShort', { stockShort: true });
    });
  });

  describe('DELIVERY view — column filters (AC-15)', () => {
    it('maps the delivery-only columns to their sources', async () => {
      await build();
      await handler.execute(
        new SearchBranchSalesOrdersQuery(
          delivery({
            columnFilters: {
              trackingCode: { operator: StringOperator.CONTAINS, value: 'VD123' },
              customerName: { operator: StringOperator.STARTS_WITH, value: 'Nguyễn' },
              packageInfo: { operator: StringOperator.CONTAINS, value: 'hộp' },
              salesChannel: { operator: StringOperator.EQUALS, value: 'Website' },
              deliveryStatus: { value: DeliveryStatus.IN_TRANSIT },
              deliveredAt: { from: '2026-09-24' },
              invoiceDate: { to: '2026-09-24' },
              shippingFeeCustomer: { operator: CompareOperator.GTE, value: 30000 },
              deposit: { operator: CompareOperator.GT, value: 0 },
              remainingReceivable: { operator: CompareOperator.LTE, value: 100000 },
              partnerShippingFee: { operator: CompareOperator.EQUALS, value: 20000 },
            },
          }),
          actor,
        ),
      );
      expect(Object.values(clause(qb, 'so.trackingCode ILIKE')[1])).toEqual(['%VD123%']);
      expect(Object.values(clause(qb, 'so.customerName ILIKE')[1])).toEqual(['Nguyễn%']);
      expect(Object.values(clause(qb, 'so.packageInfo ILIKE')[1])).toEqual(['%hộp%']);
      expect(Object.values(clause(qb, 'so.salesChannel =')[1])).toEqual(['Website']);
      expect(Object.values(clause(qb, 'so.deliveryStatus = :p_')[1])).toEqual([DeliveryStatus.IN_TRANSIT]);
      expect(Object.values(clause(qb, 'so.deliveredAt >=')[1])).toEqual(['2026-09-23T17:00:00.000Z']);
      expect(Object.values(clause(qb, 'inv.issuedAt <')[1])).toEqual(['2026-09-24T17:00:00.000Z']);
      expect(clause(qb, 'inv.shippingFeeAmount')[0]).toMatch(/^inv\.shippingFeeAmount >= :\w+$/);
      expect(clause(qb, 'inv.depositAmount')[0]).toMatch(/^inv\.depositAmount > :\w+$/);
      const [debtPredicate, debtParams] = clause(qb, 'COALESCE(debt.remainingAmount, 0)');
      expect(debtPredicate).toMatch(/^COALESCE\(debt\.remainingAmount, 0\) <= :\w+$/);
      expect(Object.values(debtParams)).toEqual([100000]);
      expect(clause(qb, 'so.partnerShippingFee')[0]).toMatch(/^so\.partnerShippingFee = :\w+$/);
    });

    it('the shared ONLINE columns still apply in DELIVERY', async () => {
      await build();
      await handler.execute(
        new SearchBranchSalesOrdersQuery(
          delivery({ columnFilters: { deliveryPartnerName: { operator: StringOperator.EQUALS, value: 'GHN' } } }),
          actor,
        ),
      );
      expect(Object.values(clause(qb, 'so.deliveryPartnerName =')[1])).toEqual(['GHN']);
    });

    it('ONLINE ignores the delivery-only columns and never joins invoice_debts', async () => {
      await build();
      await handler.execute(
        new SearchBranchSalesOrdersQuery(
          online({
            columnFilters: {
              trackingCode: { operator: StringOperator.CONTAINS, value: 'VD' },
              remainingReceivable: { operator: CompareOperator.LTE, value: 1 },
            },
          }),
          actor,
        ),
      );
      expect(predicates(qb).some((p) => p.includes('trackingCode') || p.includes('debt.'))).toBe(false);
      expect(qb.leftJoin).toHaveBeenCalledTimes(1);
    });
  });

  describe('DELIVERY view — row shape (AC-15)', () => {
    const createdAt = new Date('2026-09-20T03:00:00Z');
    const deliveredAt = new Date('2026-09-21T03:00:00Z');
    const issuedAt = new Date('2026-09-20T04:00:00Z');
    const baseOrder = {
      id: 'so-1',
      status: SalesOrderStatus.PROCESSED,
      stockShort: false,
      externalOrderId: 'WEB-1',
      createdAt,
      recipientName: 'Nguyễn A',
      recipientPhone: '0909000111',
      shipAddressLine: '1 Lê Lợi',
      shipWardName: 'Phường Bến Nghé',
      shipProvinceName: 'TP Hồ Chí Minh',
      amountDue: '480000.00',
      deliveryPartnerName: 'GHN',
      salespersonName: 'Lan',
      invoiceId: 'inv-1',
      note: null,
      deliveryStatus: DeliveryStatus.IN_TRANSIT,
      deliveredAt,
      approvedBy: 'user-cashier',
      customerName: 'Khách A',
      salesChannel: 'Website',
      trackingCode: 'VD123',
      packageInfo: '1 hộp',
      partnerShippingFee: '20000.00',
    };

    it('returns the 24 columns + action fields, with invoice/debt/cashier read once per page', async () => {
      await build(
        [baseOrder],
        1,
        [
          {
            id: 'inv-1',
            code: 'HD000123',
            issuedAt,
            isDraft: false,
            shippingFeeAmount: '30000.00',
            depositAmount: '50000.00',
          },
        ],
        [{ id: 'debt-1', invoiceId: 'inv-1', remainingAmount: '430000.00' }],
        [{ id: 'user-cashier', firstName: 'Trần', lastName: 'Bình' }],
      );

      const result = await handler.execute(new SearchBranchSalesOrdersQuery(delivery(), actor));

      expect(invoiceRepo.find).toHaveBeenCalledTimes(1);
      expect(invoiceRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
      );
      expect(managerFind).toHaveBeenCalledTimes(2);
      expect(managerFind).toHaveBeenCalledWith(
        InvoiceDebtEntity,
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
      );
      expect(managerFind).toHaveBeenCalledWith(
        UserEntity,
        expect.objectContaining({ where: expect.objectContaining({ organizationId: 'org-1' }) }),
      );

      const row: BranchDeliveryOrderRow = {
        id: 'so-1',
        status: SalesOrderStatus.PROCESSED,
        stockShort: false,
        externalOrderId: 'WEB-1',
        createdAt,
        recipientName: 'Nguyễn A',
        recipientPhone: '0909000111',
        shipAddressLine: '1 Lê Lợi',
        shipWardName: 'Phường Bến Nghé',
        shipProvinceName: 'TP Hồ Chí Minh',
        amountDue: 480000,
        deliveryPartnerName: 'GHN',
        salespersonName: 'Lan',
        invoiceId: 'inv-1',
        invoiceCode: 'HD000123',
        note: null,
        deliveryStatus: DeliveryStatus.IN_TRANSIT,
        allowedNextStatuses: [DeliveryStatus.AWAITING_COD, DeliveryStatus.FAILED, DeliveryStatus.COMPLETED],
        deliveredAt,
        invoiceDate: issuedAt,
        invoiceIsDraft: false,
        cashierName: 'Trần Bình',
        customerName: 'Khách A',
        salesChannel: 'Website',
        orderType: 'ORDER',
        trackingCode: 'VD123',
        packageInfo: '1 hộp',
        shippingFeeCustomer: 30000,
        deposit: 50000,
        customerDebt: 430000,
        remainingReceivable: 430000,
        cod: 0,
        partnerShippingFee: 20000,
        debtId: 'debt-1',
      };
      expect(result.data).toEqual([row]);
    });

    it('keeps a NULL partner fee NULL, and a debt-free order owes 0', async () => {
      await build(
        [{ ...baseOrder, partnerShippingFee: null, approvedBy: null }],
        1,
        [{ id: 'inv-1', code: 'HD1', issuedAt: null, isDraft: true, shippingFeeAmount: '0', depositAmount: '0' }],
      );
      const [row] = (await handler.execute(new SearchBranchSalesOrdersQuery(delivery(), actor)))
        .data as BranchDeliveryOrderRow[];
      expect(row.partnerShippingFee).toBeNull();
      expect(row.customerDebt).toBe(0);
      expect(row.remainingReceivable).toBe(0);
      expect(row.debtId).toBeNull();
      expect(row.invoiceIsDraft).toBe(true);
      expect(row.cashierName).toBeNull();
      // No approver on the page → no users read.
      expect(managerFind).not.toHaveBeenCalledWith(UserEntity, expect.anything());
    });

    it.each(Object.values(DeliveryStatus))('allowedNextStatuses for %s is DELIVERY_TRANSITIONS', async (status) => {
      await build([{ ...baseOrder, deliveryStatus: status }], 1);
      const [row] = (await handler.execute(new SearchBranchSalesOrdersQuery(delivery(), actor)))
        .data as BranchDeliveryOrderRow[];
      expect(row.allowedNextStatuses).toEqual([...DELIVERY_TRANSITIONS[status]]);
    });

    it('a cancelled order offers no next status', async () => {
      await build([{ ...baseOrder, status: SalesOrderStatus.CANCELLED, deliveryStatus: DeliveryStatus.FAILED }], 1);
      const [row] = (await handler.execute(new SearchBranchSalesOrdersQuery(delivery(), actor)))
        .data as BranchDeliveryOrderRow[];
      expect(row.allowedNextStatuses).toEqual([]);
    });

    it('an order without an invoice skips every invoice-keyed lookup', async () => {
      await build([{ ...baseOrder, invoiceId: null, approvedBy: null }], 1);
      const [row] = (await handler.execute(new SearchBranchSalesOrdersQuery(delivery(), actor)))
        .data as BranchDeliveryOrderRow[];
      expect(invoiceRepo.find).not.toHaveBeenCalled();
      expect(managerFind).not.toHaveBeenCalled();
      expect(row.invoiceCode).toBeNull();
      expect(row.invoiceIsDraft).toBeNull();
      expect(row.shippingFeeCustomer).toBe(0);
    });
  });

  describe('SearchBranchSalesOrdersDto validation', () => {
    const check = (body: object) =>
      validate(plainToInstance(SearchBranchSalesOrdersDto, body), {
        whitelist: true,
        forbidNonWhitelisted: true,
      });

    it('accepts an ONLINE body with column filters', async () => {
      const errors = await check({
        view: 'ONLINE',
        channelId: CHANNEL_WEB,
        status: 'SENT',
        from: '2026-09-24',
        to: '2026-09-24',
        stockShort: true,
        columnFilters: {
          externalOrderId: { operator: '*', value: 'abc' },
          amountDue: { operator: '<=', value: 500000 },
        },
        page: 1,
        limit: 100,
      });
      expect(errors).toEqual([]);
    });

    it('rejects a branchId in the body', async () => {
      const errors = await check({ view: 'ONLINE', channelId: CHANNEL_WEB, branchId: 'branch-b' });
      expect(errors.map((e) => e.property)).toContain('branchId');
    });

    it('rejects limit > 100', async () => {
      const errors = await check({ view: 'ONLINE', channelId: CHANNEL_WEB, limit: 101 });
      expect(errors.map((e) => e.property)).toContain('limit');
    });

    it('accepts a DELIVERY body without channelId, with a tab and delivery column filters', async () => {
      const errors = await check({
        view: 'DELIVERY',
        deliveryTab: 'UNPAID',
        dateField: 'DELIVERED',
        from: '2026-09-18',
        columnFilters: {
          trackingCode: { operator: '*', value: 'VD' },
          remainingReceivable: { operator: '<=', value: 0 },
        },
        limit: 100,
      });
      expect(errors).toEqual([]);
    });

    it('rejects an unknown deliveryTab', async () => {
      const errors = await check({ view: 'DELIVERY', deliveryTab: 'SHIPPED' });
      expect(errors.map((e) => e.property)).toContain('deliveryTab');
    });

    it('requires channelId for ONLINE', async () => {
      const errors = await check({ view: 'ONLINE' });
      expect(errors.map((e) => e.property)).toContain('channelId');
    });
  });
});
