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
import { ImportJobType } from "./inventory-import-job.entity";
import {
  cellToString,
  isOleExcelBuffer,
  isZipExcelBuffer,
  parseGroupedDecimal,
} from "./inventory-excel-parse.utils";

export const DOCUMENT_LINE_IMPORT_FIELDS = {
  SKU: "Mã SKU",
  BARCODE: "Mã vạch",
  ITEM_NAME: "Tên hàng hóa",
  UNIT: "Đơn vị tính",
  STORAGE: "Kho",
  LOCATION: "Vị trí",
  SOURCE_STORAGE: "Kho xuất",
  SOURCE_LOCATION: "Vị trí xuất",
  DESTINATION_STORAGE: "Kho nhập",
  DESTINATION_LOCATION: "Vị trí nhập",
  QUANTITY: "Số lượng",
  LOT: "Số lô",
  EXPIRY_DATE: "Hạn sử dụng",
  SERIAL_IMEI: "Serial/IMEI",
  UNIT_PRICE: "Đơn giá",
  LINE_TOTAL: "Thành tiền",
  NOTE: "Ghi chú",
} as const;

export type DocumentLineImportRow = Record<string, string>;

export interface DocumentLineImportMessage {
  column?: string;
  code: string;
  message: string;
}

export interface DocumentLineNormalizedData {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitPrice?: number;
  note: string;
  storageId?: string;
  storageName?: string;
  locationId?: string;
  locationCode?: string;
  locationName?: string;
  sourceStorageId?: string;
  sourceStorageName?: string;
  sourceLocationId?: string;
  sourceLocationCode?: string;
  sourceLocationName?: string;
  destinationStorageId?: string;
  destinationStorageName?: string;
  destinationLocationId?: string;
  destinationLocationCode?: string;
  destinationLocationName?: string;
}

export interface DocumentLineValidationResult {
  errors: DocumentLineImportMessage[];
  warnings: DocumentLineImportMessage[];
  normalizedData?: DocumentLineNormalizedData;
}

interface ImportShape {
  title: string;
  identityFields: string[];
  allFields: string[];
  requiredFields: string[];
}

const COMMON_FIELDS = [
  DOCUMENT_LINE_IMPORT_FIELDS.SKU,
  DOCUMENT_LINE_IMPORT_FIELDS.BARCODE,
  DOCUMENT_LINE_IMPORT_FIELDS.ITEM_NAME,
  DOCUMENT_LINE_IMPORT_FIELDS.UNIT,
  DOCUMENT_LINE_IMPORT_FIELDS.QUANTITY,
  DOCUMENT_LINE_IMPORT_FIELDS.LOT,
  DOCUMENT_LINE_IMPORT_FIELDS.EXPIRY_DATE,
  DOCUMENT_LINE_IMPORT_FIELDS.SERIAL_IMEI,
  DOCUMENT_LINE_IMPORT_FIELDS.UNIT_PRICE,
  DOCUMENT_LINE_IMPORT_FIELDS.LINE_TOTAL,
  DOCUMENT_LINE_IMPORT_FIELDS.NOTE,
];

const IMPORT_SHAPES: Record<
  ImportJobType.GOODS_ISSUE | ImportJobType.STOCK_TRANSFER | ImportJobType.TRANSFER_ORDER,
  ImportShape
> = {
  [ImportJobType.GOODS_ISSUE]: {
    title: "xuất kho",
    identityFields: [
      DOCUMENT_LINE_IMPORT_FIELDS.SKU,
      DOCUMENT_LINE_IMPORT_FIELDS.BARCODE,
    ],
    allFields: [
      ...COMMON_FIELDS.slice(0, 4),
      DOCUMENT_LINE_IMPORT_FIELDS.STORAGE,
      DOCUMENT_LINE_IMPORT_FIELDS.LOCATION,
      ...COMMON_FIELDS.slice(4),
    ],
    requiredFields: [
      DOCUMENT_LINE_IMPORT_FIELDS.STORAGE,
      DOCUMENT_LINE_IMPORT_FIELDS.QUANTITY,
    ],
  },
  [ImportJobType.STOCK_TRANSFER]: {
    title: "chuyển kho",
    identityFields: [
      DOCUMENT_LINE_IMPORT_FIELDS.SKU,
      DOCUMENT_LINE_IMPORT_FIELDS.BARCODE,
    ],
    allFields: [
      DOCUMENT_LINE_IMPORT_FIELDS.SKU,
      DOCUMENT_LINE_IMPORT_FIELDS.BARCODE,
      DOCUMENT_LINE_IMPORT_FIELDS.ITEM_NAME,
      DOCUMENT_LINE_IMPORT_FIELDS.UNIT,
      DOCUMENT_LINE_IMPORT_FIELDS.SOURCE_STORAGE,
      DOCUMENT_LINE_IMPORT_FIELDS.SOURCE_LOCATION,
      DOCUMENT_LINE_IMPORT_FIELDS.DESTINATION_STORAGE,
      DOCUMENT_LINE_IMPORT_FIELDS.DESTINATION_LOCATION,
      DOCUMENT_LINE_IMPORT_FIELDS.QUANTITY,
      DOCUMENT_LINE_IMPORT_FIELDS.LOT,
      DOCUMENT_LINE_IMPORT_FIELDS.EXPIRY_DATE,
      DOCUMENT_LINE_IMPORT_FIELDS.SERIAL_IMEI,
      DOCUMENT_LINE_IMPORT_FIELDS.UNIT_PRICE,
      DOCUMENT_LINE_IMPORT_FIELDS.LINE_TOTAL,
      DOCUMENT_LINE_IMPORT_FIELDS.NOTE,
    ],
    requiredFields: [
      DOCUMENT_LINE_IMPORT_FIELDS.SOURCE_STORAGE,
      DOCUMENT_LINE_IMPORT_FIELDS.DESTINATION_STORAGE,
      DOCUMENT_LINE_IMPORT_FIELDS.QUANTITY,
    ],
  },
  [ImportJobType.TRANSFER_ORDER]: {
    title: "lệnh điều chuyển",
    identityFields: [
      DOCUMENT_LINE_IMPORT_FIELDS.SKU,
      DOCUMENT_LINE_IMPORT_FIELDS.BARCODE,
    ],
    allFields: [
      DOCUMENT_LINE_IMPORT_FIELDS.SKU,
      DOCUMENT_LINE_IMPORT_FIELDS.BARCODE,
      DOCUMENT_LINE_IMPORT_FIELDS.ITEM_NAME,
      DOCUMENT_LINE_IMPORT_FIELDS.STORAGE,
      DOCUMENT_LINE_IMPORT_FIELDS.UNIT,
      DOCUMENT_LINE_IMPORT_FIELDS.QUANTITY,
      DOCUMENT_LINE_IMPORT_FIELDS.LOT,
      DOCUMENT_LINE_IMPORT_FIELDS.EXPIRY_DATE,
      DOCUMENT_LINE_IMPORT_FIELDS.SERIAL_IMEI,
      DOCUMENT_LINE_IMPORT_FIELDS.NOTE,
    ],
    requiredFields: [DOCUMENT_LINE_IMPORT_FIELDS.QUANTITY],
  },
};

const FIELD_ALIASES: Record<string, string[]> = {
  [DOCUMENT_LINE_IMPORT_FIELDS.SKU]: ["Mã SKU", "Mã SKU (*)"],
  [DOCUMENT_LINE_IMPORT_FIELDS.BARCODE]: ["Mã vạch", "Mã vạch (*)"],
  [DOCUMENT_LINE_IMPORT_FIELDS.ITEM_NAME]: ["Tên hàng hóa", "Tên hàng hoá"],
  [DOCUMENT_LINE_IMPORT_FIELDS.UNIT]: ["Đơn vị tính", "ĐVT"],
  [DOCUMENT_LINE_IMPORT_FIELDS.STORAGE]: ["Kho", "Kho xuất"],
  [DOCUMENT_LINE_IMPORT_FIELDS.LOCATION]: ["Vị trí", "Vị trí xuất"],
  [DOCUMENT_LINE_IMPORT_FIELDS.SOURCE_STORAGE]: ["Kho xuất", "Kho nguồn"],
  [DOCUMENT_LINE_IMPORT_FIELDS.SOURCE_LOCATION]: [
    "Vị trí xuất",
    "Vị trí nguồn",
  ],
  [DOCUMENT_LINE_IMPORT_FIELDS.DESTINATION_STORAGE]: [
    "Kho nhập",
    "Kho nhận",
    "Kho đích",
  ],
  [DOCUMENT_LINE_IMPORT_FIELDS.DESTINATION_LOCATION]: [
    "Vị trí nhập",
    "Vị trí nhận",
    "Vị trí đích",
  ],
  [DOCUMENT_LINE_IMPORT_FIELDS.QUANTITY]: ["Số lượng", "Số lượng (*)"],
  [DOCUMENT_LINE_IMPORT_FIELDS.LOT]: ["Số lô"],
  [DOCUMENT_LINE_IMPORT_FIELDS.EXPIRY_DATE]: ["Hạn sử dụng", "HSD"],
  [DOCUMENT_LINE_IMPORT_FIELDS.SERIAL_IMEI]: ["Serial/IMEI", "Serial", "IMEI"],
  [DOCUMENT_LINE_IMPORT_FIELDS.UNIT_PRICE]: ["Đơn giá"],
  [DOCUMENT_LINE_IMPORT_FIELDS.LINE_TOTAL]: ["Thành tiền"],
  [DOCUMENT_LINE_IMPORT_FIELDS.NOTE]: ["Ghi chú", "Ghi chú hàng hóa"],
};

@Injectable()
export class ExcelImportDocumentLinesService {
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

  supports(type: ImportJobType): type is keyof typeof IMPORT_SHAPES {
    return type in IMPORT_SHAPES;
  }

  async parseWorkbook(
    type: keyof typeof IMPORT_SHAPES,
    buffer: Buffer,
  ): Promise<DocumentLineImportRow[]> {
    if (!buffer?.length) {
      throw new BadRequestException("Tệp Excel rỗng hoặc không hợp lệ");
    }
    if (isZipExcelBuffer(buffer)) {
      const workbook = new ExcelJS.Workbook();
      try {
        await workbook.xlsx.load(buffer as never);
      } catch {
        throw new BadRequestException(
          `Không đọc được tệp Excel ${IMPORT_SHAPES[type].title}`,
        );
      }
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new BadRequestException("Tệp Excel không có sheet dữ liệu");
      const grid: unknown[][] = [];
      for (let rowIndex = 1; rowIndex <= sheet.rowCount; rowIndex++) {
        const row = sheet.getRow(rowIndex);
        const values: unknown[] = [];
        for (let colIndex = 1; colIndex <= sheet.columnCount; colIndex++) {
          values[colIndex - 1] = row.getCell(colIndex).value;
        }
        grid.push(values);
      }
      return this.parseGrid(type, grid);
    }
    if (isOleExcelBuffer(buffer)) {
      let workbook: XLSX.WorkBook;
      try {
        workbook = XLSX.read(buffer, { type: "buffer", raw: false });
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (
          message.includes("password-protected") ||
          message.includes("Encryption")
        ) {
          throw new BadRequestException(
            "Không đọc được tệp Excel được bảo vệ. Vui lòng mở file mẫu, lưu lại thành file Excel không đặt mật khẩu rồi nhập khẩu lại.",
          );
        }
        throw new BadRequestException(
          `Không đọc được tệp Excel ${IMPORT_SHAPES[type].title}`,
        );
      }
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new BadRequestException("Tệp Excel không có sheet dữ liệu");
      return this.parseGrid(
        type,
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

  parseCsv(
    type: keyof typeof IMPORT_SHAPES,
    text: string,
  ): DocumentLineImportRow[] {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(text, { type: "string", raw: false });
    } catch {
      throw new BadRequestException("Không đọc được tệp CSV nhập khẩu");
    }
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) return [];
    return this.parseGrid(
      type,
      XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: "",
        raw: false,
      }),
    );
  }

  async validateAndNormalizeRow(
    type: keyof typeof IMPORT_SHAPES,
    row: DocumentLineImportRow,
    actor: ActorContext,
  ): Promise<DocumentLineValidationResult> {
    const errors: DocumentLineImportMessage[] = [];
    const warnings: DocumentLineImportMessage[] = [];
    const sku = this.value(row, DOCUMENT_LINE_IMPORT_FIELDS.SKU);
    const barcode = this.value(row, DOCUMENT_LINE_IMPORT_FIELDS.BARCODE);
    const item = await this.resolveItem(sku, barcode, actor, errors);
    const quantity = this.parseNumber(
      row,
      DOCUMENT_LINE_IMPORT_FIELDS.QUANTITY,
      errors,
      { required: true, positive: true, maxDecimals: 3 },
    );
    const importedPrice = this.parseNumber(
      row,
      DOCUMENT_LINE_IMPORT_FIELDS.UNIT_PRICE,
      errors,
      { required: false, positive: false, maxDecimals: 2 },
    );
    const unit = this.value(row, DOCUMENT_LINE_IMPORT_FIELDS.UNIT);
    if (item && unit && this.normalize(unit) !== this.normalize(item.unit)) {
      errors.push({
        column: DOCUMENT_LINE_IMPORT_FIELDS.UNIT,
        code: "UNIT_MISMATCH",
        message: `Đơn vị tính phải là "${item.unit}"`,
      });
    }
    const note = this.value(row, DOCUMENT_LINE_IMPORT_FIELDS.NOTE);
    if (note.length > 500) {
      errors.push({
        column: DOCUMENT_LINE_IMPORT_FIELDS.NOTE,
        code: "NOTE_TOO_LONG",
        message: "Ghi chú không được vượt quá 500 ký tự",
      });
    }

    const normalized: Partial<DocumentLineNormalizedData> = {};

    if (type === ImportJobType.GOODS_ISSUE) {
      await this.resolveStorageAndLocation(
        row,
        actor,
        DOCUMENT_LINE_IMPORT_FIELDS.STORAGE,
        DOCUMENT_LINE_IMPORT_FIELDS.LOCATION,
        errors,
        normalized,
        "",
        { requireStorage: true, requireLocation: false },
      );
    } else if (type === ImportJobType.STOCK_TRANSFER) {
      await this.resolveStorageAndLocation(
        row,
        actor,
        DOCUMENT_LINE_IMPORT_FIELDS.SOURCE_STORAGE,
        DOCUMENT_LINE_IMPORT_FIELDS.SOURCE_LOCATION,
        errors,
        normalized,
        "source",
        { requireStorage: true, requireLocation: false },
      );
      await this.resolveStorageAndLocation(
        row,
        actor,
        DOCUMENT_LINE_IMPORT_FIELDS.DESTINATION_STORAGE,
        DOCUMENT_LINE_IMPORT_FIELDS.DESTINATION_LOCATION,
        errors,
        normalized,
        "destination",
        { requireStorage: true, requireLocation: false },
      );
    } else if (type === ImportJobType.TRANSFER_ORDER) {
      await this.resolveStorageAndLocation(
        row,
        actor,
        DOCUMENT_LINE_IMPORT_FIELDS.STORAGE,
        undefined,
        errors,
        normalized,
        "source",
        { requireStorage: false, requireLocation: false },
      );
    }

    if (errors.length || !item || quantity == null) {
      return { errors, warnings };
    }

    return {
      errors,
      warnings,
      normalizedData: {
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        unit: item.unit,
        quantity,
        note,
        ...(importedPrice != null ? { unitPrice: importedPrice } : {}),
        ...normalized,
      } as DocumentLineNormalizedData,
    };
  }

  private parseGrid(
    type: keyof typeof IMPORT_SHAPES,
    grid: unknown[][],
  ): DocumentLineImportRow[] {
    const shape = IMPORT_SHAPES[type];
    const normalized = grid.map((row) => row.map(cellToString));
    const headerIndex = normalized.findIndex((row) =>
      row.some((cell) =>
        shape.identityFields.some(
          (field) =>
            this.normalizeHeader(cell) === this.normalizeHeader(field),
        ),
      ),
    );
    if (headerIndex < 0) {
      throw new BadRequestException(
        `Tệp ${shape.title} không có cột "Mã SKU" hoặc "Mã vạch"`,
      );
    }

    const headers = normalized[headerIndex].map((value) => value.trim());
    for (const required of shape.requiredFields) {
      if (this.findHeaderIndex(headers, required) === undefined) {
        throw new BadRequestException(
          `Tệp ${shape.title} không có cột "${required}"`,
        );
      }
    }

    return normalized
      .slice(headerIndex + 1)
      .map((source) => {
        const row: DocumentLineImportRow = {};
        for (const field of shape.allFields) {
          const index = this.findHeaderIndex(headers, field);
          if (index !== undefined) row[field] = source[index]?.trim() ?? "";
        }
        return row;
      })
      .filter((row) =>
        shape.allFields.some(
          (field) =>
            field !== DOCUMENT_LINE_IMPORT_FIELDS.LINE_TOTAL &&
            this.value(row, field),
        ),
      );
  }

  private findHeaderIndex(
    headers: string[],
    field: string,
  ): number | undefined {
    const aliases = FIELD_ALIASES[field] ?? [field];
    const index = headers.findIndex((header) =>
      aliases.some(
        (alias) =>
          this.normalizeHeader(header) === this.normalizeHeader(alias),
      ),
    );
    return index >= 0 ? index : undefined;
  }

  private async resolveStorageAndLocation(
    row: DocumentLineImportRow,
    actor: ActorContext,
    storageField: string,
    locationField: string | undefined,
    errors: DocumentLineImportMessage[],
    normalized: Partial<DocumentLineNormalizedData>,
    prefix: "" | "source" | "destination",
    options: { requireStorage: boolean; requireLocation: boolean },
  ): Promise<void> {
    const storageName = this.value(row, storageField);
    const locationCode = locationField ? this.value(row, locationField) : "";
    const storage = storageName
      ? await this.storageRepo.findOne({
          where: {
            organizationId: actor.organizationId,
            branchId: actor.branchId,
            name: ILike(storageName),
          },
        })
      : null;
    if ((options.requireStorage || storageName) && !storage) {
      errors.push({
        column: storageField,
        code: "STORAGE_NOT_FOUND",
        message: storageName
          ? `Không tìm thấy kho "${storageName}" trong chi nhánh hiện tại`
          : `${storageField} không được để trống`,
      });
      return;
    }

    if (storage) {
      this.setStorage(normalized, prefix, storage.id, storage.name);
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
    if ((options.requireLocation || locationCode) && storage && !location) {
      errors.push({
        column: locationField,
        code: "LOCATION_NOT_FOUND",
        message: locationCode
          ? `Vị trí "${locationCode}" không thuộc kho đã chọn`
          : `${locationField ?? "Vị trí"} không được để trống`,
      });
      return;
    }

    if (location) {
      this.setLocation(
        normalized,
        prefix,
        location.id,
        location.code,
        location.name,
      );
    }
  }

  private setStorage(
    normalized: Partial<DocumentLineNormalizedData>,
    prefix: "" | "source" | "destination",
    id: string,
    name: string,
  ): void {
    if (prefix === "source") {
      normalized.sourceStorageId = id;
      normalized.sourceStorageName = name;
    } else if (prefix === "destination") {
      normalized.destinationStorageId = id;
      normalized.destinationStorageName = name;
    } else {
      normalized.storageId = id;
      normalized.storageName = name;
    }
  }

  private setLocation(
    normalized: Partial<DocumentLineNormalizedData>,
    prefix: "" | "source" | "destination",
    id: string,
    code: string,
    name: string,
  ): void {
    if (prefix === "source") {
      normalized.sourceLocationId = id;
      normalized.sourceLocationCode = code;
      normalized.sourceLocationName = name;
    } else if (prefix === "destination") {
      normalized.destinationLocationId = id;
      normalized.destinationLocationCode = code;
      normalized.destinationLocationName = name;
    } else {
      normalized.locationId = id;
      normalized.locationCode = code;
      normalized.locationName = name;
    }
  }

  private async resolveItem(
    sku: string,
    barcode: string,
    actor: ActorContext,
    errors: DocumentLineImportMessage[],
  ): Promise<ItemEntity | null> {
    if (!sku && !barcode) {
      errors.push({
        column: DOCUMENT_LINE_IMPORT_FIELDS.SKU,
        code: "REQUIRED",
        message: "Cần nhập Mã SKU hoặc Mã vạch",
      });
      return null;
    }
    const bySku = sku
      ? await this.itemRepo.findOne({
          where: {
            organizationId: actor.organizationId,
            code: ILike(sku),
            isActive: true,
          },
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
        column: DOCUMENT_LINE_IMPORT_FIELDS.BARCODE,
        code: "ITEM_IDENTITY_CONFLICT",
        message: "Mã SKU và Mã vạch thuộc hai hàng hóa khác nhau",
      });
      return null;
    }
    const item = bySku ?? byBarcode;
    if (!item) {
      errors.push({
        column: sku
          ? DOCUMENT_LINE_IMPORT_FIELDS.SKU
          : DOCUMENT_LINE_IMPORT_FIELDS.BARCODE,
        code: "ITEM_NOT_FOUND",
        message: `Không tìm thấy hàng hóa "${sku || barcode}"`,
      });
    }
    return item;
  }

  private parseNumber(
    row: DocumentLineImportRow,
    field: string,
    errors: DocumentLineImportMessage[],
    options: { required: boolean; positive: boolean; maxDecimals: number },
  ): number | undefined {
    const raw = this.value(row, field);
    if (!raw) {
      if (options.required) {
        errors.push({
          column: field,
          code: "REQUIRED",
          message: `${field} không được để trống`,
        });
      }
      return undefined;
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
        code:
          field === DOCUMENT_LINE_IMPORT_FIELDS.QUANTITY
            ? "INVALID_QUANTITY"
            : "INVALID_UNIT_PRICE",
        message: `${field} không hợp lệ`,
      });
      return undefined;
    }
    return value;
  }

  private value(row: DocumentLineImportRow, field: string): string {
    return String(row[field] ?? "").trim();
  }

  private normalize(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
  }

  private normalizeHeader(value: string): string {
    return this.normalize(value).replace(/\s*\(\s*\*\s*\)\s*$/, "");
  }
}
