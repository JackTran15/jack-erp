import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { ActorContext } from "../../../common/decorators/actor-context.decorator";
import { ItemEntity } from "../location/item.entity";
import { ItemAttributeValueEntity } from "../product/item-attribute-value.entity";
import {
  BarcodeLabelExportRow,
  BarcodeLabelWorkbookService,
} from "./barcode-label-workbook.service";

/** Một dòng người dùng đã gom trên màn hình "In tem mã". */
export interface BarcodeLabelExportInput {
  itemId: string;
  quantity: number;
}

interface ItemAttrSnapshot {
  color: string;
  size: string;
}

/** Tên chiều thuộc tính (đã lowercase) được coi là cột "Màu sắc" / "Size". */
const COLOR_NAMES = ["color", "màu", "màu sắc"];
const SIZE_NAMES = ["size", "kích cỡ", "kích thước"];

@Injectable()
export class BarcodeLabelExportService {
  constructor(
    @InjectRepository(ItemEntity)
    private readonly itemRepo: Repository<ItemEntity>,
    @InjectRepository(ItemAttributeValueEntity)
    private readonly attrValRepo: Repository<ItemAttributeValueEntity>,
    private readonly workbookService: BarcodeLabelWorkbookService,
  ) {}

  /**
   * Dựng file xuất khẩu từ danh sách dòng client gửi lên. Client chỉ gửi
   * itemId + số lượng in; các cột còn lại được bổ sung từ DB.
   */
  async exportExcelBuffer(
    inputs: BarcodeLabelExportInput[],
    actor: ActorContext,
  ): Promise<Buffer> {
    const itemIds = [...new Set(inputs.map((i) => i.itemId))];
    const items = itemIds.length
      ? await this.itemRepo.find({
          where: { id: In(itemIds), organizationId: actor.organizationId },
        })
      : [];
    const itemById = new Map(items.map((item) => [item.id, item]));
    const attrByItemId = await this.loadAttrMap(items.map((i) => i.id));

    // Giữ nguyên thứ tự dòng trên lưới; bỏ dòng trỏ tới hàng hoá không còn tồn tại.
    const rows: BarcodeLabelExportRow[] = [];
    for (const input of inputs) {
      const item = itemById.get(input.itemId);
      if (!item) continue;
      const attrs = attrByItemId.get(item.id);
      rows.push({
        sku: item.code,
        name: item.name,
        // Tem in mã vạch CODE128 từ chính mã SKU — xuất khẩu bám theo giá trị đó.
        barcode: item.code,
        color: attrs?.color ?? "",
        size: attrs?.size ?? "",
        description: item.description ?? "",
        unit: item.unit ?? "",
        sellingPrice: Number(item.sellingPrice) || 0,
        quantity: input.quantity,
      });
    }

    return this.workbookService.buildWorkbookBuffer(rows);
  }

  /**
   * Map itemId → {color, size}. Tên chiều thuộc tính do người dùng tự đặt nên
   * nhận cả tiếng Việt lẫn tiếng Anh (dữ liệu thực tế đang dùng "Màu").
   */
  private async loadAttrMap(
    itemIds: string[],
  ): Promise<Map<string, ItemAttrSnapshot>> {
    const map = new Map<string, ItemAttrSnapshot>();
    if (!itemIds.length) return map;

    const vals = await this.attrValRepo
      .createQueryBuilder("av")
      .innerJoin("av.attributeDefinition", "def")
      .innerJoin("av.option", "opt")
      .where("av.itemId IN (:...itemIds)", { itemIds })
      .andWhere("LOWER(def.name) IN (:...attrNames)", {
        attrNames: [...COLOR_NAMES, ...SIZE_NAMES],
      })
      .select(["av.itemId", "def.name", "opt.valueLabel"])
      .getRawMany<{
        av_item_id: string;
        def_name: string;
        opt_value_label: string;
      }>();

    for (const row of vals) {
      const snap = map.get(row.av_item_id) ?? { color: "", size: "" };
      const lower = row.def_name?.toLowerCase() ?? "";
      if (COLOR_NAMES.includes(lower)) snap.color = row.opt_value_label ?? "";
      else if (SIZE_NAMES.includes(lower)) snap.size = row.opt_value_label ?? "";
      map.set(row.av_item_id, snap);
    }
    return map;
  }
}
