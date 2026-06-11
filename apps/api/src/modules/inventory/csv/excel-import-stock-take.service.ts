import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { StockTakeStatus } from "@erp/shared-interfaces";
import * as ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { Repository } from "typeorm";
import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import { ItemEntity } from "../location/item.entity";
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
  LOCATION: "Vị trí",
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
      actor.organizationId,
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
    const qty = row[STOCK_TAKE_IMPORT_FIELDS.COUNTED_QTY]?.trim();
    const value = row[STOCK_TAKE_IMPORT_FIELDS.COUNTED_VALUE]?.trim();
    return !qty && (!stockTake.countByValue || !value);
  }

  async validateRow(
    row: StockTakeImportRow,
    stockTake: StockTakeEntity,
    actor: ActorContext,
  ): Promise<StockTakeImportRowError[]> {
    const errors: StockTakeImportRowError[] = [];
    const sku = row[STOCK_TAKE_IMPORT_FIELDS.SKU]?.trim();
    const locationCode = row[STOCK_TAKE_IMPORT_FIELDS.LOCATION]?.trim();

    if (!sku) {
      errors.push({
        column: STOCK_TAKE_IMPORT_FIELDS.SKU,
        code: "REQUIRED",
        message: "Mã SKU không được để trống",
      });
    } else {
      const item = await this.findItem(sku, actor.organizationId);
      if (!item) {
        errors.push({
          column: STOCK_TAKE_IMPORT_FIELDS.SKU,
          code: "SKU_NOT_FOUND",
          message: `Không tìm thấy hàng hóa có mã SKU "${sku}"`,
        });
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
    const item = sku ? await this.findItem(sku, actor.organizationId) : null;
    if (!item) {
      throw new BadRequestException(`Không tìm thấy hàng hóa có mã SKU "${sku}"`);
    }

    const locationCode = row[STOCK_TAKE_IMPORT_FIELDS.LOCATION]?.trim();
    const explicitLocation = locationCode
      ? await this.findLocation(locationCode, stockTake, actor.organizationId)
      : undefined;
    if (locationCode && !explicitLocation) {
      throw new BadRequestException(
        `Vị trí "${locationCode}" không thuộc kho kiểm kê`,
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
        countedQty: this.parseOptionalNumber(
          row[STOCK_TAKE_IMPORT_FIELDS.COUNTED_QTY],
        ),
        countedValue: stockTake.countByValue
          ? this.parseOptionalNumber(
              row[STOCK_TAKE_IMPORT_FIELDS.COUNTED_VALUE],
            )
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
    let locationIndex = -1;
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
      if (top === "vi tri") locationIndex = index;
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
      if (!sku || this.normalizeHeader(sku).startsWith("tong")) continue;

      rows.push({
        [STOCK_TAKE_IMPORT_FIELDS.SKU]: sku,
        [STOCK_TAKE_IMPORT_FIELDS.LOCATION]:
          locationIndex >= 0 ? source[locationIndex]?.trim() ?? "" : "",
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
