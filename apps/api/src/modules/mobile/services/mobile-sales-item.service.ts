import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { escapeLikeTerm } from '../../../common/utils/like-escape.util';
import { ItemEntity } from '../../inventory/location/item.entity';
import { PosCatalogProductService } from '../../pos/services/pos-catalog-product.service';
import { MobileSalesModelStockDto } from '../dto/mobile-sales-model-stock.response.dto';
import { MobileSalesItemViewBy } from '../dto/mobile-sales-item-list.query.dto';
import {
  MobileSalesItemPageDto,
  MobileSalesItemResponseDto,
} from '../dto/mobile-sales-item.response.dto';
import {
  MobileSalesModelDetailDto,
  MobileSalesVariantAttributeDto,
} from '../dto/mobile-sales-model.response.dto';

interface CountRow {
  total: number;
}

interface ProductRow {
  id: string;
  code: string;
  name: string;
}

interface VariantRow {
  id: string;
  code: string;
  name: string;
  variantLabel: string | null;
  unit: string;
  sellingPrice: number;
}

interface BarcodeRow {
  itemId: string;
  code: string;
}

interface AttributeValueRow {
  itemId: string;
  attributeName: string;
  attributeSort: number;
  valueLabel: string;
  valueSort: number;
}

interface ModelRow {
  type: 'model' | 'item';
  id: string;
  code: string;
  name: string;
  variantLabel: string | null;
  unit: string;
  sellingPrice: number;
  variantCount: number;
}

/**
 * Tổng tồn CÓ DẤU của một tập item tại MỘT chi nhánh, dưới dạng một câu SQL con.
 *
 * Chép có chủ ý cùng bộ điều kiện với `stockTotalColumn` bên
 * `search-inventory-items-v2.handler.ts` — `is_tracked`, kho và vị trí còn hoạt
 * động — và đó là điều KHÔNG được đổi một phía: nhãn *"Hàng hoá còn hàng
 * (SL > 0)"* trên app phải là phần bù chặt của nút *"Trạng thái hết hàng"*
 * (`<= 0`) trên web. Lệch một điều kiện là cùng một mặt hàng hiện ở cả hai bộ
 * lọc đối nhau, và không có gì báo.
 *
 * [itemPredicate] nối tập item vào hàng đang xét. [orgRef]/[branchRef] là
 * THAM CHIẾU tham số đã viết sẵn — `$1` cho raw SQL, `:org` cho QueryBuilder —
 * chứ không phải giá trị: hai nhánh gọi hàm này chạy trên hai cơ chế đánh tham
 * số khác nhau, và trộn hai quy ước trong một câu lệnh là lỗi lúc chạy.
 */
const stockTotalSql = (
  itemPredicate: string,
  orgRef: string,
  branchRef: string,
): string => `
  COALESCE((
    SELECT SUM(sb.quantity)
    FROM stock_balances sb
    JOIN locations loc ON loc.id = sb.location_id
    JOIN storages  st  ON st.id  = loc.storage_id
    WHERE ${itemPredicate}
      AND sb.organization_id = ${orgRef}
      AND sb.branch_id = ${branchRef}
      AND sb.is_tracked = true
      AND loc.is_active = true
      AND st.is_active = true
  ), 0)`;

/**
 * Danh mục hàng hoá của màn BÁN HÀNG — có HAI mức, chọn bằng `viewBy`.
 *
 * Gần như song sinh với `MobileItemService`, và ba khác biệt đều có chủ ý:
 *
 * 1. Trả `sellingPrice` thay `purchasePrice` — lý do đầy đủ ở doc của
 *    `MobileSalesItemResponseDto`.
 * 2. Lọc thêm `isPosVisible` — hàng có thể còn kinh doanh nhưng cố ý không bày
 *    ở quầy (hàng nội bộ, vật tư đóng gói).
 * 3. Không nhận `branchId` cho DANH MỤC: danh mục là chung theo TỔ CHỨC. Chi
 *    nhánh chỉ dự phần khi lọc theo TỒN KHO, và lúc đó nó lấy từ
 *    `actor.branchId` chứ không từ query — xem cảnh báo về thứ tự
 *    jwt > header > jwtList ở doc của `inStockOnly`.
 *
 * Đã cân nhắc và TỪ CHỐI việc gộp hai service bằng một tham số `mode`: hai
 * đường sẽ phân kỳ tiếp, và một service hai chế độ thì mỗi lần thêm cột lại
 * phải hỏi "chế độ nào được thấy cột này".
 *
 * ---
 *
 * **Vì sao mức `model` KHÔNG dùng `COMBINED_CTE`** dù CTE đó cũng gộp theo mẫu
 * mã. Ba khác biệt về NGHĨA, không phải về hình thức:
 *
 * 1. CTE kia tính `bool_and(i.is_active)` / `bool_and(i.is_pos_visible)` — một
 *    mẫu mã mười biến thể chỉ cần MỘT biến thể ngừng bán là cả mẫu mã biến mất
 *    khỏi danh mục. Trên màn quản lý danh mục điều đó vô hại (nó không lọc);
 *    trên màn BÁN HÀNG nó là mất hàng bán được. Ở đây điều kiện nằm trong
 *    `JOIN`, nên mẫu mã hiện khi CÒN ÍT NHẤT MỘT biến thể bán được, và giá
 *    trung bình cũng chỉ tính trên đúng các biến thể đó.
 * 2. CTE kia kéo theo `barcode` (một subquery `string_agg` cho MỖI dòng) và
 *    `purchase_price` — thứ đầu là trả tiền cho dữ liệu không ai đọc, thứ hai
 *    là giá vốn, đúng thứ endpoint này tồn tại để không rò.
 * 3. Nhánh `orphan` của nó không trả `variant_label`.
 *
 * Đây là một truy vấn KHÁC NGHĨA, không phải bản sao của truy vấn kia — và
 * chỉnh CTE dùng chung cho hợp màn bán hàng sẽ đổi luôn lưới
 * `/admin/inventory-items` của web.
 */
@Injectable()
export class MobileSalesItemService {
  constructor(
    @InjectRepository(ItemEntity)
    private readonly items: Repository<ItemEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly posCatalog: PosCatalogProductService,
  ) {}

  /**
   * Tồn kho của một mẫu mã — ba chiều: theo biến thể, theo kho, theo chi nhánh khác.
   *
   * UỶ QUYỀN, không tự tính. `PosCatalogProductService` là nơi duy nhất biết các luật đã đóng
   * gói ở đó: kho tồn 0 vẫn liệt kê (A-07), kho chính lên đầu (A-10), balance của một kho đã
   * ngưng hoạt động thì BỎ chứ không dồn vào bucket nào (A-08), chi nhánh không ACTIVE thì
   * không tính. Viết lại chúng ở đây là chép một danh sách ngoại lệ mà lần sau chỉ một bên
   * được sửa.
   *
   * `kind: 'PRODUCT'` tường minh: `id` ở đây LUÔN là `products.id`, và để service tự dò sang
   * `items` khi không thấy sẽ biến một mã sai thành một kết quả trông như đúng.
   */
  async getModelStock(productId: string, actor: ActorContext): Promise<MobileSalesModelStockDto> {
    const branchId = actor.branchId;
    if (!branchId) {
      throw new BadRequestException('Chưa chọn cửa hàng làm việc');
    }

    const detail = await this.posCatalog.getProductDetail(branchId, productId, 'PRODUCT', actor);

    return {
      productId,
      variants: detail.variants.map((variant) => ({
        itemId: variant.itemId,
        quantity: variant.quantityOnHand,
        storages: (variant.storages ?? []).map((storage) => ({
          storageId: storage.storageId,
          name: storage.name,
          quantity: storage.quantity,
        })),
        otherBranches: (variant.otherBranches ?? []).map((branch) => ({
          branchId: branch.branchId,
          name: branch.name,
          quantity: branch.quantity,
          storages: branch.storages.map((storage) => ({
            storageId: storage.storageId,
            name: storage.name,
            quantity: storage.quantity,
          })),
        })),
      })),
    };
  }

  async list(
    query: {
      page: number;
      limit: number;
      search?: string;
      viewBy?: MobileSalesItemViewBy;
      inStockOnly?: boolean;
      categoryId?: string;
    },
    actor: ActorContext,
  ): Promise<MobileSalesItemPageDto> {
    const branchId = query.inStockOnly ? this.requireBranch(actor) : undefined;
    const categoryIds = await this.categorySubtreeOf(query.categoryId, actor);

    // So với `ITEM` chứ không với `MODEL`: mặc định là mức MẪU MÃ, nên thiếu
    // tham số phải rơi vào nhánh gộp. Viết ngược lại thì một client cũ không
    // gửi `viewBy` sẽ lặng lẽ nhận về mức biến thể.
    return query.viewBy === MobileSalesItemViewBy.ITEM
      ? this.listItems(query, actor, branchId, categoryIds)
      : this.listModels(query, actor, branchId, categoryIds);
  }

  /**
   * Lọc theo tồn kho mà không có chi nhánh thì MỌI mặt hàng đều tổng bằng 0 và
   * cả danh mục đọc ra là hết hàng — một câu trả lời sai mà trông như đúng.
   * Từ chối thẳng, y hệt `SearchInventoryItemsV2Handler`.
   *
   * Trên thực tế nhánh này gần như KHÔNG chạy: `ActorContext` lùi về
   * `JWT.branchIds[0]` khi không có gì khác, nên chỉ người dùng **không được
   * phân công chi nhánh nào** mới rơi vào đây. Vẫn giữ vì đó đúng là ca phải
   * từ chối, và vì nó là chỗ duy nhất nói ra rằng bộ lọc này VÔ NGHĨA nếu
   * không có chi nhánh.
   */
  private requireBranch(actor: ActorContext): string {
    if (!actor.branchId) {
      throw new BadRequestException(
        'A branch must be selected to filter by stock availability.',
      );
    }

    return actor.branchId;
  }

  /** Một dòng = một BIẾN THỂ. Đây là mức mặc định, và là mức bán được ngay. */
  /**
   * `categoryId` cùng TOÀN BỘ nhóm con của nó.
   *
   * Bản đầu lọc `item.category_id = :categoryId` — khớp ĐÚNG một nhóm. Hệ quả
   * đo được ngày 2026-09-10: lọc theo nhóm CHA *Giày dép* trả về **0** dòng
   * trong khi nhóm con *Giày nhập* trả về 1, vì hàng hoá luôn được gán vào
   * nhóm LÁ. App vì thế phải bày nhóm cha thành một tiêu đề không chạm được —
   * một hạn chế của backend đội lốt một quyết định giao diện.
   *
   * MISA cho chọn cả nhóm cha (ảnh Loc gửi 2026-09-10), và đó là hành vi đúng:
   * người bán nghĩ theo "giày dép", không theo "nhóm lá nào".
   *
   * `WITH RECURSIVE` chứ không nạp cả cây rồi lọc trong Node: cây nhóm hàng
   * không có trần độ sâu, và một vòng lặp phía app sẽ phải tự chống chu trình.
   * Postgres có `CYCLE` sẵn từ 14 — nhưng ta không dùng nó ở đây mà chặn bằng
   * `UNION` (khử trùng lặp), vì `CYCLE` đòi thêm một cột phụ mà truy vấn này
   * không cần.
   */
  private async categorySubtreeOf(
    categoryId: string | undefined,
    actor: ActorContext,
  ): Promise<string[] | undefined> {
    if (!categoryId) return undefined;

    const rows: Array<{ id: string }> = await this.dataSource.query(
      `WITH RECURSIVE subtree AS (
         SELECT id FROM inventory_item_categories
          WHERE id = $1 AND organization_id = $2
         UNION
         SELECT c.id FROM inventory_item_categories c
           JOIN subtree s ON c.parent_group_id = s.id
          WHERE c.organization_id = $2
       )
       SELECT id FROM subtree`,
      [categoryId, actor.organizationId],
    );

    // RỖNG nghĩa là id không thuộc tổ chức này — trả chính nó để bộ lọc vẫn
    // chạy và ra 0 dòng. Trả `undefined` ở đây là BỎ bộ lọc, tức phơi toàn bộ
    // danh mục cho một id sai.
    return rows.length > 0 ? rows.map((row) => row.id) : [categoryId];
  }

  private async listItems(
    query: { page: number; limit: number; search?: string; categoryId?: string },
    actor: ActorContext,
    branchId?: string,
    categoryIds?: string[],
  ): Promise<MobileSalesItemPageDto> {
    const { page, limit, search } = query;

    const qb = this.items
      .createQueryBuilder('item')
      .where('item.organizationId = :organizationId', {
        organizationId: actor.organizationId,
      })
      // Hàng đã ngừng kinh doanh không được bày để bán mới.
      .andWhere('item.isActive = true')
      // KHÁC `MobileItemService`: quầy bán chỉ thấy hàng được đánh dấu bày bán.
      .andWhere('item.isPosVisible = true');

    if (search?.trim()) {
      qb.andWhere(
        '(item.code ILIKE :search OR item.name ILIKE :search OR item.variantLabel ILIKE :search)',
        { search: `%${escapeLikeTerm(search.trim())}%` },
      );
    }

    if (categoryIds?.length) {
      qb.andWhere('item.categoryId IN (:...categoryIds)', { categoryIds });
    }

    if (branchId) {
      qb.andWhere(
        `${stockTotalSql('sb.item_id = item.id', ':org', ':branch')} > 0`,
        { org: actor.organizationId, branch: branchId },
      );
    }

    // `id` làm khoá phụ, cùng lý do ở `MobileItemService`: `name` trùng nhau
    // rất nhiều (sáu biến thể của một mẫu mã chỉ khác nhãn), và `LIMIT/OFFSET`
    // trên một thứ tự không duy nhất thì Postgres được phép trả khác nhau giữa
    // hai lượt — biểu hiện ra là cuộn tới trang 2 thấy lặp một dòng của trang 1.
    qb.orderBy('lower(item.name)', 'ASC')
      .addOrderBy('item.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();

    return { data: rows.map(toMobileSalesItem), total, page, limit };
  }

  /**
   * Một dòng = một MẪU MÃ, cộng các mặt hàng lẻ không thuộc mẫu mã nào.
   *
   * Hàng lẻ trả về `type: 'item'` chứ không `'model'`, và đó không phải chi
   * tiết vụn: `id` của nó LÀ `items.id`, nên client bỏ thẳng vào giỏ được mà
   * không cần mở bảng chọn biến thể. Một mẫu mã thì không.
   */
  private async listModels(
    query: { page: number; limit: number; search?: string; categoryId?: string },
    actor: ActorContext,
    branchId?: string,
    categoryIds?: string[],
  ): Promise<MobileSalesItemPageDto> {
    const { page, limit, search } = query;

    // `$1` là organizationId và được tham chiếu NHIỀU LẦN trong CTE, nên nó
    // luôn đứng đầu. Mọi tham số thêm sau đó đẩy số của LIMIT/OFFSET đi — viết
    // cứng `$2`/`$3` là lệch tham số ngay khi có `search`, và lệch kiểu đó
    // không ném lỗi mà trả sai dữ liệu.
    const params: unknown[] = [actor.organizationId];

    let branchParam: number | undefined;
    if (branchId) {
      params.push(branchId);
      branchParam = params.length;
    }

    // Nhóm hàng hoá lọc BÊN TRONG CTE, không ở `WHERE` ngoài: mẫu mã không có
    // `category_id` của riêng nó, nhóm nằm trên từng BIẾN THỂ. Lọc ở JOIN cho
    // ra "mẫu mã hiện khi còn ít nhất một biến thể thuộc nhóm đó", và giá trung
    // bình cũng chỉ tính trên đúng các biến thể ấy — cùng luật mà điều kiện bán
    // được đang theo.
    let categoryParam: number | undefined;
    if (categoryIds?.length) {
      params.push(categoryIds);
      categoryParam = params.length;
    }

    const cte = buildModelCte(branchParam, categoryParam);

    let whereSql = branchParam === undefined ? '' : 'WHERE "stockTotal" > 0';

    if (search?.trim()) {
      params.push(`%${escapeLikeTerm(search.trim())}%`);
      const p = `$${params.length}`;

      // `COALESCE(...,'')` vì `name`/`variantLabel` NULL được: `NULL ILIKE x`
      // cho `NULL` chứ không `false` — vẫn không khớp, nhưng viết rõ thì người
      // sau không phải tra lại luật ba trạng thái của SQL.
      const match = `(COALESCE(code, '') ILIKE ${p} OR COALESCE(name, '') ILIKE ${p} OR COALESCE("variantLabel", '') ILIKE ${p})`;
      whereSql = whereSql ? `${whereSql} AND ${match}` : `WHERE ${match}`;
    }

    // Chốt tham số của câu ĐẾM trước khi thêm LIMIT/OFFSET: nó dùng cùng
    // `whereSql` nhưng không phân trang, và thừa hai tham số là Postgres ném
    // "bind message supplies N parameters".
    const countParams = [...params];

    params.push(limit, (page - 1) * limit);

    const rows: ModelRow[] = await this.dataSource.query(
      `${cte}
       SELECT type, id, code, name, "variantLabel", unit, "sellingPrice", "variantCount"
       FROM model
       ${whereSql}
       ORDER BY lower(name) ASC, id ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const counted: CountRow[] = await this.dataSource.query(
      `${cte} SELECT COUNT(*)::int AS total FROM model ${whereSql}`,
      countParams,
    );

    return {
      data: rows.map(toMobileSalesModel),
      total: counted[0]?.total ?? 0,
      page,
      limit,
    };
  }

  /**
   * Chi tiết một MẪU MÃ: các chiều biến thiên và các biến thể bán được.
   *
   * BA truy vấn chứ không một câu join phẳng. Một câu join sẽ nhân dòng biến
   * thể lên theo số chiều (một mẫu mã 6 biến thể × 2 chiều = 12 dòng) rồi bắt
   * TS gỡ lại — và bước gỡ đó là chỗ dễ sai thầm lặng nhất, vì nó vẫn chạy khi
   * một biến thể thiếu nhãn ở một chiều, chỉ ra kết quả khác.
   *
   * Đơn hình có một truy vấn thừa: mẫu mã không tồn tại (hoặc khác tổ chức) thì
   * dừng ngay ở truy vấn đầu, không chạy hai truy vấn sau.
   */
  async getModel(
    productId: string,
    actor: ActorContext,
  ): Promise<MobileSalesModelDetailDto> {
    const products: ProductRow[] = await this.dataSource.query(
      `SELECT p.id, COALESCE(p.code, p.name, '') AS code, COALESCE(p.name, '') AS name
       FROM products p
       WHERE p.id = $1 AND p.organization_id = $2`,
      [productId, actor.organizationId],
    );

    const product = products[0];

    // Lọc theo tổ chức Ở TRONG câu lệnh, không sau khi lấy về: mẫu mã của tổ
    // chức khác phải là 404, không phải một mẫu mã rỗng.
    if (!product) {
      throw new NotFoundException('Model not found.');
    }

    const variants: VariantRow[] = await this.dataSource.query(
      `SELECT i.id, i.code, i.name, i.variant_label AS "variantLabel",
              i.unit, i.selling_price::float AS "sellingPrice"
       FROM items i
       WHERE i.product_id = $1
         AND i.organization_id = $2
         AND i.is_active = true
         AND i.is_pos_visible = true
       ORDER BY lower(i.name) ASC, i.id ASC`,
      [productId, actor.organizationId],
    );

    const values: AttributeValueRow[] = await this.dataSource.query(
      `SELECT iav.item_id AS "itemId",
              d.name       AS "attributeName",
              d.sort_order AS "attributeSort",
              o.value_label AS "valueLabel",
              o.sort_order  AS "valueSort"
       FROM item_attribute_values iav
       JOIN product_attribute_definitions d ON d.id = iav.attribute_definition_id
       JOIN product_attribute_options    o ON o.id = iav.option_id
       WHERE d.product_id = $1
       ORDER BY d.sort_order ASC, d.name ASC, o.sort_order ASC, o.value_label ASC`,
      [productId],
    );

    // Mã vạch: một truy vấn RIÊNG, không phải `string_agg` nhét vào câu trên.
    //
    // Điểm 2 của doc class nói `string_agg` cho MỖI dòng là trả tiền cho dữ
    // liệu không ai đọc — điều đó vẫn đúng cho DANH SÁCH (20 dòng mỗi trang,
    // mỗi lượt cuộn), và sai cho đường này: nó trả đúng một mẫu mã, người dùng
    // đã chủ động mở nó ra, và mã vạch là thứ họ mở ra để xem.
    //
    // Đặt CUỐI, sau câu `values`, là có chủ ý: spec của service mock
    // `dataSource.query` theo THỨ TỰ GỌI, nên chèn vào giữa sẽ làm mọi test cũ
    // nhận nhầm dữ liệu của nhau. Ở cuối thì mock mặc định `[]` rơi đúng vào
    // đây, và `[]` chính là ca "mặt hàng chưa gắn mã vạch" — hợp lệ và phổ
    // biến.
    const barcodes: BarcodeRow[] = await this.dataSource.query(
      `SELECT b.item_id AS "itemId", b.code
       FROM item_barcodes b
       JOIN items i ON i.id = b.item_id
       WHERE i.product_id = $1
         AND b.organization_id = $2
       ORDER BY b.created_at ASC, b.code ASC`,
      [productId, actor.organizationId],
    );

    const perBarcode = new Map<string, string[]>();

    for (const row of barcodes) {
      const bucket = perBarcode.get(row.itemId);
      if (bucket) {
        bucket.push(row.code);
      } else {
        perBarcode.set(row.itemId, [row.code]);
      }
    }

    // Thứ tự chiều và thứ tự nhãn đều lấy từ `ORDER BY` ở trên, KHÔNG sắp lại ở
    // đây: `Map` của JS giữ thứ tự chèn, nên duyệt một lượt là đủ. Sắp lại bằng
    // `sort()` sẽ xếp `S, M, L` theo bảng chữ cái — sai.
    const dimensions = new Map<string, string[]>();
    const perVariant = new Map<string, MobileSalesVariantAttributeDto[]>();

    // Chỉ những biến thể CÒN BÁN ĐƯỢC. Câu `values` lọc theo MẪU MÃ nên nó kéo
    // về cả nhãn của biến thể đã ngừng bán hoặc không bày POS.
    const sellableIds = new Set(variants.map((variant) => variant.id));

    for (const row of values) {
      // **Bỏ hẳn dòng của biến thể không bán được — kể cả khi dựng DANH SÁCH
      // CHIP.** Bản trước chỉ chặn ở `perVariant` bên dưới và để `dimensions`
      // gom mọi nhãn, nên client bày ra những tổ hợp KHÔNG DẪN TỚI ĐÂU.
      //
      // Đo được trên dữ liệu dev 2026-09-10, mẫu mã `ABA2950`: chip bày
      // Color [BO, D] × Size [38..44] = **14 tổ hợp**, trong khi chỉ có **1**
      // biến thể bán được (D + 39). Người dùng chọn BO + 38 rồi bị app bảo
      // *"Chọn đủ thuộc tính để thêm vào đơn"* — đúng cái họ vừa làm xong.
      //
      // Không có lỗi nào để lần ra: `resolve()` trả `null` và màn hình chỉ lặp
      // lại một câu nhắc. Đó là giao diện NÓI DỐI về dữ liệu đứng sau nó.
      if (!sellableIds.has(row.itemId)) continue;

      const options = dimensions.get(row.attributeName) ?? [];

      if (!options.includes(row.valueLabel)) {
        options.push(row.valueLabel);
      }

      dimensions.set(row.attributeName, options);

      const bucket = perVariant.get(row.itemId);
      if (bucket) {
        bucket.push({ name: row.attributeName, value: row.valueLabel });
      } else {
        perVariant.set(row.itemId, [
          { name: row.attributeName, value: row.valueLabel },
        ]);
      }
    }

    return {
      id: product.id,
      code: product.code,
      name: product.name,
      attributes: [...dimensions].map(([name, options]) => ({ name, options })),
      variants: variants.map((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        variantLabel: row.variantLabel ?? null,
        unit: row.unit,
        sellingPrice: Number(row.sellingPrice) || 0,
        attributes: perVariant.get(row.id) ?? [],
        barcodes: perBarcode.get(row.id) ?? [],
      })),
    };
  }
}

/**
 * CTE gộp theo mẫu mã, cộng các mặt hàng lẻ.
 *
 * [branchParam] là số thứ tự placeholder giữ chi nhánh, chỉ đặt khi người dùng
 * bật *"Hàng hoá còn hàng"*. Không đặt thì SQL sinh ra không có subquery tồn kho
 * nào — lượt nạp bình thường không trả tiền cho một bộ lọc nó không dùng.
 */
export const buildModelCte = (
  branchParam?: number,
  categoryParam?: number,
): string => `
  WITH model AS (
    SELECT
      'model'::text                              AS type,
      p.id                                       AS id,
      COALESCE(p.code, p.name, MIN(i.code))      AS code,
      COALESCE(p.name, '')                       AS name,
      NULL::text                                 AS "variantLabel",
      COALESCE(MIN(i.unit), '')                  AS unit,
      AVG(i.selling_price::numeric)::float       AS "sellingPrice",
      COUNT(i.id)::int                           AS "variantCount"${
        branchParam === undefined
          ? ''
          : `,${stockTotalSql(
              'sb.item_id IN (SELECT i2.id FROM items i2 WHERE i2.product_id = p.id)',
              '$1',
              `$${branchParam}`,
            )} AS "stockTotal"`
      }
    FROM products p
    -- Điều kiện bán được nằm ở JOIN chứ không ở WHERE: mẫu mã hiện khi CÒN ÍT
    -- NHẤT MỘT biến thể bán được, và giá trung bình chỉ tính trên đúng các biến
    -- thể đó. Đẩy chúng xuống WHERE là quay lại đúng nghĩa "tất cả biến thể
    -- phải bán được" mà CTE của web đang mang — xem doc của service.
    INNER JOIN items i
      ON i.product_id = p.id
     AND i.organization_id = $1
     AND i.is_active = true
     AND i.is_pos_visible = true${
       categoryParam === undefined ? '' : `
     AND i.category_id = ANY($${categoryParam}::uuid[])`
     }
    WHERE p.organization_id = $1
    GROUP BY p.id, p.code, p.name

    UNION ALL

    SELECT
      'item'::text                               AS type,
      i.id                                       AS id,
      i.code                                     AS code,
      i.name                                     AS name,
      i.variant_label                            AS "variantLabel",
      i.unit                                     AS unit,
      i.selling_price::float                     AS "sellingPrice",
      1                                          AS "variantCount"${
        branchParam === undefined
          ? ''
          : `,${stockTotalSql('sb.item_id = i.id', '$1', `$${branchParam}`)} AS "stockTotal"`
      }
    FROM items i
    WHERE i.organization_id = $1
      AND i.product_id IS NULL
      AND i.is_active = true
      AND i.is_pos_visible = true${
        categoryParam === undefined ? '' : `
      AND i.category_id = ANY($${categoryParam}::uuid[])`
      }
  )
`;

/**
 * Chép TƯỜNG MINH sáu trường — cùng lý do ở mọi mapper khác của module này.
 * `ItemEntity` có ~35 cột, và spread rồi xoá bớt sẽ lặng lẽ rò mọi cột thêm
 * sau này, trong đó có `purchasePrice`.
 */
function toMobileSalesItem(row: ItemEntity): MobileSalesItemResponseDto {
  return {
    type: 'item',
    id: row.id,
    code: row.code,
    name: row.name,
    variantLabel: row.variantLabel ?? null,
    unit: row.unit,
    // Cột `decimal` của Postgres về Node dưới dạng CHUỖI; ép một lần ở đây thay
    // vì để client tự parse. Bỏ bước này thì app nhận "590000.00" và mọi phép
    // cộng thành nối chuỗi.
    sellingPrice: Number(row.sellingPrice) || 0,
    variantCount: 1,
  };
}

/** Cùng luật liệt kê tường minh, nhưng nguồn là raw row của CTE. */
function toMobileSalesModel(row: ModelRow): MobileSalesItemResponseDto {
  return {
    type: row.type,
    id: row.id,
    code: row.code,
    name: row.name,
    variantLabel: row.variantLabel ?? null,
    unit: row.unit,
    sellingPrice: Number(row.sellingPrice) || 0,
    variantCount: Number(row.variantCount) || 1,
  };
}
