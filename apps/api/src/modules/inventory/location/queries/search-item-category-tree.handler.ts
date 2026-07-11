import { IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import { InjectRepository } from "@nestjs/typeorm";
import { FindOptionsWhere, Repository } from "typeorm";
import {
  ItemCategoryTreeNodeDto,
  SearchItemCategoryTreeResponseDto,
} from "../dto/search-item-category-tree.dto";
import { ItemCategoryEntity } from "../item-category.entity";
import { SearchItemCategoryTreeQuery } from "./search-item-category-tree.query";

@QueryHandler(SearchItemCategoryTreeQuery)
export class SearchItemCategoryTreeHandler implements IQueryHandler<SearchItemCategoryTreeQuery> {
  constructor(
    @InjectRepository(ItemCategoryEntity)
    private readonly repo: Repository<ItemCategoryEntity>,
  ) {}

  async execute({
    dto,
    actor,
  }: SearchItemCategoryTreeQuery): Promise<SearchItemCategoryTreeResponseDto> {
    const where: FindOptionsWhere<ItemCategoryEntity> = {
      organizationId: actor.organizationId,
    };
    if (dto.status) where.status = dto.status;

    const all = await this.repo.find({
      where,
      order: { code: "ASC", name: "ASC" },
    });
    const byId = new Map(all.map((c) => [c.id, c]));

    const search = dto.search?.trim().toLowerCase();
    const matches = (c: ItemCategoryEntity): boolean =>
      !search ||
      (c.name?.toLowerCase().includes(search) ?? false) ||
      (c.code?.toLowerCase().includes(search) ?? false);

    // A node is a root when it has no parent, or its parent is missing/filtered
    // out (e.g. parent was soft-deleted via ON DELETE SET NULL semantics).
    const isRoot = (c: ItemCategoryEntity): boolean =>
      !c.parentGroupId || !byId.has(c.parentGroupId);
    const childrenOf = (id: string): ItemCategoryEntity[] =>
      all.filter((c) => c.parentGroupId === id && byId.has(c.parentGroupId));

    const toNode = (c: ItemCategoryEntity): ItemCategoryTreeNodeDto => ({
      id: c.id,
      code: c.code ?? null,
      name: c.name,
      description: c.description ?? null,
      parentGroupId: c.parentGroupId ?? null,
      status: c.status,
      children: childrenOf(c.id).map(toNode),
    });

    let roots = all.filter(isRoot).map(toNode);

    if (search) {
      const prune = (
        node: ItemCategoryTreeNodeDto,
      ): ItemCategoryTreeNodeDto | null => {
        const entity = byId.get(node.id);
        const selfMatches = entity ? matches(entity) : false;
        if (selfMatches) return node;

        const children = node.children
          .map(prune)
          .filter((child): child is ItemCategoryTreeNodeDto => child != null);
        if (children.length === 0) return null;
        return { ...node, children };
      };
      roots = roots
        .map(prune)
        .filter((node): node is ItemCategoryTreeNodeDto => node != null);
    }

    return { data: roots };
  }
}
