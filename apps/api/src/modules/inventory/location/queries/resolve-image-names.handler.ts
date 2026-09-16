import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemEntity } from '../item.entity';
import {
  ResolveImageNamesResponseDto,
  ResolvedImageNameDto,
  ResolvedImageNameError,
} from '../dto/resolve-image-names.dto';
import { parseImageFileName } from './parse-image-file-name';
import { ResolveImageNamesQuery } from './resolve-image-names.query';

interface ProductRow {
  id: string;
  code: string;
  name: string;
}

/**
 * One `items` row joined to its parent product. `productId` is null for an
 * orphan item; for a variant `parentCode`/`parentName` are the product's.
 */
interface ItemRow {
  id: string;
  code: string;
  name: string;
  productId: string | null;
  parentCode: string | null;
  parentName: string | null;
}

/** The owner a code resolved to — the `set-images` target. */
interface Owner {
  match: 'product' | 'orphan' | 'variant';
  ownerId: string;
  ownerCode: string | null;
  ownerName: string;
}

/**
 * `products.organization_id` and `items.organization_id` are varchar columns,
 * so `$1` is bound uncast. `is_active` is deliberately not filtered (A-13): a
 * file named after an inactive code still attaches.
 */
const PRODUCTS_BY_CODE_SQL = `
  SELECT id, code, name
  FROM products
  WHERE organization_id = $1
    AND lower(code) = ANY($2::text[])`;

const ITEMS_BY_CODE_SQL = `
  SELECT i.id, i.code, i.name,
         i.product_id AS "productId",
         p.code AS "parentCode",
         p.name AS "parentName"
  FROM items i
  LEFT JOIN products p ON p.id = i.product_id
  WHERE i.organization_id = $1
    AND lower(i.code) = ANY($2::text[])`;

/**
 * Splits each dropped file name with `parseImageFileName` and matches the
 * code, case-insensitively, inside the actor's organization (ADR-03):
 * `products.code` first, then an orphan `items.code`, then a variant
 * `items.code` — whose owner is the parent product (A-03). A code that is
 * both a product and a variant resolves to the product (A-09).
 *
 * Two SQL statements per call regardless of batch size. Within one call a
 * second name with the same `(ownerId, seq)` is flagged `DUPLICATE_SEQ`
 * (AC-16). Results come back in input order. File names are never logged.
 */
@QueryHandler(ResolveImageNamesQuery)
export class ResolveImageNamesHandler
  implements IQueryHandler<ResolveImageNamesQuery>
{
  constructor(
    @InjectRepository(ItemEntity)
    private readonly repo: Repository<ItemEntity>,
  ) {}

  async execute({
    dto,
    actor,
  }: ResolveImageNamesQuery): Promise<ResolveImageNamesResponseDto> {
    const parsed = dto.names.map((name) => ({
      name,
      ...parseImageFileName(name),
    }));

    const lowerCodes = [
      ...new Set(
        parsed.map((p) => p.code.toLowerCase()).filter((code) => code !== ''),
      ),
    ];
    const ownerByCode = await this.lookupOwners(
      lowerCodes,
      actor.organizationId,
    );

    const seenSeq = new Set<string>();
    const data: ResolvedImageNameDto[] = parsed.map((p) => {
      const owner = ownerByCode.get(p.code.toLowerCase()) ?? null;
      let error: ResolvedImageNameError | null = p.error;

      if (owner && p.seq !== null && error === null) {
        const key = `${owner.ownerId}:${p.seq}`;
        if (seenSeq.has(key)) {
          error = 'DUPLICATE_SEQ';
        } else {
          seenSeq.add(key);
        }
      }

      return {
        name: p.name,
        code: p.code,
        seq: p.seq,
        match: owner?.match ?? null,
        ownerId: owner?.ownerId ?? null,
        ownerCode: owner?.ownerCode ?? null,
        ownerName: owner?.ownerName ?? null,
        error,
      };
    });

    return { data };
  }

  /** lower(code) → owner, applying the product → orphan → variant priority. */
  private async lookupOwners(
    lowerCodes: string[],
    organizationId: string,
  ): Promise<Map<string, Owner>> {
    const owners = new Map<string, Owner>();
    if (lowerCodes.length === 0) return owners;

    const params = [organizationId, lowerCodes];
    const [products, items] = await Promise.all([
      this.repo.manager.query<ProductRow[]>(PRODUCTS_BY_CODE_SQL, params),
      this.repo.manager.query<ItemRow[]>(ITEMS_BY_CODE_SQL, params),
    ]);

    // Lowest priority first; each later pass overwrites the earlier one.
    for (const item of items) {
      // `parentName` is null only when the LEFT JOIN found no product row —
      // a dangling product_id has no owner to attach to.
      if (item.productId === null || item.parentName === null) continue;
      owners.set(item.code.toLowerCase(), {
        match: 'variant',
        ownerId: item.productId,
        ownerCode: item.parentCode,
        ownerName: item.parentName,
      });
    }
    for (const item of items) {
      if (item.productId !== null) continue;
      owners.set(item.code.toLowerCase(), {
        match: 'orphan',
        ownerId: item.id,
        ownerCode: item.code,
        ownerName: item.name,
      });
    }
    for (const product of products) {
      owners.set(product.code.toLowerCase(), {
        match: 'product',
        ownerId: product.id,
        ownerCode: product.code,
        ownerName: product.name,
      });
    }
    return owners;
  }
}
