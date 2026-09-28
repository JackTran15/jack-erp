import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { InjectRepository } from '@nestjs/typeorm';
import { Raw, Repository } from 'typeorm';
import { PromotionDiscountMode, PromotionTargetType } from '@erp/shared-interfaces';
import { ItemEntity } from '../../../inventory/location/item.entity';
import { ProductEntity } from '../../../inventory/product/product.entity';
import {
  ItemDiscountWorkbookRow,
  parseItemDiscountWorkbook,
} from '../../infrastructure/excel/item-discount-workbook';
import {
  ImportedItemDiscountLine,
  ImportItemDiscountLinesResult,
  ImportItemDiscountRowError,
  ItemDiscountExcelMethod,
} from '../dto/item-discount-excel.dto';
import { ImportItemDiscountLinesQuery } from './import-item-discount-lines.query';

const MISSING_CODE_MESSAGE = 'Thiếu mã SKU';

const INVALID_VALUE_MESSAGE: Record<ItemDiscountExcelMethod, string> = {
  [PromotionDiscountMode.PERCENT]: '% giảm giá phải lớn hơn 0 và không quá 100',
  [PromotionDiscountMode.AMOUNT]: 'Số tiền giảm phải lớn hơn 0',
};

/** So khớp mã: bỏ khoảng trắng hai đầu, không phân biệt hoa thường (A-12). */
function normalizeCode(code: string): string {
  return code.trim().toLowerCase();
}

/**
 * Đọc giá trị ô theo A-13: `%` thì `0 < v ≤ 100`, `Số tiền` thì `v > 0`.
 * Nhận số JS hoặc chuỗi số thuần (`"30"`, `"12.5"`) qua `Number(...)`. Không xử lý dấu
 * phân cách hàng nghìn (`"1.000"` là 1, `"1,000"` là lỗi): ô số của Excel đến đây đã là
 * `number`, chuỗi có dấu phân cách chỉ xuất hiện khi người dùng gõ tay dạng text.
 */
function parseValue(raw: unknown, method: ItemDiscountExcelMethod): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw !== 'number' && typeof raw !== 'string') return undefined;
  const text = String(raw).trim();
  if (text === '') return undefined;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  if (method === PromotionDiscountMode.PERCENT && value > 100) return undefined;
  return value;
}

interface ResolvedTarget {
  targetType: PromotionTargetType.ITEM | PromotionTargetType.PRODUCT;
  targetId: string;
  code: string;
  name: string;
}

/**
 * Kiểm tra từng dòng của file nhập khẩu và tra mã theo lô trong tổ chức: một truy vấn
 * `items`, phần còn lại một truy vấn `products`. Không ghi DB. Mỗi dòng lỗi báo đúng một
 * lý do, theo thứ tự ưu tiên: thiếu mã, trùng mã, giá trị, không tìm thấy.
 */
@QueryHandler(ImportItemDiscountLinesQuery)
export class ImportItemDiscountLinesHandler implements IQueryHandler<ImportItemDiscountLinesQuery> {
  constructor(
    @InjectRepository(ItemEntity) private readonly itemRepo: Repository<ItemEntity>,
    @InjectRepository(ProductEntity) private readonly productRepo: Repository<ProductEntity>,
  ) {}

  async execute({ buffer, method, actor }: ImportItemDiscountLinesQuery): Promise<ImportItemDiscountLinesResult> {
    const fileRows = await parseItemDiscountWorkbook(buffer, method);

    const rowNumbersByCode = new Map<string, number[]>();
    for (const row of fileRows) {
      if (row.code === '') continue;
      const key = normalizeCode(row.code);
      rowNumbersByCode.set(key, [...(rowNumbersByCode.get(key) ?? []), row.rowNumber]);
    }

    const errorByRow = new Map<number, ImportItemDiscountRowError>();
    const pending: { row: ItemDiscountWorkbookRow; key: string; value: number }[] = [];
    for (const row of fileRows) {
      if (row.code === '') {
        errorByRow.set(row.rowNumber, { rowNumber: row.rowNumber, message: MISSING_CODE_MESSAGE });
        continue;
      }
      const key = normalizeCode(row.code);
      const sameCodeRows = rowNumbersByCode.get(key)!;
      if (sameCodeRows.length > 1) {
        errorByRow.set(row.rowNumber, {
          rowNumber: row.rowNumber,
          code: row.code,
          message: `Mã SKU bị trùng trong file (dòng ${sameCodeRows.join(', ')})`,
        });
        continue;
      }
      const value = parseValue(row.rawValue, method);
      if (value === undefined) {
        errorByRow.set(row.rowNumber, { rowNumber: row.rowNumber, code: row.code, message: INVALID_VALUE_MESSAGE[method] });
        continue;
      }
      pending.push({ row, key, value });
    }

    const targetByCode = await this.resolveCodes(
      pending.map((p) => p.key),
      actor.organizationId,
    );

    const lineByRow = new Map<number, ImportedItemDiscountLine>();
    for (const { row, key, value } of pending) {
      const target = targetByCode.get(key);
      if (!target) {
        errorByRow.set(row.rowNumber, {
          rowNumber: row.rowNumber,
          code: row.code,
          message: `Không tìm thấy hàng hóa có mã '${row.code}'`,
        });
        continue;
      }
      lineByRow.set(row.rowNumber, { rowNumber: row.rowNumber, ...target, value });
    }

    // Both lists keep file order.
    const rows: ImportedItemDiscountLine[] = [];
    const errors: ImportItemDiscountRowError[] = [];
    for (const { rowNumber } of fileRows) {
      const line = lineByRow.get(rowNumber);
      if (line) rows.push(line);
      const error = errorByRow.get(rowNumber);
      if (error) errors.push(error);
    }
    return { rows, errors };
  }

  /** Items trước, mã còn lại tra mẫu mã (A-12). Kết quả khoá theo mã đã chuẩn hoá. */
  private async resolveCodes(keys: string[], organizationId: string): Promise<Map<string, ResolvedTarget>> {
    const targets = new Map<string, ResolvedTarget>();
    if (keys.length === 0) return targets;

    const items = await this.itemRepo.find({
      select: { id: true, code: true, name: true },
      where: { organizationId, code: matchNormalizedCode(keys) },
    });
    for (const item of items) {
      const key = normalizeCode(item.code);
      if (!targets.has(key)) {
        targets.set(key, { targetType: PromotionTargetType.ITEM, targetId: item.id, code: item.code, name: item.name });
      }
    }

    const remaining = keys.filter((key) => !targets.has(key));
    if (remaining.length === 0) return targets;

    const products = await this.productRepo.find({
      select: { id: true, code: true, name: true },
      where: { organizationId, code: matchNormalizedCode(remaining) },
    });
    for (const product of products) {
      const key = normalizeCode(product.code ?? '');
      if (key && !targets.has(key)) {
        targets.set(key, {
          targetType: PromotionTargetType.PRODUCT,
          targetId: product.id,
          code: product.code!,
          name: product.name,
        });
      }
    }
    return targets;
  }
}

/** `LOWER(TRIM(code)) IN (:...codes)` — các mã đã chuẩn hoá bằng `normalizeCode`. */
function matchNormalizedCode(codes: string[]) {
  return Raw((alias) => `LOWER(TRIM(${alias})) IN (:...codes)`, { codes });
}
