import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as ExcelJS from "exceljs";
import { In, Repository } from "typeorm";
import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import { BranchEntity } from "../../branch/branch.entity";
import { ItemEntity } from "../location/item.entity";
import { ItemAttributeValueEntity } from "../product/item-attribute-value.entity";
import {
  StockSummaryQuery,
  StockSummaryRow,
  StockSummaryService,
} from "./stock-summary.service";

export enum StockSummaryExportVariant {
  MODEL_AND_VARIANTS = "MODEL_AND_VARIANTS",
  VARIANTS = "VARIANTS",
  SPLIT_ATTRIBUTES = "SPLIT_ATTRIBUTES",
  MODELS = "MODELS",
}

export interface StockSummaryExportQuery extends Omit<StockSummaryQuery, "organizationId" | "branchId"> {
  variant: StockSummaryExportVariant;
}

interface ItemMetadata {
  hasProduct: boolean;
  productCode: string;
  productName: string;
  color: string;
  size: string;
}

interface ExportRow {
  groupKey?: string;
  code: string;
  name: string;
  color?: string;
  size?: string;
  unit: string;
  category: string;
  brand: string;
  storage: string;
  quantity: number;
  openingQty: number;
  inQty: number;
  outQty: number;
  transferOutQty: number;
  incomingQty: number;
}

@Injectable()
export class StockSummaryExportService {
  constructor(
    private readonly summaryService: StockSummaryService,
    @InjectRepository(ItemEntity)
    private readonly itemRepo: Repository<ItemEntity>,
    @InjectRepository(ItemAttributeValueEntity)
    private readonly attrRepo: Repository<ItemAttributeValueEntity>,
    @InjectRepository(BranchEntity)
    private readonly branchRepo: Repository<BranchEntity>,
  ) {}

  async exportBuffer(
    query: StockSummaryExportQuery,
    actor: ActorContext,
  ): Promise<Buffer> {
    const rows = await this.loadAllRows(query, actor);
    const metadata = await this.loadMetadata(rows.map((row) => row.itemId));
    const exportRows = this.transformRows(rows, metadata, query.variant);
    const branch = actor.branchId
      ? await this.branchRepo.findOne({
          where: { id: actor.branchId, organizationId: actor.organizationId },
        })
      : null;
    return this.buildWorkbook(exportRows, query, branch);
  }

  private async loadAllRows(
    query: StockSummaryExportQuery,
    actor: ActorContext,
  ): Promise<StockSummaryRow[]> {
    const rows: StockSummaryRow[] = [];
    let page = 1;
    let total = 0;
    do {
      const response = await this.summaryService.getSummary({
        ...query,
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        page,
        pageSize: 200,
      });
      rows.push(...response.data);
      total = response.total;
      page += 1;
    } while (rows.length < total);
    return rows;
  }

  private async loadMetadata(itemIds: string[]): Promise<Map<string, ItemMetadata>> {
    const result = new Map<string, ItemMetadata>();
    if (!itemIds.length) return result;
    const items = await this.itemRepo.find({
      where: { id: In(itemIds) },
      relations: { product: true },
    });
    for (const item of items) {
      result.set(item.id, {
        hasProduct: Boolean(item.productId),
        productCode: item.product?.code || item.code,
        productName: item.product?.name || item.name,
        color: "",
        size: "",
      });
    }
    const attributes = await this.attrRepo
      .createQueryBuilder("attributeValue")
      .innerJoin("attributeValue.attributeDefinition", "definition")
      .innerJoin("attributeValue.option", "option")
      .where("attributeValue.itemId IN (:...itemIds)", { itemIds })
      .select([
        'attributeValue.itemId AS "item_id"',
        'definition.name AS "attribute_name"',
        'option.valueLabel AS "value_label"',
      ])
      .getRawMany<{ item_id: string; attribute_name: string; value_label: string }>();
    for (const attribute of attributes) {
      const item = result.get(attribute.item_id);
      if (!item) continue;
      const name = this.normalize(attribute.attribute_name);
      if (name === "mau" || name === "color") item.color = attribute.value_label;
      if (name === "size" || name === "kich thuoc") item.size = attribute.value_label;
    }
    return result;
  }

  private transformRows(
    rows: StockSummaryRow[],
    metadata: Map<string, ItemMetadata>,
    variant: StockSummaryExportVariant,
  ): ExportRow[] {
    const variants = rows.map((row) => {
      const meta = metadata.get(row.itemId);
      return {
        groupKey: `${meta?.productCode || row.item.code}:${row.storageId}`,
        code: row.item.code,
        name:
          variant === StockSummaryExportVariant.SPLIT_ATTRIBUTES
            ? meta?.productName || row.item.name
            : row.item.name,
        color: meta?.color || "",
        size: meta?.size || "",
        unit: row.item.unit,
        category: row.item.categoryName || "",
        brand: row.item.brand || "",
        storage: row.storage.name,
        quantity: row.quantity,
        openingQty: row.openingQty,
        inQty: row.inQty,
        outQty: row.outQty,
        transferOutQty: row.transferOutQty,
        incomingQty: row.incomingQty,
      };
    });
    if (variant === StockSummaryExportVariant.VARIANTS || variant === StockSummaryExportVariant.SPLIT_ATTRIBUTES) {
      return variants;
    }
    const models = new Map<string, ExportRow>();
    for (const row of rows) {
      const meta = metadata.get(row.itemId);
      const code = meta?.productCode || row.item.code;
      const key = `${code}:${row.storageId}`;
      const model = models.get(key) ?? {
        groupKey: key,
        code,
        name: meta?.productName || row.item.name,
        unit: row.item.unit,
        category: row.item.categoryName || "",
        brand: row.item.brand || "",
        storage: row.storage.name,
        quantity: 0,
        openingQty: 0,
        inQty: 0,
        outQty: 0,
        transferOutQty: 0,
        incomingQty: 0,
      };
      for (const field of ["quantity", "openingQty", "inQty", "outQty", "transferOutQty", "incomingQty"] as const) {
        model[field] += row[field];
      }
      models.set(key, model);
    }
    const modelRows = [...models.values()];
    if (variant === StockSummaryExportVariant.MODELS) return modelRows;
    const variantsByModel = new Map<string, ExportRow[]>();
    rows.forEach((row, index) => {
      const meta = metadata.get(row.itemId);
      if (!meta?.hasProduct) return;
      const key = `${meta?.productCode || row.item.code}:${row.storageId}`;
      variantsByModel.set(key, [...(variantsByModel.get(key) ?? []), variants[index]]);
    });
    return modelRows.flatMap((model) => [
      model,
      ...(variantsByModel.get(model.groupKey || "") ?? []),
    ]);
  }

  private async buildWorkbook(
    rows: ExportRow[],
    query: StockSummaryExportQuery,
    branch: BranchEntity | null,
  ): Promise<Buffer> {
    const split = query.variant === StockSummaryExportVariant.SPLIT_ATTRIBUTES;
    const headers = split
      ? ["Mã SKU", "Tên mẫu mã", "Màu", "Size", "Lô hàng", "Hạn sử dụng", "Cận date", "Đơn vị tính", "Nhóm hàng hóa", "Thương hiệu", "Kho", "Số lượng tồn", "Tồn đầu kỳ", "Số lượng nhập", "Số lượng xuất", "Đang chuyển đi", "Sắp nhận về"]
      : ["Mã SKU", "Tên hàng hóa", "Lô hàng", "Hạn sử dụng", "Cận date", "Đơn vị tính", "Nhóm hàng hóa", "Thương hiệu", "Kho", "Số lượng tồn", "Tồn đầu kỳ", "Số lượng nhập", "Số lượng xuất", "Đang chuyển đi", "Sắp nhận về"];
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Tổng hợp tồn kho");
    const lastColumn = headers.length;
    [1, 2, 3, 4].forEach((row) => sheet.mergeCells(row, 1, row, lastColumn));
    sheet.getCell("A1").value = branch?.name || "";
    sheet.getCell("A2").value = branch?.address || "";
    sheet.getCell("A3").value = branch?.phone ? `SĐT: ${branch.phone}` : "";
    sheet.getCell("A4").value = "TỔNG HỢP TỒN KHO";
    sheet.getCell("A5").value = `Từ ngày: ${query.startDate || ""}; Đến ngày: ${query.endDate || ""}`;
    sheet.getCell("A6").value = "Nhóm hàng hóa: Theo bộ lọc hiện tại";
    sheet.getCell("A4").font = { bold: true, size: 16 };
    sheet.getRow(7).values = headers;
    sheet.getRow(7).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(7).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A6E" } };
    sheet.getRow(7).alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    rows.forEach((row) => {
      sheet.addRow(split
        ? [row.code, row.name, row.color, row.size, "", "", "", row.unit, row.category, row.brand, row.storage, row.quantity, row.openingQty, row.inQty, row.outQty, row.transferOutQty, row.incomingQty]
        : [row.code, row.name, "", "", "", row.unit, row.category, row.brand, row.storage, row.quantity, row.openingQty, row.inQty, row.outQty, row.transferOutQty, row.incomingQty]);
    });
    const numberStart = split ? 12 : 10;
    for (let column = numberStart; column <= lastColumn; column++) {
      sheet.getColumn(column).numFmt = '#,##0.###';
    }
    sheet.columns.forEach((column, index) => {
      column.width = index === 1 ? 28 : index === 0 ? 18 : 16;
    });
    sheet.views = [{ state: "frozen", ySplit: 7 }];
    sheet.autoFilter = { from: { row: 7, column: 1 }, to: { row: 7, column: lastColumn } };
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private normalize(value: string): string {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  }
}
