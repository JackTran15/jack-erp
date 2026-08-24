import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, FindOperator, IsNull } from 'typeorm';
import { DocumentType } from '@erp/shared-interfaces';
import {
  DocumentNumberRuleEntity,
  ResetPolicy,
} from './document-number-rule.entity';
import { DocumentNumberCounterEntity } from './document-number-counter.entity';
import { DocumentNumberingService } from './document-numbering.service';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { mintDocumentNumber } from '../pos/checkout-saga/application/steps/mint-document-number';

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
    separator: '-',
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

      // Both calls resolve the same already-existing branch rule: the T-04-02
      // existence check in `ensureBranchRule` (which short-circuits without
      // opening a transaction, since the branch rule already exists) and then
      // `resolveActiveRule` itself.
      ruleRepo.findOne.mockResolvedValue(branchRule);

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
      expect(ruleRepo.findOne).toHaveBeenCalledTimes(2);
      // `ensureBranchRule` itself never opens a transaction here — only
      // `atomicIncrement`'s counter increment does.
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
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

  // Regression net for AC-08. Every rule shape that actually exists on erp_dev
  // today, asserted as a whole string: adding `separator` to the join must not
  // move a single character of any of them. Shapes, not document types — two
  // rules that differ only by prefix exercise the same code path.
  describe('formatDocumentNumber — existing rule shapes render unchanged (AC-08)', () => {
    const AUG_2026 = new Date('2026-08-21T10:00:00.000+07:00');

    const cases: Array<[string, Partial<DocumentNumberRuleEntity>, number, string]> = [
      ['INVOICE (INV, YYYYMM, 5)', { prefix: 'INV', includeDate: true, dateFormat: 'YYYYMM', sequenceLength: 5 }, 13, 'INV-202608-00013'],
      ['RETURN (RTN, YYYYMM, 5)', { prefix: 'RTN', includeDate: true, dateFormat: 'YYYYMM', sequenceLength: 5 }, 35, 'RTN-202608-00035'],
      ['JOURNAL (JNL, YYYYMM, 5)', { prefix: 'JNL', includeDate: true, dateFormat: 'YYYYMM', sequenceLength: 5 }, 1, 'JNL-202608-00001'],
      ['CASH_RECEIPT (PT, no date, 6)', { prefix: 'PT', includeDate: false, sequenceLength: 6 }, 12, 'PT000012'],
      ['CASH_PAYMENT (PC, no date, 6)', { prefix: 'PC', includeDate: false, sequenceLength: 6 }, 51, 'PC000051'],
      ['GOODS_RECEIPT (IMP, no date, 6)', { prefix: 'IMP', includeDate: false, sequenceLength: 6 }, 45, 'IMP000045'],
      ['GOODS_ISSUE (XK, no date, 6)', { prefix: 'XK', includeDate: false, sequenceLength: 6 }, 7, 'XK000007'],
      ['TRANSFER (CK, no date, 6)', { prefix: 'CK', includeDate: false, sequenceLength: 6 }, 7, 'CK000007'],
      ['TRANSFER_ORDER (LDC, no date, 6)', { prefix: 'LDC', includeDate: false, sequenceLength: 6 }, 7, 'LDC000007'],
      ['BANK_RECEIPT (NTTK, no date, 6)', { prefix: 'NTTK', includeDate: false, sequenceLength: 6 }, 3, 'NTTK000003'],
      ['BANK_PAYMENT (UNC, no date, 6)', { prefix: 'UNC', includeDate: false, sequenceLength: 6 }, 3, 'UNC000003'],
      ['CUSTOMER (KH, no date, 6)', { prefix: 'KH', includeDate: false, sequenceLength: 6 }, 201, 'KH000201'],
      ['SUPPLIER (NCC, no date, 6)', { prefix: 'NCC', includeDate: false, sequenceLength: 6 }, 4, 'NCC000004'],
      ['EMPLOYEE (NV, no date, 6)', { prefix: 'NV', includeDate: false, sequenceLength: 6 }, 9, 'NV000009'],
      ['WAREHOUSE (WH, no date, 6)', { prefix: 'WH', includeDate: false, sequenceLength: 6 }, 2, 'WH000002'],
      ['PROMOTION (KM, no date, 6)', { prefix: 'KM', includeDate: false, sequenceLength: 6 }, 6, 'KM000006'],
    ];

    for (const [label, overrides, sequence, expected] of cases) {
      it(`${label} → ${expected}`, () => {
        const rule = ruleStub({ separator: '-', suffix: undefined, ...overrides });
        expect(service['formatDocumentNumber'](rule, AUG_2026, sequence)).toBe(expected);
      });
    }
  });

  // The two shapes this feature introduces. Same formatter, no special-casing
  // by document type — only rule data differs.
  describe('formatDocumentNumber — the YYMMDD invoice shapes (AC-01, AC-04)', () => {
    const AUG_21 = new Date('2026-08-21T10:00:00.000+07:00');

    it('empty prefix + YYMMDD + empty separator renders 2608210001', () => {
      const rule = ruleStub({
        prefix: '',
        suffix: undefined,
        includeDate: true,
        dateFormat: 'YYMMDD',
        sequenceLength: 4,
        separator: '',
      });
      expect(service['formatDocumentNumber'](rule, AUG_21, 1)).toBe('2608210001');
    });

    it('the TH suffix rides on the same shape and renders 2608210001TH', () => {
      const rule = ruleStub({
        prefix: '',
        suffix: 'TH',
        includeDate: true,
        dateFormat: 'YYMMDD',
        sequenceLength: 4,
        separator: '',
      });
      expect(service['formatDocumentNumber'](rule, AUG_21, 1)).toBe('2608210001TH');
    });

    it('YYMMDD takes the last two digits of the year, not the first two', () => {
      expect(service['formatDate']('YYMMDD', new Date('2026-08-21T10:00:00.000+07:00'))).toBe('260821');
      expect(service['formatDate']('YYMMDD', new Date('2030-01-05T10:00:00.000+07:00'))).toBe('300105');
    });
  });

  // T-01-03: both rule creators read DEFAULT_DOC_NUMBER_CONFIG, so an org that
  // the migration never touched still issues receipt-shaped numbers instead of
  // silently falling back to INV-202609-00001.
  describe('auto-created default rules follow DEFAULT_DOC_NUMBER_CONFIG', () => {
    const AUG_22 = new Date('2026-08-22T10:00:00.000+07:00');

    const withFreshCounter = () => {
      const mockCounterRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((dto: any) => ({ id: 'counter-new', ...dto })),
        save: jest.fn((entity: any) => Promise.resolve(entity)),
      };
      dataSource.transaction.mockImplementation(
        async (_isolation: string, work: (manager: any) => Promise<any>) =>
          work({ getRepository: () => mockCounterRepo }),
      );
    };

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(AUG_22);
      ruleRepo.findOne.mockResolvedValue(null);
      withFreshCounter();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('INVOICE auto-creates a YYMMDD/4/DAILY rule and issues 2608220001', async () => {
      const result = await service.generate(DocumentType.INVOICE, undefined, actor);

      expect(result).toBe('2608220001');
      expect(ruleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          documentType: DocumentType.INVOICE,
          prefix: '',
          suffix: undefined,
          includeDate: true,
          dateFormat: 'YYMMDD',
          sequenceLength: 4,
          separator: '',
          resetPolicy: ResetPolicy.DAILY,
        }),
      );
    });

    it('RETURN auto-creates the same shape with a TH suffix and issues 2608220001TH', async () => {
      const result = await service.generate(DocumentType.RETURN, undefined, actor);

      expect(result).toBe('2608220001TH');
      expect(ruleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          documentType: DocumentType.RETURN,
          prefix: '',
          suffix: 'TH',
          dateFormat: 'YYMMDD',
          sequenceLength: 4,
          separator: '',
          resetPolicy: ResetPolicy.DAILY,
        }),
      );
    });

    it('a type that overrides nothing keeps the shape it always had', async () => {
      const result = await service.generate(DocumentType.CASH_RECEIPT, undefined, actor);

      expect(result).toBe('PT000001');
      expect(ruleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          prefix: 'PT',
          suffix: undefined,
          includeDate: false,
          dateFormat: 'YYYYMM',
          sequenceLength: 6,
          separator: '-',
          resetPolicy: ResetPolicy.NEVER,
        }),
      );
    });

    it('JOURNAL, which the feature does not touch, still resets monthly on YYYYMM', async () => {
      const result = await service.generate(DocumentType.JOURNAL, undefined, actor);

      expect(result).toBe('JNL-202608-00001');
      expect(ruleRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          prefix: 'JNL',
          includeDate: true,
          dateFormat: 'YYYYMM',
          sequenceLength: 5,
          separator: '-',
          resetPolicy: ResetPolicy.MONTHLY,
        }),
      );
    });
  });

  // The saga cannot call the service (ADR-05), so it carries its own creator.
  // This is the chokepoint that catches the two drifting apart — the same role
  // document-number-format.spec.ts plays for the formatter.
  describe('mintDocumentNumber creates a rule identical to the service (ADR-05)', () => {
    const AUG_22 = new Date('2026-08-22T10:00:00.000+07:00');

    beforeEach(() => jest.useFakeTimers().setSystemTime(AUG_22));
    afterEach(() => jest.useRealTimers());

    for (const documentType of [
      DocumentType.INVOICE,
      DocumentType.RETURN,
      DocumentType.CASH_RECEIPT,
      DocumentType.JOURNAL,
    ]) {
      it(`${documentType}`, async () => {
        // Service side.
        ruleRepo.findOne.mockResolvedValue(null);
        const serviceCounter = {
          findOne: jest.fn().mockResolvedValue(null),
          create: jest.fn((dto: any) => dto),
          save: jest.fn((e: any) => Promise.resolve(e)),
        };
        dataSource.transaction.mockImplementation(
          async (_i: string, work: (m: any) => Promise<any>) =>
            work({ getRepository: () => serviceCounter }),
        );
        await service.generate(documentType, undefined, actor);
        const fromService = ruleRepo.create.mock.calls.at(-1)?.[0];

        // Saga side, through the caller's own manager.
        const sagaRuleRepo = {
          findOne: jest.fn().mockResolvedValue(null),
          create: jest.fn((dto: any) => ({ id: 'rule-saga', ...dto })),
          save: jest.fn((e: any) => Promise.resolve(e)),
        };
        const sagaCounterRepo = {
          create: jest.fn((dto: any) => dto),
          save: jest.fn((e: any) => Promise.resolve(e)),
        };
        const manager = {
          getRepository: (target: unknown) =>
            target === DocumentNumberRuleEntity ? sagaRuleRepo : sagaCounterRepo,
          createQueryBuilder: () => ({
            setLock: () => ({
              where: () => ({ andWhere: () => ({ getOne: async () => null }) }),
            }),
          }),
        };
        await mintDocumentNumber(manager as any, documentType, undefined, actor, {
          ensureDefault: true,
        });
        const fromSaga = sagaRuleRepo.create.mock.calls.at(-1)?.[0];

        expect(fromSaga).toEqual(fromService);
      });
    }
  });

  // T-01-05 — the return-side dial. Returns and exchanges both travel through
  // DocumentNumberingService.generate (checkout-return.service.ts), which is a
  // different path from the sale (ADR-05).
  describe('RETURN shares one dial with EXCHANGE and stays clear of sales (AC-05, AC-06)', () => {
    const AUG_21 = new Date('2026-08-21T17:09:00.000+07:00');

    const returnRule = ruleStub({
      id: 'rule-return',
      documentType: DocumentType.RETURN,
      prefix: '',
      suffix: 'TH',
      includeDate: true,
      dateFormat: 'YYMMDD',
      sequenceLength: 4,
      separator: '',
      resetPolicy: ResetPolicy.DAILY,
    });

    const invoiceRule = ruleStub({
      id: 'rule-invoice',
      documentType: DocumentType.INVOICE,
      prefix: '',
      suffix: undefined,
      includeDate: true,
      dateFormat: 'YYMMDD',
      sequenceLength: 4,
      separator: '',
      resetPolicy: ResetPolicy.DAILY,
    });

    // One counter store shared by both rules, keyed the way the real table is —
    // so a leak between the two dials would show up as a skipped number.
    const withCounterStore = () => {
      const rows = new Map<string, { currentValue: number }>();
      dataSource.transaction.mockImplementation(
        async (_i: string, work: (m: any) => Promise<any>) =>
          work({
            getRepository: () => ({
              findOne: jest.fn(async ({ where }: any) => {
                const key = `${where.ruleId}|${where.resetKey}`;
                return rows.get(key) ? { ...rows.get(key), ...where } : null;
              }),
              create: jest.fn((dto: any) => dto),
              save: jest.fn(async (entity: any) => {
                rows.set(`${entity.ruleId}|${entity.resetKey}`, {
                  currentValue: Number(entity.currentValue),
                });
                return entity;
              }),
            }),
          }),
      );
      return rows;
    };

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(AUG_21);
      withCounterStore();
    });

    afterEach(() => jest.useRealTimers());

    it('a return and the exchange after it walk the same dial (AC-05)', async () => {
      ruleRepo.findOne.mockResolvedValue(returnRule);

      const first = await service.generate(DocumentType.RETURN, undefined, actor);
      const second = await service.generate(DocumentType.RETURN, undefined, actor);

      expect(first).toBe('2608210001TH');
      expect(second).toBe('2608210002TH');
    });

    it('a sale and a return issued the same day are both 0001 and do not collide (AC-06)', async () => {
      ruleRepo.findOne.mockImplementation(async ({ where }: any) =>
        where.documentType === DocumentType.INVOICE ? invoiceRule : returnRule,
      );

      const sale = await service.generate(DocumentType.INVOICE, undefined, actor);
      const refund = await service.generate(DocumentType.RETURN, undefined, actor);

      // Both start at 1 — separate counters. The TH suffix is what keeps the two
      // strings distinct under uq_invoice_org_code, not the sequence.
      expect(sale).toBe('2608210001');
      expect(refund).toBe('2608210001TH');
      expect(sale).not.toBe(refund);
    });
  });

  // T-04-02 — ADR-07. resolveActiveRule already prefers a branch rule over
  // the org-wide one; the missing piece was that nobody ever created that
  // branch rule for INVOICE/RETURN. `ensureBranchRule` clones the org-wide
  // rule the first time a branch is seen and fast-forwards the new counter to
  // where the org-wide counter stood, so a mid-day cutover cannot reissue a
  // number the branch already holds under the shared counter (AC-07, AC-17).
  describe('branch-scoped INVOICE/RETURN rule cloning (T-04-02)', () => {
    const AUG_21 = new Date('2026-08-21T09:00:00.000+07:00');

    // Matches the service's own FindOperator usage: only `IsNull()` appears
    // in the rule queries this file exercises.
    const matchesWhere = (row: any, where: Record<string, unknown>): boolean =>
      Object.entries(where).every(([key, value]) =>
        value instanceof FindOperator
          ? row[key] === undefined || row[key] === null
          : row[key] === value,
      );

    let rules: any[];
    let counters: any[];

    const orgInvoiceRule = () => ({
      id: 'rule-org-invoice',
      organizationId: 'org-1',
      branchId: undefined,
      documentType: DocumentType.INVOICE,
      prefix: '',
      suffix: undefined,
      includeDate: true,
      dateFormat: 'YYMMDD',
      sequenceLength: 4,
      separator: '',
      resetPolicy: ResetPolicy.DAILY,
      isActive: true,
      createdBy: 'user-1',
    });

    // Rebuilds `ruleRepo`/`counterRepo` (the same jest.fn() objects the
    // service was constructed with — see the outer `beforeEach`) as an
    // in-memory store shared between the outer service calls and whatever a
    // transaction's `manager.getRepository(...)` returns, so a rule/counter
    // created inside a transaction is visible to the next outer call exactly
    // like a committed row would be.
    const seedInMemoryStore = (seedRules: any[] = [orgInvoiceRule()]) => {
      rules = seedRules;
      counters = [];

      ruleRepo.findOne.mockImplementation(async ({ where }: any) =>
        rules.find((r) => matchesWhere(r, where)) ?? null,
      );
      ruleRepo.create.mockImplementation(
        (dto: any) => ({ id: `rule-${rules.length + 1}`, ...dto }) as any,
      );
      ruleRepo.save.mockImplementation(async (entity: any) => {
        const idx = rules.findIndex((r) => r.id === entity.id);
        if (idx >= 0) rules[idx] = entity;
        else rules.push(entity);
        return entity;
      });

      counterRepo.findOne.mockImplementation(async ({ where }: any) =>
        counters.find((c) => matchesWhere(c, where)) ?? null,
      );
      counterRepo.create.mockImplementation(
        (dto: any) => ({ id: `counter-${counters.length + 1}`, ...dto }) as any,
      );
      counterRepo.save.mockImplementation(async (entity: any) => {
        const idx = counters.findIndex(
          (c) => c.ruleId === entity.ruleId && c.resetKey === entity.resetKey,
        );
        if (idx >= 0) counters[idx] = entity;
        else counters.push(entity);
        return entity;
      });

      const fakeManager = {
        getRepository: (target: unknown) =>
          target === DocumentNumberRuleEntity ? ruleRepo : counterRepo,
      };
      // Real `dataSource.transaction` takes either `(work)` or
      // `(isolation, work)` — both call paths in the service are exercised
      // here (`ensureBranchRule` uses the first, `atomicIncrement` the
      // second), so accept both.
      dataSource.transaction.mockImplementation(async (a: any, b?: any) => {
        const work = typeof a === 'function' ? a : b;
        return work(fakeManager);
      });
    };

    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(AUG_21);
      seedInMemoryStore();
    });

    afterEach(() => jest.useRealTimers());

    // Sequential calls for two DIFFERENT branches — this proves per-branch
    // counter isolation (AC-07), not concurrency/race safety. The real race on
    // one branch's *first* rule (two concurrent requests for the *same* new
    // branch) cannot be proven by a mocked unit test at all — it needs
    // Postgres' own partial unique index to actually fire, which is what
    // `checkout-saga-concurrency.e2e-spec.ts`'s T-04-02 test exercises
    // against a real database (code review feedback on this ticket).
    it('two DIFFERENT branches previewing INVOICE the same day, called sequentially, each get their own 0001 (per-branch isolation, AC-07)', async () => {
      const first = await service.preview(DocumentType.INVOICE, 'branch-a', actor);
      const second = await service.preview(DocumentType.INVOICE, 'branch-b', actor);

      expect(first).toBe('2608210001');
      expect(second).toBe('2608210001');

      const branchRules = rules.filter((r) => r.documentType === DocumentType.INVOICE && r.branchId);
      expect(branchRules.map((r) => r.branchId).sort()).toEqual(['branch-a', 'branch-b']);
    });

    it('generate() fast-forwards a newly cloned branch rule past the org-wide counter, so the first branch number does not collide (AC-17)', async () => {
      // The shared/org-wide counter already issued 5 numbers today before this
      // branch ever got its own rule (pre-cutover history).
      counters.push({
        ruleId: 'rule-org-invoice',
        organizationId: 'org-1',
        branchId: undefined,
        resetKey: '2026-08-21',
        currentValue: 5,
      });

      const result = await service.generate(DocumentType.INVOICE, 'branch-a', actor);

      // Fast-forwarded to 5, then incremented once by this call's own
      // generate — 6, not 1..5.
      expect(result).toBe('2608210006');

      const branchCounter = counters.find(
        (c) => c.ruleId !== 'rule-org-invoice' && c.branchId === 'branch-a',
      );
      expect(branchCounter?.currentValue).toBe(6);
    });

    it('a second generate() the same day reuses the branch rule instead of cloning again', async () => {
      const first = await service.generate(DocumentType.INVOICE, 'branch-a', actor);
      const branchRuleCountAfterFirst = rules.filter(
        (r) => r.documentType === DocumentType.INVOICE && r.branchId === 'branch-a',
      ).length;

      const second = await service.generate(DocumentType.INVOICE, 'branch-a', actor);
      const branchRuleCountAfterSecond = rules.filter(
        (r) => r.documentType === DocumentType.INVOICE && r.branchId === 'branch-a',
      ).length;

      expect(first).toBe('2608210001');
      expect(second).toBe('2608210002');
      expect(branchRuleCountAfterFirst).toBe(1);
      expect(branchRuleCountAfterSecond).toBe(1);
    });

    it('a branch keeps a contiguous counter sequence even when another branch\'s invoices are interleaved (AC-16)', async () => {
      // Mimics the interleaving seen in the QA screenshot: A, B, A — each
      // branch dials its own already-cloned rule, so B landing in the middle
      // must not skip or repeat a number on A's side.
      const a1 = await service.generate(DocumentType.INVOICE, 'branch-a', actor);
      const b1 = await service.generate(DocumentType.INVOICE, 'branch-b', actor);
      const a2 = await service.generate(DocumentType.INVOICE, 'branch-a', actor);

      expect(a1).toBe('2608210001');
      expect(b1).toBe('2608210001');
      expect(a2).toBe('2608210002');

      const branchARuleId = rules.find(
        (r) => r.documentType === DocumentType.INVOICE && r.branchId === 'branch-a',
      )?.id;
      const branchACounter = counters.find((c) => c.ruleId === branchARuleId);
      // Branch A's own counter sequence is 1..2, contiguous — untouched by
      // branch B's call landing in between.
      expect(branchACounter?.currentValue).toBe(2);
    });

    it('a document type other than INVOICE/RETURN never clones a branch rule (unchanged behavior)', async () => {
      rules = [
        {
          id: 'rule-org-cash-receipt',
          organizationId: 'org-1',
          branchId: undefined,
          documentType: DocumentType.CASH_RECEIPT,
          prefix: 'PT',
          suffix: undefined,
          includeDate: false,
          dateFormat: 'YYYYMM',
          sequenceLength: 6,
          separator: '-',
          resetPolicy: ResetPolicy.NEVER,
          isActive: true,
          createdBy: 'user-1',
        },
      ];
      seedInMemoryStore(rules);

      const result = await service.generate(
        DocumentType.CASH_RECEIPT,
        'branch-a',
        actor,
      );

      expect(result).toBe('PT000001');
      // No branch rule for CASH_RECEIPT was created — the org-wide rule is
      // still the only row.
      expect(
        rules.filter((r) => r.documentType === DocumentType.CASH_RECEIPT),
      ).toHaveLength(1);
    });
  });
});
