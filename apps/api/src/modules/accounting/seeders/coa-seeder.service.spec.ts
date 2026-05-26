import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AccountType } from '@erp/shared-interfaces';
import { CoaSeederService, DEFAULT_COA } from './coa-seeder.service';
import { AccountEntity } from '../coa/account.entity';

describe('CoaSeederService', () => {
  let service: CoaSeederService;
  let accountRepo: {
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
  };

  beforeEach(async () => {
    let idCounter = 0;
    accountRepo = {
      count: jest.fn(),
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn((entity) =>
        Promise.resolve({ ...entity, id: `acc-${++idCounter}` }),
      ),
      // Idempotent top-up reads existing codes; default: all root codes present.
      find: jest.fn().mockResolvedValue(
        DEFAULT_COA.filter((a) => !a.parent).map((a) => ({ code: a.code })),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoaSeederService,
        { provide: getRepositoryToken(AccountEntity), useValue: accountRepo },
      ],
    }).compile();

    service = module.get(CoaSeederService);
  });

  describe('seedForOrganization', () => {
    it('returns 0 and skips when org already has accounts', async () => {
      accountRepo.count.mockResolvedValue(5);

      const created = await service.seedForOrganization('org-1', 'user-1');

      expect(created).toBe(0);
      expect(accountRepo.save).not.toHaveBeenCalled();
    });

    it('seeds all default accounts in two passes (roots then children)', async () => {
      accountRepo.count.mockResolvedValue(0);

      const created = await service.seedForOrganization('org-new', 'user-1');

      expect(created).toBe(DEFAULT_COA.length);
      expect(accountRepo.save).toHaveBeenCalledTimes(DEFAULT_COA.length);

      const savedDtos = accountRepo.save.mock.calls.map((c) => c[0]);
      const codes = savedDtos.map((a: any) => a.code);
      expect(codes).toContain('111');
      expect(codes).toContain('1111');
      expect(codes).toContain('511');
    });

    it('sets parentAccountId for child accounts', async () => {
      accountRepo.count.mockResolvedValue(0);

      await service.seedForOrganization('org-new', 'user-1');

      const child1111 = accountRepo.save.mock.calls
        .map((c) => c[0])
        .find((a: any) => a.code === '1111');
      expect(child1111).toBeDefined();
      expect(child1111.parentAccountId).toMatch(/^acc-/);
    });

    it('uses correct AccountType for each entry', async () => {
      accountRepo.count.mockResolvedValue(0);

      await service.seedForOrganization('org-new', 'user-1');

      const all = accountRepo.create.mock.calls.map((c) => c[0]);
      const types = new Set(all.map((a: any) => a.type));
      expect(types.has(AccountType.ASSET)).toBe(true);
      expect(types.has(AccountType.LIABILITY)).toBe(true);
      expect(types.has(AccountType.EQUITY)).toBe(true);
      expect(types.has(AccountType.REVENUE)).toBe(true);
      expect(types.has(AccountType.EXPENSE)).toBe(true);
    });
  });
});
