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

  /**
   * MISA-layout xlsx of all item categories in UI tree order: depth-first,
   * children right under their parent, each level sorted by code.
   */
  async exportCategoriesExcelBuffer(actor: ActorContext): Promise<Buffer> {
    const categories = await this.categoryRepo.find({
      where: { organizationId: actor.organizationId },
      order: { code: "ASC", name: "ASC" },
    });

    const codeById = new Map(categories.map((c) => [c.id, c.code ?? ""]));
    const byId = new Map(categories.map((c) => [c.id, c]));

    // Same root/children semantics as SearchItemCategoryTreeHandler; the
    // code-sorted input keeps every sibling level sorted by code.
    const childrenOf = new Map<string, ItemCategoryEntity[]>();
    const roots: ItemCategoryEntity[] = [];
    for (const category of categories) {
      if (category.parentGroupId && byId.has(category.parentGroupId)) {
        const siblings = childrenOf.get(category.parentGroupId) ?? [];
        siblings.push(category);
        childrenOf.set(category.parentGroupId, siblings);
      } else {
        roots.push(category);
      }
    }

    const ordered: ItemCategoryEntity[] = [];
    const visit = (category: ItemCategoryEntity) => {
      ordered.push(category);
      for (const child of childrenOf.get(category.id) ?? []) visit(child);
    };
    roots.forEach(visit);

    const rows: CategoryWorkbookRow[] = ordered.map((category) => ({
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
