import { BranchEntity } from '../../branch/branch.entity';
import { MobileInventoryStoreResponseDto } from '../dto/mobile-inventory.response.dto';

/** Một dòng của câu SQL thẻ cửa hàng: một KHO, kèm chi nhánh để gộp ở TS. */
export interface StorageRow {
  branchId: string;
  id: string;
  name: string;
  quantity: number;
  stockValue: number;
  periodIn: number;
  periodOut: number;
}

/**
 * Gộp các dòng KHO thành thẻ CỬA HÀNG, theo thứ tự của `branches`
 * (`BranchService.listMyBranches`).
 *
 * Dùng chung cho thẻ toàn cửa hàng (`/stores`) và thẻ thu hẹp về một mặt
 * hàng (`/products/:id/stores`) — cùng một phép gộp, khác nhau đúng ở
 * [keepEmpty]: thẻ toàn cửa hàng vẫn hiện chi nhánh chưa có bút toán nào
 * (cửa hàng tồn tại, chỉ là chưa có gì), còn "cửa hàng nào giữ mặt hàng này"
 * thì chi nhánh không có ô nào là câu trả lời "không giữ", tức không có thẻ.
 *
 * Map TỪNG trường của kho: `branchId`/`periodIn` của dòng SQL không được rò
 * vào phần tử `storages`.
 */
export function toStoreCards(params: {
  rows: StorageRow[];
  branches: BranchEntity[];
  branchIds: string[];
  keepEmpty: boolean;
}): MobileInventoryStoreResponseDto[] {
  const { rows, branches, branchIds, keepEmpty } = params;

  const byBranch = new Map<string, StorageRow[]>();
  for (const row of rows) {
    const bucket = byBranch.get(row.branchId) ?? [];
    bucket.push(row);
    byBranch.set(row.branchId, bucket);
  }

  return branches
    .filter((branch) => branchIds.includes(branch.id))
    .filter((branch) => keepEmpty || byBranch.has(branch.id))
    .map((branch) => {
      const storages = byBranch.get(branch.id) ?? [];

      return {
        id: branch.id,
        name: branch.name,
        quantity: sum(storages, (s) => s.quantity),
        stockValue: sum(storages, (s) => s.stockValue),
        periodIn: sum(storages, (s) => s.periodIn),
        periodOut: sum(storages, (s) => s.periodOut),
        storages: storages.map(({ id, name, quantity }) => ({
          id,
          name,
          quantity,
        })),
      };
    });
}

function sum<T>(rows: T[], pick: (row: T) => number): number {
  return rows.reduce((acc, row) => acc + pick(row), 0);
}
