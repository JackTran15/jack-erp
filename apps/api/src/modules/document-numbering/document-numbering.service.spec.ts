import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { DocumentType } from '@erp/shared-interfaces';
import {
  DocumentNumberRuleEntity,
  ResetPolicy,
} from './document-number-rule.entity';
import { DocumentNumberCounterEntity } from './document-number-counter.entity';
import { DocumentNumberingService } from './document-numbering.service';
import { ActorContext } from '../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: ['admin'],
};

const ruleStub = (overrides: Partial<DocumentNumberRuleEntity> = {}): DocumentNumberRuleEntity =>
  ({
    id: 'rule-1',
    organizationId: 'org-1',
    branchId: undefined,
    documentType: DocumentType.INVOICE,
    prefix: 'INV',
    suffix: undefined,
    includeDate: true,
    dateFormat: 'YYYYMMDD',
    sequenceLength: 5,
    resetPolicy: ResetPolicy.NEVER,
    isActive: true,
    createdBy: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as DocumentNumberRuleEntity;

describe('DocumentNumberingService', () => {
  let service: DocumentNumberingService;
  let ruleRepo: {
    findOne: jest.Mock;
    findAndCount: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let counterRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let dataSource: {
    transaction: jest.Mock;
  };

  beforeEach(async () => {
    ruleRepo = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      create: jest.fn((dto) => ({ id: 'rule-new', ...dto })),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };
    counterRepo = {
      findOne: jest.fn(),
      create: jest.fn((dto) => ({ id: 'counter-new', ...dto })),
      save: jest.fn((entity) => Promise.resolve(entity)),
    };

    dataSource = {
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentNumberingService,
        { provide: getRepositoryToken(DocumentNumberRuleEntity), useValue: ruleRepo },
        { provide: getRepositoryToken(DocumentNumberCounterEntity), useValue: counterRepo },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get(DocumentNumberingService);
  });

  // =========================================================================
  // generate
  // =========================================================================
  describe('generate', () => {
    it('formats number correctly with prefix + date + padded sequence', async () => {
      const rule = ruleStub({
        prefix: 'INV',
        includeDate: true,
        dateFormat: 'YYYYMMDD',
        sequenceLength: 5,
        resetPolicy: ResetPolicy.NEVER,
      });

      // branchId=undefined skips branch lookup; single findOne for org-level
      ruleRepo.findOne.mockResolvedValueOnce(rule);

      const mockCounterRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((dto: any) => ({ id: 'counter-1', ...dto })),
        save: jest.fn((entity: any) => Promise.resolve(entity)),
      };

      dataSource.transaction.mockImplementation(
        async (_isolation: string, work: (manager: any) => Promise<any>) => {
          return work({
            getRepository: () => mockCounterRepo,
          });
        },
      );

      const result = await service.generate(DocumentType.INVOICE, undefined, actor);

      const now = new Date();
      const year = now.getFullYear().toString();
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const day = now.getDate().toString().padStart(2, '0');
      const expectedDate = `${year}${month}${day}`;

      expect(result).toBe(`INV-${expectedDate}-00001`);
    });

    it('branch-level rule takes precedence over org-level', async () => {
      const branchRule = ruleStub({
        id: 'rule-branch',
        branchId: 'branch-1',
        prefix: 'BR-INV',
      });

      ruleRepo.findOne.mockResolvedValueOnce(branchRule);

      const mockCounterRepo = {
        findOne: jest.fn().mockResolvedValue({
          ruleId: 'rule-branch',
          resetKey: 'NEVER',
          currentValue: 41,
        }),
        create: jest.fn(),
        save: jest.fn((entity: any) => Promise.resolve(entity)),
      };

      dataSource.transaction.mockImplementation(
        async (_isolation: string, work: (manager: any) => Promise<any>) => {
          return work({
            getRepository: () => mockCounterRepo,
          });
        },
      );

      const result = await service.generate(
        DocumentType.INVOICE,
        'branch-1',
        actor,
      );

      expect(result).toMatch(/^BR-INV-/);
      expect(ruleRepo.findOne).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException when no active rule exists', async () => {
      ruleRepo.findOne.mockResolvedValue(null);
      ruleRepo.save.mockRejectedValueOnce(new Error('unique_constraint'));

      await expect(
        service.generate(DocumentType.INVOICE, undefined, actor),
      ).rejects.toThrow(NotFoundException);
    });

    it('auto-creates a continuous WAREHOUSE rule and formats as WHxxxxxx', async () => {
      // No rule yet -> ensureDefaultActiveRule builds one from the WAREHOUSE config.
      ruleRepo.findOne.mockResolvedValue(null);

      const mockCounterRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((dto: any) => ({ id: 'counter-wh', ...dto })),
        save: jest.fn((entity: any) => Promise.resolve(entity)),
      };
      dataSource.transaction.mockImplementation(
        async (_isolation: string, work: (manager: any) => Promise<any>) =>
          work({ getRepository: () => mockCounterRepo }),
      );

      const result = await service.generate(
        DocumentType.WAREHOUSE,
        undefined,
        actor,
      );

      expect(result).toBe('WH000001');
      expect(ruleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          documentType: DocumentType.WAREHOUSE,
          prefix: 'WH',
          includeDate: false,
          sequenceLength: 6,
          resetPolicy: ResetPolicy.NEVER,
        }),
      );
    });
  });

  // =========================================================================
  // activateRule
  // =========================================================================
  describe('activateRule', () => {
    it('deactivates other rules in the same scope when activating', async () => {
      const inactiveRule = ruleStub({ isActive: false });
      ruleRepo.findOne.mockResolvedValue(inactiveRule);

      const managerUpdate = jest.fn();
      const managerSave = jest.fn();
      dataSource.transaction.mockImplementation(async (work: Function) => {
        await work({ update: managerUpdate, save: managerSave });
      });

      await service.activateRule('rule-1', actor);

      expect(managerUpdate).toHaveBeenCalledWith(
        DocumentNumberRuleEntity,
        expect.objectContaining({
          organizationId: 'org-1',
          documentType: DocumentType.INVOICE,
          isActive: true,
        }),
        { isActive: false },
      );
      expect(managerSave).toHaveBeenCalled();
      expect(inactiveRule.isActive).toBe(true);
    });

    it('returns the rule unchanged if already active', async () => {
      const activeRule = ruleStub({ isActive: true });
      ruleRepo.findOne.mockResolvedValue(activeRule);

      const result = await service.activateRule('rule-1', actor);

      expect(result).toBe(activeRule);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // reset policy: daily reset
  // =========================================================================
  describe('reset policy', () => {
    it('daily reset generates a new counter for each day', async () => {
      const rule = ruleStub({
        resetPolicy: ResetPolicy.DAILY,
        prefix: 'INV',
        includeDate: true,
        dateFormat: 'YYYYMMDD',
        sequenceLength: 3,
      });

      // branchId=undefined skips branch lookup; single findOne for org-level
      ruleRepo.findOne.mockResolvedValueOnce(rule);

      const mockCounterRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((dto: any) => ({ id: 'counter-new', ...dto })),
        save: jest.fn((entity: any) => Promise.resolve(entity)),
      };

      dataSource.transaction.mockImplementation(
        async (_isolation: string, work: (manager: any) => Promise<any>) => {
          return work({
            getRepository: () => mockCounterRepo,
          });
        },
      );

      const result = await service.generate(DocumentType.INVOICE, undefined, actor);

      const now = new Date();
      const expectedResetKey = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;

      expect(mockCounterRepo.findOne).toHaveBeenCalledWith({
        where: { ruleId: 'rule-1', resetKey: expectedResetKey },
        lock: { mode: 'pessimistic_write' },
      });
      expect(mockCounterRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ resetKey: expectedResetKey, currentValue: 1 }),
      );
      expect(result).toMatch(/^INV-\d{8}-001$/);
    });

    it('increments existing counter value', async () => {
      const rule = ruleStub({
        resetPolicy: ResetPolicy.DAILY,
        prefix: 'INV',
        includeDate: false,
        sequenceLength: 4,
      });

      // branchId=undefined skips branch lookup; single findOne for org-level
      ruleRepo.findOne.mockResolvedValueOnce(rule);

      const mockCounterRepo = {
        findOne: jest.fn().mockResolvedValue({
          ruleId: 'rule-1',
          resetKey: '2026-04-24',
          currentValue: 10,
        }),
        create: jest.fn(),
        save: jest.fn((entity: any) => Promise.resolve(entity)),
      };

      dataSource.transaction.mockImplementation(
        async (_isolation: string, work: (manager: any) => Promise<any>) => {
          return work({
            getRepository: () => mockCounterRepo,
          });
        },
      );

      const result = await service.generate(DocumentType.INVOICE, undefined, actor);

      // Continuous rules (no date, no suffix) join directly — see
      // formatDocumentNumber. Was "INV-0011" before that change.
      expect(result).toBe('INV0011');
    });
  });

  // =========================================================================
  // organization-scoped document types
  // =========================================================================
  describe('organization-scoped document types', () => {
    it('refuses a branch-scoped rule for a type whose records are unique per organization', async () => {
      // Each branch would get its own counter while `uq_customer_org_code` still
      // spans the organization, so both branches issue KH000001 and the second
      // insert is rejected.
      await expect(
        service.createRule(
          { documentType: DocumentType.CUSTOMER, branchId: 'branch-1', prefix: 'KH' },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(ruleRepo.save).not.toHaveBeenCalled();
    });

    it('still allows a branch-scoped rule for a real document type', async () => {
      ruleRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.createRule(
          { documentType: DocumentType.GOODS_RECEIPT, branchId: 'branch-1', prefix: 'NK' },
          actor,
        ),
      ).resolves.toMatchObject({ branchId: 'branch-1' });
    });

    it('ignores the branch argument when resolving an organization-scoped type', async () => {
      // A rule that predates the guard, or one seeded straight into the table,
      // must not split the counter either — so the branch lookup is skipped
      // rather than merely refused at creation time.
      ruleRepo.findOne.mockResolvedValueOnce(null);

      await service.preview(DocumentType.SUPPLIER, 'branch-1', actor);

      // One lookup, not two: the branch-scoped lookup that precedes it for
      // ordinary document types never runs.
      expect(ruleRepo.findOne).toHaveBeenCalledTimes(1);
      expect(ruleRepo.findOne).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          branchId: IsNull(),
          documentType: DocumentType.SUPPLIER,
          isActive: true,
        },
      });
    });
  });
});
