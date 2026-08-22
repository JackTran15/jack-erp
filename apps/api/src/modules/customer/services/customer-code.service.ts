import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { DocumentType } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { DocumentNumberingService } from '../../document-numbering/document-numbering.service';
import { CustomerEntity } from '../customer.entity';

const MAX_ATTEMPTS = 3;

/**
 * Issues the next free `customers.code`.
 *
 * The numbering counter is not the only writer of that column — SQL seeds and
 * spreadsheet imports insert codes of the same KH shape without touching it —
 * so `generate` on its own hands back numbers an existing row already holds and
 * the insert dies on `uq_customer_org_code`. On a collision the counter is
 * fast-forwarded past the highest code actually in the table, so the drift is
 * repaired once rather than skipped over on every create.
 */
@Injectable()
export class CustomerCodeService {
  constructor(
    @InjectRepository(CustomerEntity)
    private readonly customerRepo: Repository<CustomerEntity>,
    private readonly docNumbering: DocumentNumberingService,
  ) {}

  /** `manager` is required from callers that already hold a transaction — see `DocumentNumberingService.generate`. */
  async issue(actor: ActorContext, manager?: EntityManager): Promise<string> {
    const customerRepo = manager
      ? manager.getRepository(CustomerEntity)
      : this.customerRepo;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const candidate = await this.docNumbering.generate(
        DocumentType.CUSTOMER,
        actor.branchId,
        actor,
        manager,
      );
      const taken = await customerRepo.findOne({
        where: { code: candidate, organizationId: actor.organizationId },
      });
      if (!taken) return candidate;

      await this.docNumbering.ensureSequenceAtLeast(
        DocumentType.CUSTOMER,
        actor.branchId,
        actor,
        await this.highestIssuedSequence(
          candidate,
          actor.organizationId,
          customerRepo,
        ),
        manager,
      );
    }

    throw new ConflictException(
      'Không thể cấp mã khách hàng mới, vui lòng thử lại.',
    );
  }

  /**
   * Highest numeric suffix among codes sharing the candidate's prefix — 103 for
   * a table holding KH000001..KH000103. The prefix is read off the candidate
   * rather than off the rule, so a customized prefix stays self-correcting.
   */
  private async highestIssuedSequence(
    candidate: string,
    organizationId: string,
    customerRepo: Repository<CustomerEntity>,
  ): Promise<number> {
    const prefix = candidate.replace(/\d+$/, '').replace(/[^\w-]/g, '\\$&');
    const row = await customerRepo
      .createQueryBuilder('c')
      .select("MAX(SUBSTRING(c.code FROM '[0-9]+$')::bigint)", 'max')
      .where('c.organizationId = :organizationId', { organizationId })
      .andWhere('c.code ~ :pattern', { pattern: `^${prefix}[0-9]+$` })
      .getRawOne<{ max: string | null }>();

    return Number(row?.max ?? 0);
  }
}
