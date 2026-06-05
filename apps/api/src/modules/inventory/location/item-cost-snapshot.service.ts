import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ItemEntity } from './item.entity';

/**
 * Centralized helper to snapshot `items.purchase_price` as a cost basis for
 * ledger movements that don't carry a unit price in their source payload
 * (stock transfers, adjustments, stock-takes, return-ins, sale deductions).
 *
 * Decimal columns come back as strings from TypeORM — this service coerces
 * them to numbers so callers can read a guaranteed `number`.
 */
@Injectable()
export class ItemCostSnapshotService {
  constructor(
    @InjectRepository(ItemEntity)
    private readonly itemRepo: Repository<ItemEntity>,
  ) {}

  /**
   * Bulk-fetch purchase price for the given itemIds within an organization.
   * Returns a Map keyed by itemId → unitCost (number). Missing items default to 0.
   */
  async snapshotCosts(
    organizationId: string,
    itemIds: string[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (itemIds.length === 0) return result;

    const items = await this.itemRepo.find({
      where: { id: In(itemIds), organizationId },
      select: ['id', 'purchasePrice'],
    });
    for (const it of items) {
      result.set(it.id, Number(it.purchasePrice ?? 0));
    }
    // Fill 0 for any missing items so callers can always read a number
    for (const id of itemIds) {
      if (!result.has(id)) result.set(id, 0);
    }
    return result;
  }

  /** Single-item shorthand. Returns 0 if item not found. */
  async snapshotOne(organizationId: string, itemId: string): Promise<number> {
    const map = await this.snapshotCosts(organizationId, [itemId]);
    return map.get(itemId) ?? 0;
  }
}
