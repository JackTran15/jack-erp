import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import {
  POS_CATALOG_SEARCH_DEFAULT_LIMIT,
  POS_CATALOG_SEARCH_MAX_LIMIT,
  PosCatalogSearchMode,
  PosCatalogSearchView,
} from '../dto/pos-catalog-search.query.dto';
import {
  PosCatalogLineResponseDto,
  PosCatalogSearchResponseDto,
  PosCatalogSuggestionDto,
} from '../dto/pos-catalog-search.response.dto';
import {
  PosCatalogLineDto,
  PosCatalogService,
} from '../services/pos-catalog.service';
import { SearchPosCatalogQuery } from './search-pos-catalog.query';

/**
 * Drops the two fields a suggestion dropdown never reads. `locations[]` is the
 * bulk of a catalogue line and only fast stock transfer consumes it;
 * `quantityOnHand` has no reader on the checkout path.
 *
 * `sellableQuantity` stays: the cashier adds straight from this dropdown into
 * the cart, and that field is what the oversell warning is measured against.
 */
const toSuggestion = (line: PosCatalogLineDto): PosCatalogSuggestionDto => ({
  itemId: line.itemId,
  productId: line.productId,
  code: line.code,
  name: line.name,
  unit: line.unit,
  sellingPrice: line.sellingPrice,
  sellableQuantity: line.sellableQuantity,
  defaultLocationId: line.defaultLocationId,
});

@QueryHandler(SearchPosCatalogQuery)
export class SearchPosCatalogHandler
  implements IQueryHandler<SearchPosCatalogQuery>
{
  constructor(private readonly catalog: PosCatalogService) {}

  async execute({
    branchId,
    dto,
    actor,
  }: SearchPosCatalogQuery): Promise<PosCatalogSearchResponseDto> {
    const result = await this.catalog.searchCatalog(branchId, actor, {
      term: dto.q,
      exactOnly: dto.mode === PosCatalogSearchMode.EXACT,
      // Clamped, not rejected: an oversized limit is a client typo, and a
      // dropdown that 400s is worse than one that returns the ceiling.
      limit: Math.min(
        dto.limit ?? POS_CATALOG_SEARCH_DEFAULT_LIMIT,
        POS_CATALOG_SEARCH_MAX_LIMIT,
      ),
      includeUntracked: dto.includeUntracked,
    });

    const suggestions =
      dto.view === PosCatalogSearchView.SUGGEST
        ? result.suggestions.map(toSuggestion)
        : (result.suggestions as PosCatalogLineResponseDto[]);

    return {
      // The exact hit keeps its full shape in both views: it goes into the cart
      // rather than into a list, and the caller may need the location it will
      // be deducted from.
      exact: (result.exact as PosCatalogLineResponseDto | null) ?? null,
      suggestions,
    };
  }
}
