import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  JournalSource,
  ScopingPolicy,
  DeletionPolicy,
  CrudEntityConfig,
} from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { JournalService } from '../journal/journal.service';
import { BaseCrudService } from '../../crud/base-crud.service';
import { ExpenseEntity, ExpenseStatus } from './expense.entity';
import { CreateExpenseDto } from './dto';

export const EXPENSE_SERVICE_TOKEN = 'ExpenseService';

/** Amount above which an expense requires approval before posting */
const APPROVAL_THRESHOLD = 1000;

@Injectable()
export class ExpensesService extends BaseCrudService<
  ExpenseEntity,
  CreateExpenseDto,
  Record<string, never>
> {
  protected readonly entityConfig: CrudEntityConfig = EXPENSE_ENTITY_CONFIG;

  constructor(
    @InjectRepository(ExpenseEntity)
    protected readonly repository: Repository<ExpenseEntity>,
    protected readonly dataSource: DataSource,
    private readonly journalService: JournalService,
  ) {
    super(dataSource);
  }

  protected override async beforeCreate(
    payload: CreateExpenseDto,
    _actor: ActorContext,
  ): Promise<CreateExpenseDto> {
    (payload as any).status = ExpenseStatus.DRAFT;
    return payload;
  }

  async approve(id: string, actor: ActorContext): Promise<ExpenseEntity> {
    const expense = await this.getById(id, actor);

    if (expense.status !== ExpenseStatus.DRAFT) {
      throw new BadRequestException(
        `Expense ${id} must be in DRAFT status to approve (current: ${expense.status})`,
      );
    }

    expense.status = ExpenseStatus.APPROVED;
    expense.approvedBy = actor.userId;
    expense.approvedAt = new Date();

    return this.repository.save(expense);
  }

  async post(id: string, actor: ActorContext): Promise<ExpenseEntity> {
    const expense = await this.getById(id, actor);

    if (expense.status === ExpenseStatus.POSTED) {
      throw new BadRequestException(`Expense ${id} is already posted`);
    }

    if (
      Number(expense.amount) > APPROVAL_THRESHOLD &&
      expense.status !== ExpenseStatus.APPROVED
    ) {
      throw new BadRequestException(
        `Expense ${id} exceeds threshold (${APPROVAL_THRESHOLD}) and requires approval before posting`,
      );
    }

    if (
      expense.status !== ExpenseStatus.DRAFT &&
      expense.status !== ExpenseStatus.APPROVED
    ) {
      throw new BadRequestException(
        `Expense ${id} must be in DRAFT or APPROVED status to post (current: ${expense.status})`,
      );
    }

    const now = new Date();

    return this.dataSource.transaction(async (manager) => {
      expense.status = ExpenseStatus.POSTED;
      expense.postedAt = now;
      expense.postedBy = actor.userId;

      const saved = await manager.save(expense);

      await this.journalService.post(
        {
          source: JournalSource.EXPENSE,
          sourceReferenceId: saved.id,
          description: `Expense posted: ${expense.description}`,
          lines: [
            {
              accountId: expense.accountId,
              debitAmount: Number(expense.amount),
              creditAmount: 0,
              description: 'Debit expense account',
              lineOrder: 1,
            },
            {
              accountId: expense.accountId,
              debitAmount: 0,
              creditAmount: Number(expense.amount),
              description: expense.payableId
                ? 'Credit payable'
                : 'Credit cash',
              lineOrder: 2,
            },
          ],
        },
        actor,
      );

      return saved;
    });
  }
}

export const EXPENSE_ENTITY_CONFIG: CrudEntityConfig = {
  entityKey: 'expenses',
  displayName: 'Expense',
  apiResource: 'expenses',
  idField: 'id',
  fields: [
    {
      key: 'description',
      label: 'Description',
      type: 'string',
      required: true,
    },
    {
      key: 'amount',
      label: 'Amount',
      type: 'number',
      numberFormat: 'money',
      required: true,
    },
    {
      key: 'accountId',
      label: 'Account',
      type: 'relation',
      required: true,
      relationEntity: 'accounts',
    },
    {
      key: 'payableId',
      label: 'Payable',
      type: 'relation',
      relationEntity: 'payables',
    },
    {
      key: 'status',
      label: 'Status',
      type: 'enum',
      enumValues: Object.values(ExpenseStatus),
    },
  ],
  searchableFields: ['description'],
  filterDefinitions: [
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: Object.values(ExpenseStatus).map((s) => ({
        label: s,
        value: s,
      })),
    },
  ],
  permissions: {
    create: 'accounting.expenses.create',
    read: 'accounting.expenses.read',
    update: 'accounting.expenses.update',
    delete: 'accounting.expenses.delete',
  },
  scopingPolicy: ScopingPolicy.ORGANIZATION,
  deletionPolicy: DeletionPolicy.DISABLED,
};
