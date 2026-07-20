import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ReconStatus } from '@erp/shared-interfaces';
import { ActorContext } from '../../../../common/decorators/actor-context.decorator';
import { FilterBuilder } from '../../../../common/filters/filter.builder';
import { UserEntity } from '../../../auth/user.entity';
import { DepositAccountEntity } from '../../deposit/deposit-account.entity';
import { DepositMovementEntity } from '../../deposit/deposit-movement.entity';
import {
  DepositReconRowDto,
  DepositReconSearchV2Dto,
  DepositReconSearchV2ResponseDto,
} from '../dto/deposit-recon-search-v2.dto';
import { STALE_UNRECONCILED_DAYS } from '../deposit-recon.service';
import { SearchDepositReconV2Query } from './search-deposit-recon-v2.query';

/** Rendered "name (accountNo)" label, matched by the account column filter. */
const ACCOUNT_LABEL = `btrim(COALESCE(a.name, '') || ' ' || COALESCE(a.account_no, ''))`;
/** Resolved reconciler name; reconciled_by stores a raw user id. */
const RECONCILER_NAME = `btrim(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, ''))`;
/**
 * R2 / TKT-DFR-04: the statement period matches the cleared date, not the
 * transaction date, so unsettled funds never read as a false discrepancy.
 */
const EFFECTIVE_DATE = 'COALESCE(m.value_date, m.doc_date)';

/**
 * The voucher a movement came from, so the grid's document number can open it.
 *
 * Correlated scalar subqueries rather than joins on purpose: `deposit_movement_id`
 * is 1:1 by contract but only carries a non-unique index, and a duplicate row
 * would both repeat the row and inflate the SUM behind the footer total. A scalar
 * subquery cannot multiply rows. They are added to the row query only — the
 * totals query never sees them.
 */
const LINKED_PAYMENT_ID = `(
  SELECT bp.id FROM bank_payments bp
  WHERE bp.deposit_movement_id = m.id AND bp.deleted_at IS NULL
  LIMIT 1
)`;
const LINKED_RECEIPT_ID = `(
  SELECT br.id FROM bank_receipts br
  WHERE br.deposit_movement_id = m.id AND br.deleted_at IS NULL
  LIMIT 1
)`;

interface TotalsRaw {
  total: string;
  totalAmount: string;
}

@QueryHandler(SearchDepositReconV2Query)
export class SearchDepositReconV2Handler
  implements IQueryHandler<SearchDepositReconV2Query>
{
  constructor(
    @InjectRepository(DepositMovementEntity)
    private readonly repo: Repository<DepositMovementEntity>,
  ) {}

  async execute({
    dto,
    actor,
  }: SearchDepositReconV2Query): Promise<DepositReconSearchV2ResponseDto> {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;

    const rowsQb = this.buildQuery(dto, actor)
      .addSelect(`COALESCE(a.name, '')`, 'depositAccountName')
      .addSelect(`COALESCE(a.account_no, '')`, 'depositAccountNo')
      .addSelect(RECONCILER_NAME, 'reconciledByName')
      .addSelect(LINKED_PAYMENT_ID, 'bankPaymentId')
      .addSelect(LINKED_RECEIPT_ID, 'bankReceiptId')
      // offset/limit rather than skip/take: skip/take switches TypeORM to its
      // distinct-id subquery, which drops the raw addSelect aliases above. The
      // joins are many-to-one, so no row multiplication to guard against.
      .orderBy('m.createdAt', 'DESC')
      .addOrderBy('m.id', 'DESC')
      .offset((page - 1) * limit)
      .limit(limit);

    const totalsQb = this.buildQuery(dto, actor)
      .select('COUNT(*)', 'total')
      .addSelect(`COALESCE(SUM(m.net_amount), 0)`, 'totalAmount');

    const [rows, totals, hasStaleUnreconciled] = await Promise.all([
      rowsQb.getRawAndEntities(),
      totalsQb.getRawOne<TotalsRaw>(),
      this.hasStale(dto, actor),
    ]);

    // getRawAndEntities keeps raw and entities index-aligned, so the joined
    // columns are inlined onto each row rather than returned as a root map.
    const data: DepositReconRowDto[] = rows.entities.map((m, i) => {
      const raw = rows.raw[i] as Record<string, unknown>;
      return {
        id: m.id,
        documentNumber: m.documentNumber ?? null,
        type: m.type,
        depositAccountId: m.depositAccountId,
        depositAccountName: (raw.depositAccountName as string) ?? '',
        depositAccountNo: (raw.depositAccountNo as string) ?? '',
        docDate: m.docDate,
        valueDate: m.valueDate ?? null,
        amount: Number(m.amount),
        feeAmount: Number(m.feeAmount),
        netAmount: Number(m.netAmount),
        reconStatus: m.reconStatus,
        reconciledBy: m.reconciledBy ?? null,
        reconciledByName: (raw.reconciledByName as string) ?? '',
        reconciledAt: m.reconciledAt ? m.reconciledAt.toISOString() : null,
        createdAt: m.createdAt.toISOString(),
        // Which document this row came from, so the grid can open it. POS_INVOICE
        // rows have no voucher — sourceRefId is the invoices.id instead.
        source: m.source,
        sourceRefId: m.sourceRefId ?? null,
        bankPaymentId: (raw.bankPaymentId as string) ?? null,
        bankReceiptId: (raw.bankReceiptId as string) ?? null,
      };
    });

    return {
      data,
      total: Number(totals?.total ?? 0),
      page,
      limit,
      totalAmount: Number(totals?.totalAmount ?? 0),
      hasStaleUnreconciled,
    };
  }

  /**
   * Scope + joins + every column filter. Built twice per request (rows, totals)
   * so the footer total can never disagree with the grid.
   */
  private buildQuery(
    dto: DepositReconSearchV2Dto,
    actor: ActorContext,
  ): SelectQueryBuilder<DepositMovementEntity> {
    const qb = this.repo
      .createQueryBuilder('m')
      .leftJoin(
        DepositAccountEntity,
        'a',
        'a.id = m.depositAccountId AND a.organizationId = m.organizationId',
      )
      // reconciled_by is varchar holding a user id, and users.organization_id is
      // uuid — raw snake_case columns because TypeORM does not translate
      // alias.property before a ::cast.
      .leftJoin(
        UserEntity,
        'u',
        'u.id::text = m.reconciled_by AND u.organization_id::text = m.organization_id',
      )
      .where('m.organizationId = :org', { org: actor.organizationId });

    if (actor.branchId) {
      qb.andWhere('m.branchId = :branch', { branch: actor.branchId });
    }
    if (dto.depositAccountId) {
      qb.andWhere('m.depositAccountId = :acc', { acc: dto.depositAccountId });
    }

    new FilterBuilder(qb)
      .applyString('m.documentNumber', dto.documentNumber)
      .applyEnum('m.type', dto.type?.value)
      .applyString(ACCOUNT_LABEL, dto.accountLabel)
      .applyDateRange(EFFECTIVE_DATE, dto.docDate)
      .applyDateRange('m.valueDate', dto.valueDate)
      .applyCompare('m.netAmount', dto.netAmount)
      .applyCompare('m.feeAmount', dto.feeAmount)
      .applyCompare('m.amount', dto.amount)
      .applyString(RECONCILER_NAME, dto.reconciledBy)
      .applyEnum('m.reconStatus', dto.reconStatus?.value ?? ReconStatus.CHUA);

    return qb;
  }

  /** Any unreconciled movement older than the stale threshold, within scope. */
  private async hasStale(
    dto: DepositReconSearchV2Dto,
    actor: ActorContext,
  ): Promise<boolean> {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - STALE_UNRECONCILED_DAYS);
    const count = await this.buildQuery(
      { ...dto, reconStatus: { value: ReconStatus.CHUA } },
      actor,
    )
      .andWhere('m.docDate <= :cutoff', {
        cutoff: cutoff.toISOString().slice(0, 10),
      })
      .getCount();
    return count > 0;
  }
}
