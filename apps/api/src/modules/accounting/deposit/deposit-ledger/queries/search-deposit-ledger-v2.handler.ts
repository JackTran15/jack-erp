import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { DepositLedgerResponse } from '@erp/shared-interfaces';
import { DepositLedgerService } from '../deposit-ledger.service';
import { SearchDepositLedgerV2Query } from './search-deposit-ledger-v2.query';

/**
 * Thin handler over DepositLedgerService.search.
 *
 * Unlike the other v2 searches, the query logic is NOT inlined here: the ledger's
 * running balance is produced by five SQL entry points that must all see the
 * identical filtered row stream (BR-LEDG-01), and the v1 endpoint plus the Excel
 * export run through the same code. Duplicating that into the handler would give
 * two implementations free to drift; delegating keeps exactly one.
 */
@QueryHandler(SearchDepositLedgerV2Query)
export class SearchDepositLedgerV2Handler
  implements IQueryHandler<SearchDepositLedgerV2Query>
{
  constructor(private readonly service: DepositLedgerService) {}

  execute({
    dto,
    actor,
  }: SearchDepositLedgerV2Query): Promise<DepositLedgerResponse> {
    return this.service.search(dto, actor);
  }
}
