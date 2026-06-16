import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { applyWorkbookFont } from '../../../../common/utils/excel-workbook-font.util';
import type { InventoryImportExportRow } from './sheets/data/data-sheet.export.utils';
import { InventoryImportTemplateSheetKey } from './inventory-import-template-sheet.constants';
import {
  STATIC_FIELD_GRID,
  STATIC_GUIDE_GRID,
} from './inventory-import-template-static';
import { buildDataSheet } from './sheets/data/data-sheet.builder';
import { buildGuideSheet } from './sheets/guide/guide-sheet.builder';
import { buildFieldSheet } from './sheets/field/field-sheet.builder';

export interface BuildItemsWorkbookOptions {
  extraColumn?: { key: string; label: string };
  /** Test-only override — skips DB lookup. */
  templateGrids?: Partial<Record<InventoryImportTemplateSheetKey, string[][]>>;
}

@Injectable()
export class InventoryImportWorkbookService {
  async buildItemsWorkbookBuffer(
    dataRows: InventoryImportExportRow[],
    options?: BuildItemsWorkbookOptions,
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();

    buildDataSheet(workbook, dataRows, {
      extraColumn: options?.extraColumn,
    });

    const guideGrid = await this.resolveTemplateGrid(
      InventoryImportTemplateSheetKey.GUIDE,
      options,
    );
    const fieldGrid = await this.resolveTemplateGrid(
      InventoryImportTemplateSheetKey.FIELD,
      options,
    );

    buildGuideSheet(workbook, guideGrid);
    buildFieldSheet(workbook, fieldGrid);

    applyWorkbookFont(workbook);
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async resolveTemplateGrid(
    key: InventoryImportTemplateSheetKey,
    options?: BuildItemsWorkbookOptions,
  ): Promise<string[][]> {
    if (options?.templateGrids?.[key]) {
      return options.templateGrids[key]!;
    }
    return key === InventoryImportTemplateSheetKey.GUIDE
      ? STATIC_GUIDE_GRID
      : STATIC_FIELD_GRID;
  }
}
