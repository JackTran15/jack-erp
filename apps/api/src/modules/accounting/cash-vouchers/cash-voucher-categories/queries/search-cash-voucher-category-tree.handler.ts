import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { CashVoucherCategoryEntity } from '../cash-voucher-category.entity';
import {
  CashVoucherCategoryTreeNodeDto,
  SearchCashVoucherCategoryTreeResponseDto,
} from '../dto/search-cash-voucher-category-tree.dto';
import { SearchCashVoucherCategoryTreeQuery } from './search-cash-voucher-category-tree.query';

/**
 * Mục thu / Mục chi as a nested tree, assembled in memory the same way as
 * `SearchItemCategoryTreeHandler`: one org has tens to a few hundred rows,
 * so a single `find` beats a recursive CTE and has no page cap.
 */
@QueryHandler(SearchCashVoucherCategoryTreeQuery)
export class SearchCashVoucherCategoryTreeHandler
  implements IQueryHandler<SearchCashVoucherCategoryTreeQuery>
{
  constructor(
    @InjectRepository(CashVoucherCategoryEntity)
    private readonly repo: Repository<CashVoucherCategoryEntity>,
  ) {}

  async execute({
    dto,
    actor,
  }: SearchCashVoucherCategoryTreeQuery): Promise<SearchCashVoucherCategoryTreeResponseDto> {
    const where: FindOptionsWhere<CashVoucherCategoryEntity> = {
      organizationId: actor.organizationId,
    };
    if (dto.direction) where.direction = dto.direction;
    if (dto.isActive !== undefined) where.isActive = dto.isActive;

    // Sibling order: display_order first, name as the tie-break.
    const all = await this.repo.find({
      where,
      order: { displayOrder: 'ASC', name: 'ASC' },
    });
    const byId = new Map(all.map((c) => [c.id, c]));

    const search = dto.search?.trim().toLowerCase();
    const matches = (c: CashVoucherCategoryEntity): boolean =>
      !search ||
      c.name.toLowerCase().includes(search) ||
      c.code.toLowerCase().includes(search);

    // A node is a root when it has no parent, or its parent is not in the
    // loaded set (soft-deleted, or filtered out by direction/isActive).
    const isRoot = (c: CashVoucherCategoryEntity): boolean =>
      !c.parentGroupId || !byId.has(c.parentGroupId);
    const childrenOf = (id: string): CashVoucherCategoryEntity[] =>
      all.filter((c) => c.parentGroupId === id);

    const toNode = (c: CashVoucherCategoryEntity): CashVoucherCategoryTreeNodeDto => ({
      id: c.id,
      code: c.code,
      name: c.name,
      description: c.description ?? null,
      direction: c.direction,
      isActive: c.isActive,
      displayOrder: c.displayOrder,
      parentGroupId: c.parentGroupId ?? null,
      createdAt: c.createdAt,
      children: childrenOf(c.id).map(toNode),
    });

    let roots = all.filter(isRoot).map(toNode);

    if (search) {
      // A matching node keeps its whole subtree; a non-matching node survives
      // only as the path to a matching descendant.
      const prune = (
        node: CashVoucherCategoryTreeNodeDto,
      ): CashVoucherCategoryTreeNodeDto | null => {
        const entity = byId.get(node.id);
        if (entity && matches(entity)) return node;

        const children = node.children
          .map(prune)
          .filter((child): child is CashVoucherCategoryTreeNodeDto => child != null);
        if (children.length === 0) return null;
        return { ...node, children };
      };
      roots = roots
        .map(prune)
        .filter((node): node is CashVoucherCategoryTreeNodeDto => node != null);
    }

    return { data: roots };
  }
}
