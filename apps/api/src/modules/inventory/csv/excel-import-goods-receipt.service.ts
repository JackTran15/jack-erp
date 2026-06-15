import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import * as ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { ILike, Repository } from "typeorm";
import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import { ItemBarcodeEntity } from "../location/item-barcode.entity";
import { ItemEntity } from "../location/item.entity";
import { LocationEntity } from "../location/location.entity";
import { StorageEntity } from "../location/storage.entity";
import {
  cellToString,
  isOleExcelBuffer,
  isZipExcelBuffer,
  parseGroupedDecimal,
} from "./inventory-excel-parse.utils";

export const GOODS_RECEIPT_IMPORT_FIELDS = {
  SKU: "Mã SKU",
  BARCODE: "Mã vạch",
  ITEM_NAME: "Tên hàng hóa",
  UNIT: "Đơn vị tính",
  STORAGE: "Kho",
  LOCATION: "Vị trí",
  QUANTITY: "Số lượng",
  UNIT_PRICE: "Đơn giá",
  LINE_TOTAL: "Thành tiền",
  NOTE: "Ghi chú",
} as const;

export type GoodsReceiptImportRow = Record<string, string>;

export interface GoodsReceiptImportMessage {
  column?: string;
  code: string;
  message: string;
}

export interface GoodsReceiptNormalizedData {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  storageId: string;
  storageName: string;
  locationId: string;
  locationCode: string;
  locationName: string;
  quantity: number;
  unitPrice: number;
  note: string;
}

export interface GoodsReceiptValidationResult {
  errors: GoodsReceiptImportMessage[];
  warnings: GoodsReceiptImportMessage[];
  normalizedData?: GoodsReceiptNormalizedData;
}

const FIELD_ORDER = Object.values(GOODS_RECEIPT_IMPORT_FIELDS);

@Injectable()
export class ExcelImportGoodsReceiptService {
  constructor(
    @InjectRepository(ItemEntity)
    private readonly itemRepo: Repository<ItemEntity>,
    @InjectRepository(ItemBarcodeEntity)
    private readonly barcodeRepo: Repository<ItemBarcodeEntity>,
    @InjectRepository(StorageEntity)
    private readonly storageRepo: Repository<StorageEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
  ) {}

  async parseWorkbook(buffer: Buffer): Promise<GoodsReceiptImportRow[]> {
    if (!buffer?.length) {
      throw new BadRequestException("Tệp Excel rỗng hoặc không hợp lệ");
    }
    if (isZipExcelBuffer(buffer)) {
      const workbook = new ExcelJS.Workbook();
      try {
        await workbook.xlsx.load(buffer as never);
      } catch {
        throw new BadRequestException("Không đọc được tệp Excel nhập kho");
      }
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new BadRequestException("Tệp Excel không có sheet dữ liệu");
      const grid: unknown[][] = [];
      for (let rowIndex = 1; rowIndex <= sheet.rowCount; rowIndex++) {
        const values: unknown[] = [];
        for (let colIndex = 1; colIndex <= sheet.columnCount; colIndex++) {
          values[colIndex - 1] = sheet.getRow(rowIndex).getCell(colIndex).value;
        }
        grid.push(values);
      }
      return this.parseGrid(grid);
    }
    if (isOleExcelBuffer(buffer)) {
      let workbook: XLSX.WorkBook;
      try {
        workbook = XLSX.read(buffer, { type: "buffer", raw: false });
      } catch {
        throw new BadRequestException("Không đọc được tệp Excel nhập kho");
      }
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new BadRequestException("Tệp Excel không có sheet dữ liệu");
      return this.parseGrid(
        XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          defval: "",
          raw: false,
        }),
      );
    }
    throw new BadRequestException(
      "Định dạng tệp Excel không hợp lệ. Vui lòng dùng .xlsx hoặc .xls",
    );
  }

  parseCsv(text: string): GoodsReceiptImportRow[] {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(text, { type: "string", raw: false });
    } catch {
      throw new BadRequestException("Không đọc được tệp CSV nhập kho");
    }
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return [];
    return this.parseGrid(
      XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: "",
        raw: false,
      }),
    );
  }

  async validateAndNormalizeRow(
    row: GoodsReceiptImportRow,
    actor: ActorContext,
  ): Promise<GoodsReceiptValidationResult> {
    const errors: GoodsReceiptImportMessage[] = [];
    const warnings: GoodsReceiptImportMessage[] = [];
    const sku = this.value(row, GOODS_RECEIPT_IMPORT_FIELDS.SKU);
    const barcode = this.value(row, GOODS_RECEIPT_IMPORT_FIELDS.BARCODE);
    const item = await this.resolveItem(sku, barcode, actor, errors);
    const storageName = this.value(row, GOODS_RECEIPT_IMPORT_FIELDS.STORAGE);
    const locationCode = this.value(row, GOODS_RECEIPT_IMPORT_FIELDS.LOCATION);
    const storage = storageName
      ? await this.storageRepo.findOne({
          where: {
            organizationId: actor.organizationId,
            branchId: actor.branchId,
            name: ILike(storageName),
          },
        })
      : null;
    if (!storageName || !storage) {
      errors.push({
        column: GOODS_RECEIPT_IMPORT_FIELDS.STORAGE,
        code: "STORAGE_NOT_FOUND",
        message: storageName
          ? `Không tìm thấy kho "${storageName}" trong chi nhánh hiện tại`
          : "Kho không được để trống",
      });
    }
    const location =
      storage && locationCode
        ? await this.locationRepo.findOne({
            where: {
              organizationId: actor.organizationId,
              storageId: storage.id,
              code: ILike(locationCode),
              isActive: true,
            },
          })
        : null;
    if (!locationCode || (storage && !location)) {
      errors.push({
        column: GOODS_RECEIPT_IMPORT_FIELDS.LOCATION,
        code: "LOCATION_NOT_FOUND",
        message: locationCode
          ? `Vị trí "${locationCode}" không thuộc kho đã chọn`
          : "Vị trí không được để trống",
      });
    }

    const quantity = this.parseNumber(
      row,
      GOODS_RECEIPT_IMPORT_FIELDS.QUANTITY,
      errors,
      { required: true, positive: true, maxDecimals: 3 },
    );
    const importedPrice = this.parseNumber(
      row,
      GOODS_RECEIPT_IMPORT_FIELDS.UNIT_PRICE,
      errors,
      { required: false, positive: false, maxDecimals: 2 },
    );
    const note = this.value(row, GOODS_RECEIPT_IMPORT_FIELDS.NOTE);
    if (note.length > 500) {
      errors.push({
        column: GOODS_RECEIPT_IMPORT_FIELDS.NOTE,
        code: "NOTE_TOO_LONG",
        message: "Ghi chú không được vượt quá 500 ký tự",
      });
    }
    const unit = this.value(row, GOODS_RECEIPT_IMPORT_FIELDS.UNIT);
    if (item && unit && this.normalize(unit) !== this.normalize(item.unit)) {
      errors.push({
        column: GOODS_RECEIPT_IMPORT_FIELDS.UNIT,
        code: "UNIT_MISMATCH",
        message: `Đơn vị tính phải là "${item.unit}"`,
      });
    }

    if (errors.length || !item || !storage || !location || quantity == null) {
      return { errors, warnings };
    }
    const defaultPrice = Number(item.purchasePrice ?? 0);
    const unitPrice = importedPrice ?? defaultPrice;
    if (importedPrice == null && defaultPrice === 0) {
      warnings.push({
        column: GOODS_RECEIPT_IMPORT_FIELDS.UNIT_PRICE,
        code: "MISSING_PURCHASE_PRICE",
        message: "Hàng hóa chưa có giá mua mặc định, đơn giá được đặt bằng 0",
      });
    }
    return {
      errors,
      warnings,
      normalizedData: {
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        unit: item.unit,
        storageId: storage.id,
        storageName: storage.name,
        locationId: location.id,
        locationCode: location.code,
        locationName: location.name,
        quantity,
        unitPrice,
        note,
      },
    };
  }

  async buildTemplateBuffer(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Jack ERP";
    const sheet = workbook.addWorksheet("Danh sách hàng hóa nhập kho");
    sheet.mergeCells("A1:J1");
    sheet.getCell("A1").value = "DANH SÁCH HÀNG HÓA NHẬP KHO";
    sheet.getCell("A1").font = { bold: true, size: 16 };
    sheet.getCell("A1").alignment = { horizontal: "center" };
    sheet.mergeCells("A3:J3");
    sheet.getCell("A3").value =
      "Nhập Mã SKU hoặc Mã vạch. Kho và Vị trí phải thuộc chi nhánh hiện tại. Khuyến nghị tối đa 200 dòng.";
    sheet.getCell("A3").alignment = { wrapText: true };
    sheet.getRow(6).values = FIELD_ORDER;
    sheet.getRow(6).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(6).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1E3A6E" },
    };
    sheet.getRow(6).alignment = { horizontal: "center", vertical: "middle" };
    const widths = [18, 18, 28, 14, 22, 18, 14, 16, 18, 28];
    widths.forEach((width, index) => {
      sheet.getColumn(index + 1).width = width;
    });
    for (let row = 7; row <= 206; row++) {
      sheet.getCell(row, 9).value = {
        formula: `IF(OR(G${row}="",H${row}=""),"",G${row}*H${row})`,
      };
    }
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private parseGrid(grid: unknown[][]): GoodsReceiptImportRow[] {
    const normalized = grid.map((row) => row.map(cellToString));
    const headerIndex = normalized.findIndex((row) =>
      row.some((cell) =>
        [
          GOODS_RECEIPT_IMPORT_FIELDS.SKU,
          GOODS_RECEIPT_IMPORT_FIELDS.BARCODE,
        ].some(
          (identityField) =>
            this.normalizeHeader(cell) === this.normalizeHeader(identityField),
        ),
      ),
    );
    if (headerIndex < 0) {
      throw new BadRequestException(
        'Tệp nhập kho không có cột "Mã SKU" hoặc "Mã vạch"',
      );
    }
    const headers = normalized[headerIndex].map((value) => value.trim());
    for (const required of [
      GOODS_RECEIPT_IMPORT_FIELDS.STORAGE,
      GOODS_RECEIPT_IMPORT_FIELDS.LOCATION,
      GOODS_RECEIPT_IMPORT_FIELDS.QUANTITY,
    ]) {
      if (
        !headers.some(
          (header) =>
            this.normalizeHeader(header) === this.normalizeHeader(required),
        )
      ) {
        throw new BadRequestException(`Tệp nhập kho không có cột "${required}"`);
      }
    }
    return normalized
      .slice(headerIndex + 1)
      .map((source) => {
        const row: GoodsReceiptImportRow = {};
        headers.forEach((header, index) => {
          const field = FIELD_ORDER.find(
            (candidate) =>
              this.normalizeHeader(candidate) === this.normalizeHeader(header),
          );
          if (field) row[field] = source[index]?.trim() ?? "";
        });
        return row;
      })
      .filter((row) =>
        FIELD_ORDER.some(
          (field) =>
            field !== GOODS_RECEIPT_IMPORT_FIELDS.LINE_TOTAL &&
            this.value(row, field),
        ),
      );
  }

  private async resolveItem(
    sku: string,
    barcode: string,
    actor: ActorContext,
    errors: GoodsReceiptImportMessage[],
  ): Promise<ItemEntity | null> {
    if (!sku && !barcode) {
      errors.push({
        column: GOODS_RECEIPT_IMPORT_FIELDS.SKU,
        code: "REQUIRED",
        message: "Cần nhập Mã SKU hoặc Mã vạch",
      });
      return null;
    }
    const bySku = sku
      ? await this.itemRepo.findOne({
          where: { organizationId: actor.organizationId, code: ILike(sku), isActive: true },
        })
      : null;
    let byBarcode: ItemEntity | null = null;
    if (barcode) {
      const barcodeEntity = await this.barcodeRepo.findOne({
        where: { organizationId: actor.organizationId, code: barcode },
      });
      byBarcode = barcodeEntity
        ? await this.itemRepo.findOne({
            where: {
              id: barcodeEntity.itemId,
              organizationId: actor.organizationId,
              isActive: true,
            },
          })
        : null;
    }
    if (sku && barcode && bySku && byBarcode && bySku.id !== byBarcode.id) {
      errors.push({
        column: GOODS_RECEIPT_IMPORT_FIELDS.BARCODE,
        code: "ITEM_IDENTITY_CONFLICT",
        message: "Mã SKU và Mã vạch thuộc hai hàng hóa khác nhau",
      });
      return null;
    }
    const item = bySku ?? byBarcode;
    if (!item) {
      errors.push({
        column: sku ? GOODS_RECEIPT_IMPORT_FIELDS.SKU : GOODS_RECEIPT_IMPORT_FIELDS.BARCODE,
        code: "ITEM_NOT_FOUND",
        message: `Không tìm thấy hàng hóa "${sku || barcode}"`,
      });
    }
    return item;
  }

  private parseNumber(
    row: GoodsReceiptImportRow,
    field: string,
    errors: GoodsReceiptImportMessage[],
    options: { required: boolean; positive: boolean; maxDecimals: number },
  ): number | null {
    const raw = this.value(row, field);
    if (!raw) {
      if (options.required) {
        errors.push({ column: field, code: "REQUIRED", message: `${field} không được để trống` });
      }
      return null;
    }
    const value = parseGroupedDecimal(raw);
    const decimalCount = (String(value).split(".")[1] ?? "").length;
    if (
      value == null ||
      !Number.isFinite(value) ||
      (options.positive ? value <= 0 : value < 0) ||
      decimalCount > options.maxDecimals
    ) {
      errors.push({
        column: field,
        code: field === GOODS_RECEIPT_IMPORT_FIELDS.QUANTITY ? "INVALID_QUANTITY" : "INVALID_UNIT_PRICE",
        message: `${field} không hợp lệ`,
      });
      return null;
    }
    return value;
  }

  private value(row: GoodsReceiptImportRow, field: string): string {
    return String(row[field] ?? "").trim();
  }

  private normalize(value: string): string {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  }

  private normalizeHeader(value: string): string {
    return this.normalize(value).replace(/\s*\(\s*\*\s*\)\s*$/, "");
  }
}
