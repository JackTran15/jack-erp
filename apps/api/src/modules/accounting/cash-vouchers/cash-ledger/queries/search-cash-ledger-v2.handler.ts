import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { CashLedgerResult, CashLedgerService } from '../cash-ledger.service';
import { SearchCashLedgerV2Query } from './search-cash-ledger-v2.query';

/**
 * Thin handler over CashLedgerService.search.
 *
 * Unlike the merged voucher search, the query logic is NOT inlined here: the
 * ledger's running balance is produced by five SQL entry points that must all see
 * the identical filtered row stream, and the v1 endpoint runs through the same
 * code. Duplicating that into the handler would give two implementations free to
 * drift; delegating keeps exactly one.
 */
@QueryHandler(SearchCashLedgerV2Query)
export class SearchCashLedgerV2Handler
  implements IQueryHandler<SearchCashLedgerV2Query>
{
  constructor(private readonly service: CashLedgerService) {}

  execute({ dto, actor }: SearchCashLedgerV2Query): Promise<CashLedgerResult> {
    return this.service.search(dto, actor);
  }
}
