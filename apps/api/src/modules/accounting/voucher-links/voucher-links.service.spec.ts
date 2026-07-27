import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { VoucherLinkEntity } from './voucher-link.entity';
import { VoucherLinkKind, VoucherLinkRelation } from './enums';
import { VoucherLinksService } from './voucher-links.service';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

const linkArgs = {
  fromKind: VoucherLinkKind.CASH_RECEIPT,
  fromId: 'receipt-1',
  toKind: VoucherLinkKind.CASH_PAYMENT,
  toId: 'payment-1',
  relation: VoucherLinkRelation.REFUNDED_BY,
  invoiceId: 'inv-1',
  actor,
};

describe('VoucherLinksService', () => {
  let service: VoucherLinksService;
  let repo: { findOne: jest.Mock };
  let manager: {
    createQueryBuilder: jest.Mock;
    findOneOrFail: jest.Mock;
    getRepository: jest.Mock;
  };
  let insertBuilder: Record<string, jest.Mock>;

  beforeEach(async () => {
    insertBuilder = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ identifiers: [] }),
    };
    repo = { findOne: jest.fn().mockResolvedValue(null) };
    manager = {
      createQueryBuilder: jest.fn().mockReturnValue(insertBuilder),
      findOneOrFail: jest
        .fn()
        .mockResolvedValue({ id: 'link-1' } as VoucherLinkEntity),
      getRepository: jest.fn().mockReturnValue(repo),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VoucherLinksService,
        { provide: getRepositoryToken(VoucherLinkEntity), useValue: repo },
      ],
    }).compile();

    service = module.get(VoucherLinksService);
  });

  describe('link', () => {
    it('inserts the pair scoped to the actor organisation', async () => {
      await service.link(linkArgs, manager as unknown as EntityManager);

      expect(insertBuilder.values).toHaveBeenCalledWith(
        expect.objectContaining({
          fromKind: VoucherLinkKind.CASH_RECEIPT,
          fromId: 'receipt-1',
          toKind: VoucherLinkKind.CASH_PAYMENT,
          toId: 'payment-1',
          relation: VoucherLinkRelation.REFUNDED_BY,
          invoiceId: 'inv-1',
          organizationId: 'org-1',
          branchId: 'branch-1',
          createdBy: 'user-1',
        }),
      );
    });

    it('ignores a duplicate instead of throwing, so a replay is a no-op', async () => {
      await service.link(linkArgs, manager as unknown as EntityManager);
      await service.link(linkArgs, manager as unknown as EntityManager);

      expect(insertBuilder.orIgnore).toHaveBeenCalledTimes(2);
      expect(insertBuilder.execute).toHaveBeenCalledTimes(2);
    });

    it('returns the existing row on a replay, when the insert wrote nothing', async () => {
      insertBuilder.execute.mockResolvedValue({ identifiers: [] });
      manager.findOneOrFail.mockResolvedValue({
        id: 'link-existing',
      } as VoucherLinkEntity);

      const result = await service.link(
        linkArgs,
        manager as unknown as EntityManager,
      );

      expect(result.id).toBe('link-existing');
    });

    it('writes through the caller transaction, not its own repository', async () => {
      await service.link(linkArgs, manager as unknown as EntityManager);

      expect(manager.createQueryBuilder).toHaveBeenCalled();
      expect(repo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('findFor', () => {
    it('finds a link from the "from" side', async () => {
      repo.findOne.mockResolvedValueOnce({
        id: 'link-1',
        toKind: VoucherLinkKind.CASH_PAYMENT,
        toId: 'payment-1',
      });

      const result = await service.findFor(
        VoucherLinkKind.CASH_RECEIPT,
        'receipt-1',
        'org-1',
      );

      expect(result).toEqual(
        expect.objectContaining({
          counterpartKind: VoucherLinkKind.CASH_PAYMENT,
          counterpartId: 'payment-1',
        }),
      );
    });

    it('finds the same link from the "to" side and flips the counterpart', async () => {
      repo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'link-1',
          fromKind: VoucherLinkKind.CASH_RECEIPT,
          fromId: 'receipt-1',
        });

      const result = await service.findFor(
        VoucherLinkKind.CASH_PAYMENT,
        'payment-1',
        'org-1',
      );

      expect(result).toEqual(
        expect.objectContaining({
          counterpartKind: VoucherLinkKind.CASH_RECEIPT,
          counterpartId: 'receipt-1',
        }),
      );
    });

    it('returns null when the voucher has no link', async () => {
      const result = await service.findFor(
        VoucherLinkKind.CASH_PAYMENT,
        'payment-x',
        'org-1',
      );

      expect(result).toBeNull();
    });

    it('scopes every lookup by organisation', async () => {
      await service.findFor(VoucherLinkKind.CASH_RECEIPT, 'receipt-1', 'org-2');

      for (const call of repo.findOne.mock.calls) {
        expect(call[0].where).toEqual(
          expect.objectContaining({ organizationId: 'org-2' }),
        );
      }
    });
  });
});
