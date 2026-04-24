import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JournalSource, JournalStatus, DocumentType } from '@erp/shared-interfaces';
import { JournalService } from './journal.service';
import { JournalEntryEntity } from './journal-entry.entity';
import { JournalLineEntity } from './journal-line.entity';
import { AccountEntity } from '../coa/account.entity';
import { EventPublisher } from '../../events/event-publisher.service';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { PostJournalDto } from './dto';

describe('JournalService', () => {
  let service: JournalService;
  let entryRepo: Record<string, jest.Mock>;
  let lineRepo: Record<string, jest.Mock>;
  let accountRepo: Record<string, jest.Mock>;
  let eventPublisher: Record<string, jest.Mock>;
  let docNumbering: Record<string, jest.Mock>;
  let dataSource: Record<string, jest.Mock>;

  const actor = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
    permissions: [],
  };

  const balancedDto: PostJournalDto = {
    source: JournalSource.MANUAL,
    description: 'Test journal',
    lines: [
      { accountId: 'acc-1', debitAmount: 100, creditAmount: 0, lineOrder: 1 },
      { accountId: 'acc-2', debitAmount: 0, creditAmount: 100, lineOrder: 2 },
    ],
  };

  beforeEach(async () => {
    const mockAccountQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        { id: 'acc-1', isActive: true, code: '1000' },
        { id: 'acc-2', isActive: true, code: '2000' },
      ]),
    };

    entryRepo = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    lineRepo = {};

    accountRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(mockAccountQb),
    };

    eventPublisher = {
      publish: jest.fn().mockResolvedValue(undefined),
    };

    docNumbering = {
      generate: jest.fn().mockResolvedValue('JRN-2026-0001'),
    };

    const mockManager = {
      create: jest.fn().mockImplementation((_entity, data) => ({ id: 'je-1', ...data })),
      save: jest.fn().mockImplementation((data) => {
        if (Array.isArray(data)) return Promise.resolve(data);
        return Promise.resolve(data);
      }),
    };

    dataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(mockManager)),
      _mockManager: mockManager as any,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JournalService,
        { provide: getRepositoryToken(JournalEntryEntity), useValue: entryRepo },
        { provide: getRepositoryToken(JournalLineEntity), useValue: lineRepo },
        { provide: getRepositoryToken(AccountEntity), useValue: accountRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: EventPublisher, useValue: eventPublisher },
        { provide: DocumentNumberingService, useValue: docNumbering },
      ],
    }).compile();

    service = module.get(JournalService);
  });

  describe('post', () => {
    it('should succeed with a balanced journal', async () => {
      const result = await service.post(balancedDto, actor);

      expect(result).toBeDefined();
      expect(result.status).toBe(JournalStatus.POSTED);
      expect(result.documentNumber).toBe('JRN-2026-0001');
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(eventPublisher.publish).toHaveBeenCalledWith(
        'erp.journal.posted',
        expect.objectContaining({
          payload: expect.objectContaining({ documentNumber: 'JRN-2026-0001' }),
        }),
      );
    });

    it('should reject an unbalanced journal', async () => {
      const dto: PostJournalDto = {
        source: JournalSource.MANUAL,
        description: 'Unbalanced',
        lines: [
          { accountId: 'acc-1', debitAmount: 100, creditAmount: 0, lineOrder: 1 },
          { accountId: 'acc-2', debitAmount: 0, creditAmount: 50, lineOrder: 2 },
        ],
      };

      await expect(service.post(dto, actor)).rejects.toThrow(BadRequestException);
      await expect(service.post(dto, actor)).rejects.toThrow(/not balanced/);
    });

    it('should generate a document number', async () => {
      await service.post(balancedDto, actor);

      expect(docNumbering.generate).toHaveBeenCalledWith(
        DocumentType.JOURNAL,
        'branch-1',
        actor,
      );
    });
  });

  describe('reverse', () => {
    const originalEntry = {
      id: 'je-original',
      organizationId: 'org-1',
      documentNumber: 'JRN-2026-0001',
      source: JournalSource.MANUAL,
      sourceReferenceId: null,
      status: JournalStatus.POSTED,
      reversedByJournalId: null,
      lines: [
        { accountId: 'acc-1', debitAmount: 100, creditAmount: 0, description: 'Debit' },
        { accountId: 'acc-2', debitAmount: 0, creditAmount: 100, description: 'Credit' },
      ],
    };

    it('should create opposite entries (swap debit/credit)', async () => {
      entryRepo.findOne.mockResolvedValue({ ...originalEntry });

      const result = await service.reverse('je-original', 'Error correction', actor);

      expect(result).toBeDefined();
      expect(result.reversalOfJournalId).toBe('je-original');

      const manager = dataSource._mockManager as any;
      const createCalls = manager.create.mock.calls;
      const lineCalls = createCalls.filter(
        (c: any[]) => c[0] === JournalLineEntity,
      );
      expect(lineCalls).toHaveLength(2);
      expect(lineCalls[0][1]).toMatchObject({ debitAmount: 0, creditAmount: 100 });
      expect(lineCalls[1][1]).toMatchObject({ debitAmount: 100, creditAmount: 0 });
    });

    it('should reject reversing an already-reversed journal', async () => {
      entryRepo.findOne.mockResolvedValue({
        ...originalEntry,
        reversedByJournalId: 'je-reversal',
      });

      await expect(
        service.reverse('je-original', 'Retry', actor),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.reverse('je-original', 'Retry', actor),
      ).rejects.toThrow(/already been reversed/);
    });

    it('should link original and reversal entries', async () => {
      const original = { ...originalEntry };
      entryRepo.findOne.mockResolvedValue(original);

      await service.reverse('je-original', 'Correction', actor);

      const manager = dataSource._mockManager as any;
      const saveCalls = manager.save.mock.calls;
      const savedOriginal = saveCalls.find(
        (c: any[]) => !Array.isArray(c[0]) && c[0].id === 'je-original',
      );
      expect(savedOriginal).toBeDefined();
      expect(savedOriginal[0].status).toBe(JournalStatus.REVERSED);
      expect(savedOriginal[0].reversedByJournalId).toBeDefined();
    });
  });
});
