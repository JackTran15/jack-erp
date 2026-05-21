import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountType } from '@erp/shared-interfaces';
import { AccountEntity } from '../coa/account.entity';

interface DefaultAccount {
  code: string;
  name: string;
  type: AccountType;
  parent?: string;
}

/** Default Vietnamese Chart of Accounts (Thông tư 200/2014/TT-BTC, simplified). */
export const DEFAULT_COA: DefaultAccount[] = [
  // ASSETS
  { code: '111', name: 'Tiền mặt', type: AccountType.ASSET },
  { code: '1111', name: 'Tiền Việt Nam', type: AccountType.ASSET, parent: '111' },
  { code: '112', name: 'Tiền gửi ngân hàng', type: AccountType.ASSET },
  { code: '131', name: 'Phải thu khách hàng', type: AccountType.ASSET },
  { code: '156', name: 'Hàng hóa', type: AccountType.ASSET },

  // LIABILITIES
  { code: '331', name: 'Phải trả người bán', type: AccountType.LIABILITY },
  { code: '3331', name: 'Thuế GTGT phải nộp', type: AccountType.LIABILITY },

  // EQUITY
  { code: '411', name: 'Vốn đầu tư của chủ sở hữu', type: AccountType.EQUITY },
  { code: '421', name: 'Lợi nhuận chưa phân phối', type: AccountType.EQUITY },

  // REVENUE
  { code: '511', name: 'Doanh thu bán hàng', type: AccountType.REVENUE },
  { code: '521', name: 'Các khoản giảm trừ doanh thu', type: AccountType.REVENUE },
  { code: '711', name: 'Thu nhập khác', type: AccountType.REVENUE },

  // EXPENSE
  { code: '632', name: 'Giá vốn hàng bán', type: AccountType.EXPENSE },
  { code: '641', name: 'Chi phí bán hàng', type: AccountType.EXPENSE },
  { code: '642', name: 'Chi phí quản lý doanh nghiệp', type: AccountType.EXPENSE },
  { code: '811', name: 'Chi phí khác', type: AccountType.EXPENSE },

  // SUMMARY
  { code: '911', name: 'Xác định kết quả kinh doanh', type: AccountType.EQUITY },
];

@Injectable()
export class CoaSeederService {
  private readonly logger = new Logger(CoaSeederService.name);

  constructor(
    @InjectRepository(AccountEntity)
    private readonly accountRepo: Repository<AccountEntity>,
  ) {}

  async seedForOrganization(organizationId: string, actorId: string): Promise<number> {
    const existing = await this.accountRepo.count({ where: { organizationId } });
    if (existing > 0) {
      this.logger.log(
        `Org ${organizationId} already has ${existing} COA accounts, skipping full seed`,
      );
      // Idempotently top up accounts added after the org was first seeded
      // (e.g. TK 711/811 needed by cash-count variance vouchers).
      await this.ensureMissingAccounts(organizationId, actorId);
      return 0;
    }

    const codeToId = new Map<string, string>();

    const rootAccounts = DEFAULT_COA.filter((a) => !a.parent);
    for (const a of rootAccounts) {
      const saved = await this.accountRepo.save(
        this.accountRepo.create({
          organizationId,
          code: a.code,
          name: a.name,
          type: a.type,
          isActive: true,
          createdBy: actorId,
        }),
      );
      codeToId.set(a.code, saved.id);
    }

    const childAccounts = DEFAULT_COA.filter((a) => a.parent);
    for (const a of childAccounts) {
      const parentId = codeToId.get(a.parent!);
      if (!parentId) {
        this.logger.warn(
          `Parent ${a.parent} not found for account ${a.code} — inserting without parent`,
        );
      }
      await this.accountRepo.save(
        this.accountRepo.create({
          organizationId,
          code: a.code,
          name: a.name,
          type: a.type,
          parentAccountId: parentId,
          isActive: true,
          createdBy: actorId,
        }),
      );
    }

    this.logger.log(
      `Seeded ${DEFAULT_COA.length} default COA accounts for organization ${organizationId}`,
    );
    return DEFAULT_COA.length;
  }

  /** Insert any DEFAULT_COA root accounts the org is missing (idempotent top-up). */
  private async ensureMissingAccounts(
    organizationId: string,
    actorId: string,
  ): Promise<void> {
    const codes = DEFAULT_COA.filter((a) => !a.parent).map((a) => a.code);
    const present = await this.accountRepo.find({
      where: { organizationId },
      select: ['code'],
    });
    const presentCodes = new Set(present.map((a) => a.code));

    for (const code of codes) {
      if (presentCodes.has(code)) continue;
      const def = DEFAULT_COA.find((a) => a.code === code)!;
      await this.accountRepo.save(
        this.accountRepo.create({
          organizationId,
          code: def.code,
          name: def.name,
          type: def.type,
          isActive: true,
          createdBy: actorId,
        }),
      );
      this.logger.log(
        `Added missing COA account ${def.code} (${def.name}) for org ${organizationId}`,
      );
    }
  }
}
