import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

export type PosCatalogLineDto = {
  itemId: string;
  code: string;
  name: string;
  unit: string;
  sellingPrice: number;
  /** Tổng tồn tại chi nhánh (cộng mọi vị trí lưu). */
  quantityOnHand: number;
  locations: { locationId: string; quantity: number }[];
  /** Vị trí ưu tiên trừ khi bán (kho còn nhiều nhất). */
  defaultLocationId: string;
};

@Injectable()
export class PosCatalogService {
  constructor(private readonly dataSource: DataSource) {}

  async getCatalog(
    branchId: string,
    actor: ActorContext,
    search?: string,
  ): Promise<PosCatalogLineDto[]> {
    const orgId = actor.organizationId;
    const raw = search?.trim() ?? '';
    const safeSearch = raw.replace(/[%_\\]/g, '');

    const params: string[] = [orgId, branchId];
    let searchClause = '';
    if (safeSearch.length > 0) {
      const pattern = `%${safeSearch}%`;
      params.push(pattern);
      searchClause = `AND (i.name ILIKE $3 OR i.code ILIKE $3)`;
    }

    const rows: Array<{
      itemId: string;
      locationId: string;
      quantity: string;
      code: string;
      name: string;
      unit: string;
      sellingPrice: string;
    }> = await this.dataSource.query(
      `SELECT sb.item_id AS "itemId",
              sb.location_id AS "locationId",
              sb.quantity::text AS "quantity",
              i.code,
              i.name,
              i.unit,
              i.selling_price::text AS "sellingPrice"
       FROM stock_balances sb
       INNER JOIN items i
         ON i.id = sb.item_id AND i.organization_id = sb.organization_id
       WHERE sb.organization_id = $1
         AND sb.branch_id = $2
         AND i.is_active = true
         AND i.is_pos_visible = true
         ${searchClause}
       ORDER BY i.name ASC, sb.location_id ASC`,
      params,
    );

    const byItem = new Map<
      string,
      {
        itemId: string;
        code: string;
        name: string;
        unit: string;
        sellingPrice: number;
        quantityOnHand: number;
        locations: { locationId: string; quantity: number }[];
      }
    >();

    for (const r of rows) {
      const qty = Number(r.quantity);
      if (!byItem.has(r.itemId)) {
        byItem.set(r.itemId, {
          itemId: r.itemId,
          code: r.code,
          name: r.name,
          unit: r.unit,
          sellingPrice: Number(r.sellingPrice) || 0,
          quantityOnHand: 0,
          locations: [],
        });
      }
      const a = byItem.get(r.itemId)!;
      a.quantityOnHand += qty;
      a.locations.push({ locationId: r.locationId, quantity: qty });
    }

    const result: PosCatalogLineDto[] = [];
    for (const a of byItem.values()) {
      const locs = [...a.locations].sort(
        (x, y) =>
          y.quantity - x.quantity || x.locationId.localeCompare(y.locationId),
      );
      const defaultLocationId = locs[0]!.locationId;
      result.push({
        itemId: a.itemId,
        code: a.code,
        name: a.name,
        unit: a.unit,
        sellingPrice: a.sellingPrice,
        quantityOnHand: a.quantityOnHand,
        locations: locs,
        defaultLocationId,
      });
    }

    result.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return result;
  }
}
