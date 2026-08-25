/**
 * Test double for the `invoice_items` repository, covering only what
 * `loadSignedLineDiscounts` asks of it: a grouped, `direction`-signed sum of
 * `lineDiscount + promotionDiscount` per invoice.
 *
 * Lives beside the production code rather than under a spec so the four report
 * specs that need it share one definition. It is not imported by anything that
 * ships — `jest.config` only picks up `*.spec.ts` as suites.
 */
import { Repository } from 'typeorm';
import {
  InvoiceItemEntity,
  ItemDirection,
} from '../../pos/entities/invoice-item.entity';

export interface FakeLine {
  invoiceId: string;
  direction?: ItemDirection;
  lineDiscount?: number;
  promotionDiscount?: number;
}

export function fakeLineItemsRepo(
  lines: FakeLine[] = [],
): Repository<InvoiceItemEntity> {
  const repo = {
    createQueryBuilder: () => {
      let ids: string[] = [];
      const qb: Record<string, unknown> = {
        select: () => qb,
        addSelect: () => qb,
        where: (_sql: string, params: { ids: string[] }) => {
          ids = params.ids;
          return qb;
        },
        setParameter: () => qb,
        groupBy: () => qb,
        getRawMany: () => {
          const sums = new Map<string, number>();
          for (const l of lines) {
            if (!ids.includes(l.invoiceId)) continue;
            const sign = l.direction === ItemDirection.IN ? -1 : 1;
            const amount =
              Number(l.lineDiscount ?? 0) + Number(l.promotionDiscount ?? 0);
            sums.set(l.invoiceId, (sums.get(l.invoiceId) ?? 0) + sign * amount);
          }
          return Promise.resolve(
            [...sums].map(([invoiceId, amount]) => ({
              invoiceId,
              amount: String(amount),
            })),
          );
        },
      };
      return qb;
    },
    // The report specs that also read lines directly (`find`) get an empty list
    // unless they override it; this double only models the grouped path.
    find: () => Promise.resolve([]),
  };
  return repo as unknown as Repository<InvoiceItemEntity>;
}
