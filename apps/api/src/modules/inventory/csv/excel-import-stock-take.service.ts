import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { StockTakeStatus } from "@erp/shared-interfaces";
import * as ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { Repository } from "typeorm";
import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import { ItemEntity } from "../location/item.entity";
import { ItemBarcodeEntity } from "../location/item-barcode.entity";
import { ItemUnitEntity } from "../location/item-unit.entity";
import { LocationEntity } from "../location/location.entity";
import { StockTakeEntity } from "../stock-take/stock-take.entity";
import { StockTakeService } from "../stock-take/stock-take.service";
import {
  cellToString,
  isOleExcelBuffer,
  isZipExcelBuffer,
  parseGroupedDecimal,
} from "./inventory-excel-parse.utils";

export const STOCK_TAKE_IMPORT_FIELDS = {
  SKU: "Mã SKU",
  BARCODE: "Mã vạch",
  UNIT: "Đơn vị tính",
  LOCATION: "Vị trí",
  LOT: "Số lô",
  EXPIRY_DATE: "Hạn sử dụng",
  SERIAL_IMEI: "Serial/IMEI",
  COUNTED_QTY: "Số lượng kiểm kê",
  COUNTED_VALUE: "Giá trị kiểm kê",
  REASON: "Nguyên nhân",
} as const;

export type StockTakeImportRow = Record<string, string>;

export interface StockTakeImportRowError {
  column?: string;
  code: string;
  message: string;
}

@Injectable()
export class ExcelImportStockTakeService {
  constructor(
    @InjectRepository(ItemEntity)
    private readonly itemRepo: Repository<ItemEntity>,
    @InjectRepository(ItemBarcodeEntity)
    private readonly barcodeRepo: Repository<ItemBarcodeEntity>,
    @InjectRepository(ItemUnitEntity)
    private readonly itemUnitRepo: Repository<ItemUnitEntity>,
    @InjectRepository(LocationEntity)
    private readonly locationRepo: Repository<LocationEntity>,
    private readonly stockTakeService: StockTakeService,
  ) {}

  createDraftTarget(
    context: { storageId: string; countByValue: boolean } | undefined,
  ): StockTakeEntity {
    if (!context?.storageId) {
      throw new BadRequestException(
        "Thiếu kho kiểm kê cho dữ liệu nhập khẩu",
      );
    }
    return Object.assign(new StockTakeEntity(), {
      storageId: context.storageId,
      locationId: null,
      countByValue: context.countByValue,
      status: StockTakeStatus.DRAFT,
      lines: [],
    });
  }

  async loadDraftTarget(
    referenceId: string | undefined,
    actor: ActorContext,
  ): Promise<StockTakeEntity> {
    if (!referenceId) {
      throw new BadRequestException(
        "Thiếu mã phiếu kiểm kê cần nhập khẩu",
      );
    }
    const stockTake = await this.stockTakeService.getById(
      referenceId,
      actor,
    );
    if (stockTake.status !== StockTakeStatus.DRAFT) {
      throw new BadRequestException(
        "Chỉ có thể nhập khẩu vào phiếu kiểm kê ở trạng thái nháp",
      );
    }
    if (!stockTake.storageId) {
      throw new BadRequestException(
        "Phiếu kiểm kê chưa xác định kho",
      );
    }
    return stockTake;
  }

  async parseWorkbook(buffer: Buffer): Promise<StockTakeImportRow[]> {
    if (!buffer?.length) {
      throw new BadRequestException("Tệp Excel rỗng hoặc không hợp lệ");
    }
    if (isZipExcelBuffer(buffer)) {
      const workbook = new ExcelJS.Workbook();
      try {
        await workbook.xlsx.load(buffer as never);
      } catch {
        throw new BadRequestException(
          "Không đọc được tệp Excel .xlsx. Vui lòng kiểm tra lại tệp kiểm kê.",
        );
      }
      const sheet = workbook.worksheets[0];
      if (!sheet) {
        throw new BadRequestException("Tệp Excel không có sheet dữ liệu");
      }
      const grid: unknown[][] = [];
      for (let rowIndex = 1; rowIndex <= sheet.rowCount; rowIndex++) {
        const row = sheet.getRow(rowIndex);
        const values: unknown[] = [];
        for (let colIndex = 1; colIndex <= sheet.columnCount; colIndex++) {
          values[colIndex - 1] = row.getCell(colIndex).value;
        }
        grid.push(values);
      }
      return this.parseGrid(grid);
    }
    if (isOleExcelBuffer(buffer)) {
      let workbook: XLSX.WorkBook;
      try {
        workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
      } catch {
        throw new BadRequestException(
          "Không đọc được tệp Excel .xls. Vui lòng kiểm tra lại tệp kiểm kê.",
        );
      }
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) {
        throw new BadRequestException("Tệp Excel không có sheet dữ liệu");
      }
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

  parseCsv(text: string): StockTakeImportRow[] {
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(text, { type: "string", raw: false });
    } catch {
      throw new BadRequestException(
        "Không đọc được tệp CSV. Vui lòng kiểm tra lại định dạng tệp.",
      );
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

  isEmptyCountRow(
    row: StockTakeImportRow,
    stockTake: StockTakeEntity,
  ): boolean {
    return false;
  }

  async validateRow(
    row: StockTakeImportRow,
    stockTake: StockTakeEntity,
    actor: ActorContext,
  ): Promise<StockTakeImportRowError[]> {
    const errors: StockTakeImportRowError[] = [];
    const sku = row[STOCK_TAKE_IMPORT_FIELDS.SKU]?.trim();
    const barcode = row[STOCK_TAKE_IMPORT_FIELDS.BARCODE]?.trim();
    const locationCode = row[STOCK_TAKE_IMPORT_FIELDS.LOCATION]?.trim();

    if (!sku && !barcode) {
      errors.push({
        column: STOCK_TAKE_IMPORT_FIELDS.SKU,
        code: "REQUIRED",
        message: "Cần nhập Mã SKU hoặc Mã vạch",
      });
    } else {
      const item = await this.resolveItem(row, actor.organizationId);
      if (!item) {
        errors.push({
          column: sku
            ? STOCK_TAKE_IMPORT_FIELDS.SKU
            : STOCK_TAKE_IMPORT_FIELDS.BARCODE,
          code: "ITEM_NOT_FOUND",
          message: `Không tìm thấy hàng hóa "${sku || barcode}"`,
        });
      } else {
        await this.validateUnit(row, item, actor.organizationId, errors);
      }
    }

    if (locationCode) {
      const location = await this.findLocation(
        locationCode,
        stockTake,
        actor.organizationId,
      );
      if (!location) {
        errors.push({
          column: STOCK_TAKE_IMPORT_FIELDS.LOCATION,
          code: "LOCATION_NOT_IN_STORAGE",
          message: `Vị trí "${locationCode}" không thuộc kho kiểm kê`,
        });
      }
    }

    this.validateNumber(
      row,
      STOCK_TAKE_IMPORT_FIELDS.COUNTED_QTY,
      "INVALID_QUANTITY",
      "Số lượng kiểm kê không hợp lệ",
      errors,
    );
    if (stockTake.countByValue) {
      this.validateNumber(
        row,
        STOCK_TAKE_IMPORT_FIELDS.COUNTED_VALUE,
        "INVALID_VALUE",
        "Giá trị kiểm kê không hợp lệ",
        errors,
      );
    }
    return errors;
  }

  async commitRow(
    row: StockTakeImportRow,
    stockTake: StockTakeEntity,
    actor: ActorContext,
  ): Promise<void> {
    const sku = row[STOCK_TAKE_IMPORT_FIELDS.SKU]?.trim();
    const barcode = row[STOCK_TAKE_IMPORT_FIELDS.BARCODE]?.trim();
    const item = await this.resolveItem(row, actor.organizationId);
    if (!item) {
      throw new BadRequestException(
        `Không tìm thấy hàng hóa "${sku || barcode || ""}"`,
      );
    }

    const locationCode = row[STOCK_TAKE_IMPORT_FIELDS.LOCATION]?.trim();
    const explicitLocation = locationCode
      ? await this.findLocation(locationCode, stockTake, actor.organizationId)
      : await this.findUnassignedLocation(stockTake, actor.organizationId);
    if (locationCode && !explicitLocation) {
      throw new BadRequestException(
        `Vị trí "${locationCode}" không thuộc kho kiểm kê`,
      );
    }
    if (!locationCode && !explicitLocation) {
      throw new BadRequestException(
        'Kho kiểm kê chưa có vị trí "Chưa xếp"',
      );
    }

    let line = stockTake.lines?.find(
      (candidate) =>
        candidate.itemId === item.id &&
        (!explicitLocation || candidate.locationId === explicitLocation.id),
    );
    if (!line) {
      line = await this.stockTakeService.addLine(
        stockTake.id,
        { itemId: item.id, locationId: explicitLocation?.id },
        actor,
      );
      stockTake.lines = [...(stockTake.lines ?? []), line];
    }

    await this.stockTakeService.updateLineCount(
      stockTake.id,
      line.id,
      {
        countedQty:
          (this.parseOptionalNumber(
            row[STOCK_TAKE_IMPORT_FIELDS.COUNTED_QTY],
          ) ?? 0) *
          (await this.resolveUnitRatio(row, item, actor.organizationId)),
        countedValue: stockTake.countByValue
          ? (this.parseOptionalNumber(
              row[STOCK_TAKE_IMPORT_FIELDS.COUNTED_VALUE],
            ) ?? 0)
          : undefined,
        reason: row[STOCK_TAKE_IMPORT_FIELDS.REASON]?.trim() || undefined,
      },
      actor,
    );
  }

  private parseGrid(grid: unknown[][]): StockTakeImportRow[] {
    const normalized = grid.map((row) => row.map(cellToString));
    // startsWith thay vì includes: tránh nhầm khối hướng dẫn
    // (có nhắc tới "Mã SKU" giữa câu) thành dòng header.
    const headerIndex = normalized.findIndex((row) =>
      row.some((cell) => this.normalizeHeader(cell).startsWith("ma sku")),
    );
    if (headerIndex < 0) {
      throw new BadRequestException(
        'Tệp kiểm kê không có cột "Mã SKU"',
      );
    }

    const primary = normalized[headerIndex] ?? [];
    const secondary = normalized[headerIndex + 1] ?? [];
    let activeGroup = "";
    let skuIndex = -1;
    let barcodeIndex = -1;
    let unitIndex = -1;
    let locationIndex = -1;
    let lotIndex = -1;
    let expiryIndex = -1;
    let serialIndex = -1;
    let reasonIndex = -1;
    let countedQtyIndex = -1;
    let countedValueIndex = -1;
    let hasGroupedHeader = false;
    const columnCount = Math.max(primary.length, secondary.length);

    for (let index = 0; index < columnCount; index++) {
      const top = this.normalizeHeader(primary[index] ?? "");
      const bottom = this.normalizeHeader(secondary[index] ?? "");
      if (top) activeGroup = top;
      if (top.includes("ma sku")) skuIndex = index;
      if (top === "ma vach") barcodeIndex = index;
      if (top === "don vi tinh" || top === "dvt") unitIndex = index;
      if (top === "vi tri") locationIndex = index;
      if (top === "so lo") lotIndex = index;
      if (top === "han su dung") expiryIndex = index;
      if (top.includes("serial/imei")) serialIndex = index;
      if (top === "nguyen nhan") reasonIndex = index;
      if (top.includes("so luong kiem ke")) countedQtyIndex = index;
      if (top.includes("gia tri kiem ke")) countedValueIndex = index;
      if (bottom.includes("kiem ke") && activeGroup.includes("so luong")) {
        countedQtyIndex = index;
        hasGroupedHeader = true;
      }
      if (bottom.includes("kiem ke") && activeGroup.includes("gia tri")) {
        countedValueIndex = index;
        hasGroupedHeader = true;
      }
    }

    if (skuIndex < 0 || countedQtyIndex < 0) {
      throw new BadRequestException(
        "Tệp kiểm kê không đúng mẫu: thiếu Mã SKU hoặc Số lượng kiểm kê",
      );
    }

    const rows: StockTakeImportRow[] = [];
    const dataStartIndex = headerIndex + (hasGroupedHeader ? 2 : 1);
    for (let index = dataStartIndex; index < normalized.length; index++) {
      const source = normalized[index] ?? [];
      const firstValue = source.find((value) => value.trim())?.trim() ?? "";
      const normalizedFirstValue = this.normalizeHeader(firstValue);
      if (normalizedFirstValue.startsWith("ii.")) break;
      if (normalizedFirstValue.startsWith("tong")) continue;

      const sku = source[skuIndex]?.trim() ?? "";
      const barcode = barcodeIndex >= 0 ? source[barcodeIndex]?.trim() ?? "" : "";
      if ((!sku && !barcode) || this.normalizeHeader(sku).startsWith("tong")) continue;

      rows.push({
        [STOCK_TAKE_IMPORT_FIELDS.SKU]: sku,
        ...(barcodeIndex >= 0
          ? { [STOCK_TAKE_IMPORT_FIELDS.BARCODE]: barcode }
          : {}),
        ...(unitIndex >= 0
          ? { [STOCK_TAKE_IMPORT_FIELDS.UNIT]: source[unitIndex]?.trim() ?? "" }
          : {}),
        [STOCK_TAKE_IMPORT_FIELDS.LOCATION]:
          locationIndex >= 0 ? source[locationIndex]?.trim() ?? "" : "",
        ...(lotIndex >= 0
          ? { [STOCK_TAKE_IMPORT_FIELDS.LOT]: source[lotIndex]?.trim() ?? "" }
          : {}),
        ...(expiryIndex >= 0
          ? {
              [STOCK_TAKE_IMPORT_FIELDS.EXPIRY_DATE]:
                source[expiryIndex]?.trim() ?? "",
            }
          : {}),
        ...(serialIndex >= 0
          ? {
              [STOCK_TAKE_IMPORT_FIELDS.SERIAL_IMEI]:
                source[serialIndex]?.trim() ?? "",
            }
          : {}),
        [STOCK_TAKE_IMPORT_FIELDS.COUNTED_QTY]:
          source[countedQtyIndex]?.trim() ?? "",
        [STOCK_TAKE_IMPORT_FIELDS.COUNTED_VALUE]:
          countedValueIndex >= 0 ? source[countedValueIndex]?.trim() ?? "" : "",
        [STOCK_TAKE_IMPORT_FIELDS.REASON]:
          reasonIndex >= 0 ? source[reasonIndex]?.trim() ?? "" : "",
      });
    }
    return rows;
  }

  private normalizeHeader(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/đ/g, "d");
  }

  private async findItem(
    sku: string,
    organizationId: string,
  ): Promise<ItemEntity | null> {
    return this.itemRepo.findOne({
      where: { code: sku, organizationId, isActive: true },
    });
  }

  private async resolveItem(
    row: StockTakeImportRow,
    organizationId: string,
  ): Promise<ItemEntity | null> {
    const sku = row[STOCK_TAKE_IMPORT_FIELDS.SKU]?.trim();
    if (sku) return this.findItem(sku, organizationId);

    const barcode = row[STOCK_TAKE_IMPORT_FIELDS.BARCODE]?.trim();
    if (!barcode) return null;
    const match = await this.barcodeRepo.findOne({
      where: { code: barcode, organizationId },
    });
    if (!match) return null;
    return this.itemRepo.findOne({
      where: { id: match.itemId, organizationId, isActive: true },
    });
  }

  private async validateUnit(
    row: StockTakeImportRow,
    item: ItemEntity,
    organizationId: string,
    errors: StockTakeImportRowError[],
  ): Promise<void> {
    const unit = row[STOCK_TAKE_IMPORT_FIELDS.UNIT]?.trim();
    if (!unit || unit === item.unit) return;
    const itemUnit = await this.itemUnitRepo.findOne({
      where: { itemId: item.id, unitName: unit, organizationId },
    });
    if (!itemUnit) {
      errors.push({
        column: STOCK_TAKE_IMPORT_FIELDS.UNIT,
        code: "UNIT_NOT_FOUND",
        message: `Đơn vị tính "${unit}" không tồn tại cho hàng hóa "${item.code}"`,
      });
    }
  }

  private async resolveUnitRatio(
    row: StockTakeImportRow,
    item: ItemEntity,
    organizationId: string,
  ): Promise<number> {
    const unit = row[STOCK_TAKE_IMPORT_FIELDS.UNIT]?.trim();
    if (!unit || unit === item.unit) return 1;
    const itemUnit = await this.itemUnitRepo.findOne({
      where: { itemId: item.id, unitName: unit, organizationId },
    });
    if (!itemUnit) {
      throw new BadRequestException(
        `Đơn vị tính "${unit}" không tồn tại cho hàng hóa "${item.code}"`,
      );
    }
    return Number(itemUnit.ratio);
  }

  private async findLocation(
    code: string,
    stockTake: StockTakeEntity,
    organizationId: string,
  ): Promise<LocationEntity | null> {
    const location = await this.locationRepo.findOne({
      where: {
        code,
        organizationId,
        storageId: stockTake.storageId,
        isActive: true,
      },
    });
    if (stockTake.locationId && location?.id !== stockTake.locationId) {
      return null;
    }
    return location;
  }

  private findUnassignedLocation(
    stockTake: StockTakeEntity,
    organizationId: string,
  ): Promise<LocationEntity | null> {
    return this.locationRepo.findOne({
      where: {
        organizationId,
        storageId: stockTake.storageId,
        isActive: true,
        isUnassigned: true,
      },
    });
  }

  private validateNumber(
    row: StockTakeImportRow,
    column: string,
    code: string,
    message: string,
    errors: StockTakeImportRowError[],
  ): void {
    const raw = row[column]?.trim();
    if (raw && parseGroupedDecimal(raw) === undefined) {
      errors.push({ column, code, message });
    }
  }

  private parseOptionalNumber(value: string | undefined): number | undefined {
    if (!value?.trim()) return undefined;
    return parseGroupedDecimal(value);
  }
}
