import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ItemCategoryImportExcelField } from "@erp/shared-interfaces";
import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import { ItemCategoryEntity } from "../location/item-category.entity";
import {
  CategoryImportWorkbookService,
  CategoryWorkbookRow,
} from "./category-import-workbook.service";

@Injectable()
export class CategoryExportService {
  constructor(
    @InjectRepository(ItemCategoryEntity)
    private readonly categoryRepo: Repository<ItemCategoryEntity>,
    private readonly workbookService: CategoryImportWorkbookService,
  ) {}

  /** MISA-layout xlsx of all item categories, sorted by code. */
  async exportCategoriesExcelBuffer(actor: ActorContext): Promise<Buffer> {
    const categories = await this.categoryRepo.find({
      where: { organizationId: actor.organizationId },
      order: { code: "ASC", name: "ASC" },
    });

    const codeById = new Map(categories.map((c) => [c.id, c.code ?? ""]));

    const rows: CategoryWorkbookRow[] = categories.map((category) => ({
      [ItemCategoryImportExcelField.ITEM_CATEGORY_CODE]: category.code ?? "",
      [ItemCategoryImportExcelField.ITEM_CATEGORY_NAME]: category.name,
      // Parent by CODE; roots stay blank (the KiotViet sample's "KCT"
      // placeholder is not reproduced).
      [ItemCategoryImportExcelField.PARENT_NAME]: category.parentGroupId
        ? (codeById.get(category.parentGroupId) ?? "")
        : "",
      // TaxRate: no entity field yet — exported blank (hidden column D).
      [ItemCategoryImportExcelField.TAX_RATE]: "",
    }));

    return this.workbookService.buildWorkbookBuffer(rows);
  }
}
