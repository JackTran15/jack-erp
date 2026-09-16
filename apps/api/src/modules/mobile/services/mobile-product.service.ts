import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { escapeLikeTerm } from '../../../common/utils/like-escape.util';
import { ItemEntity } from '../../inventory/location/item.entity';
import { InventoryItemCrudService } from '../../inventory/location/item-crud.service';
import { COMBINED_CTE } from '../../inventory/location/queries/search-inventory-items-v2.handler';
import { MediaQueryService } from '../../media/media-query.service';
import { MobileProductSort } from '../dto/mobile-product-list.query.dto';
import {
  MobileProductCreateDto,
  MobileProductUpdateDto,
} from '../dto/mobile-product-write.dto';
import {
  MobileProductDetailResponseDto,
  MobileProductVariantDto,
} from '../dto/mobile-product-detail.response.dto';
import {
  MobileProductPageDto,
  MobileProductResponseDto,
} from '../dto/mobile-product.response.dto';

interface CountRow {
  total: number;
}

/**
 * Kết quả mà `InventoryItemCrudService` trả về — HAI hình dạng, tuỳ nhánh.
 *
 * Nhánh ma trận biến thể trả `{ productId, itemsCreated | itemsAdded }`, nhánh
 * item lẻ trả nguyên `ItemEntity` (có `id`). Cả hai giá trị id đó đều hợp lệ
 * cho [MobileProductService.findById] — đó chính là ý nghĩa của "id hỗn hợp".
 */
type ItemCrudWriteResult =
  | { productId: string }
  | { id: string }
  | Record<string, unknown>;

/** Phần "đầu" của chi tiết — một dòng của CTE `combined`, xem [findById]. */
interface HeaderRow {
  type: 'product' | 'orphan';
  id: string;
  code: string;
  name: string;
  purchasePrice: number;
  sellingPrice: number;
  isActive: boolean;
  isPosVisible: boolean;
}

/** Một item của mẫu mã (hoặc chính item lẻ), câu thứ hai của [findById]. */
interface ItemRow {
  id: string;
  code: string;
  variantLabel: string | null;
  unit: string;
  categoryId: string | null;
  categoryName: string | null;
  purchasePrice: number;
  sellingPrice: number;
  weightGram: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  barcode: string | null;
  description: string | null;
  color: string | null;
  size: string | null;
}

/**
 * Whitelist `ORDER BY`: giá trị enum -> một câu SQL VIẾT SẴN. Chuỗi của client
 * không bao giờ chạm tới câu lệnh — `@IsEnum` là hàng rào thứ nhất, bảng tra
 * toàn phần trên enum này là hàng rào thật.
 *
 * **Mọi nhánh kết bằng `id`, và đó không phải trang trí.** `LIMIT/OFFSET` trên
 * một `ORDER BY` không duy nhất là non-deterministic trong Postgres: cùng dữ
 * liệu, hai lượt chạy có thể xếp khác nhau giữa các dòng bằng nhau. Trên màn
 * cuộn vô tận nó hiện ra thành "một mặt hàng xuất hiện ở cả trang 1 và trang 2,
 * một mặt hàng khác biến mất" — và không bao giờ lộ ra ở trang 1.
 *
 * Không phải phòng xa: `items.selling_price` mặc định `0`, nên mọi mặt hàng
 * chưa đặt giá đều bằng nhau. Tie-break là `id` chứ không phải `code`: `combined`
 * là `UNION ALL` của hai nhánh, nên `code` chỉ duy nhất trong từng nhánh chứ
 * không duy nhất trên toàn tập.
 *
 * `lower()` vì thứ tự của kiểu text phụ thuộc collation của database — dưới
 * collation `C` thì `'Zeta' < 'alpha'`, dưới `en_US.UTF-8` thì không — mà
 * collation khác nhau giữa máy dev, CI và production. Chi phí bằng không:
 * `combined` là CTE có aggregate, không index nào phục vụ được `ORDER BY` này
 * dù có `lower()` hay không, nên Postgres sort in-memory trong cả hai ca.
 */
const ORDER_BY: Record<MobileProductSort, string> = {
  [MobileProductSort.NAME]: 'lower(name) ASC, id ASC',
  [MobileProductSort.CODE]: 'lower(code) ASC, id ASC',
  [MobileProductSort.SELLING_PRICE]:
    '"sellingPrice" ASC, lower(name) ASC, id ASC',
};

/**
 * Danh mục hàng hoá cho app mobile.
 *
 * Đọc lại đúng CTE mà `SearchInventoryItemsV2Handler` dùng (một dòng = một mẫu
 * mã đã gộp các biến thể; item không thuộc mẫu mã nào tự đứng thành một dòng),
 * nên app và trang web `/admin/inventory-items` nhìn thấy cùng một tập dữ liệu.
 * Ba lý do không gọi thẳng hai đường có sẵn:
 *
 * 1. `POST /v2/inventory-items/search` khoá cứng `ORDER BY code ASC`, trong khi
 *    app có thanh sắp xếp ba tiêu chí. Sắp lại ở client là SAI khi server phân
 *    trang: một mặt hàng ở trang 2 có thể phải đứng trước cả trang 1.
 * 2. Nó là `POST` cho một thao tác ĐỌC và trả 201 — client mobile phải nới quy
 *    ước chỉ để đọc một danh sách.
 * 3. Cả nó lẫn `GET /admin/entities/inventory-items/records` đều trả hơn chục
 *    cột, gồm `purchasePrice` (giá vốn) mà app không hiển thị và không nên thấy.
 *
 * `@InjectDataSource` chứ không `@InjectRepository`: câu lệnh đụng `products`,
 * `items` và `item_barcodes` — không entity nào sở hữu nó, và một repository chỉ
 * dùng để gọi `.manager.query` là một phụ thuộc hư cấu. Tiền lệ:
 * `SearchProductGroupsHandler`. `TypeOrmCoreModule` là `@Global()` nên
 * `MobileModule` không phải khai thêm `forFeature` nào.
 *
 * Hàng hoá scope theo TỔ CHỨC: `X-Branch-Id` không dự phần, y hệt nhà cung cấp.
 * TỒN KHO mới theo chi nhánh, và tồn kho không nằm trong response này.
 *
 * Hai đường đọc, `list` và `findById`, cùng đi qua CTE `combined` — nên `id`
 * mà danh sách trả ra (hỗn hợp: mẫu mã hay item lẻ) đưa thẳng vào chi tiết
 * là ra đúng bản ghi, không cần client mang thêm `type`.
 *
 * **Hai đường GHI, `create` và `update`, KHÔNG tự viết SQL.** Chúng uỷ quyền
 * trọn cho `InventoryItemCrudService` — nơi ma trận biến thể, đơn vị quy đổi,
 * mã vạch và tồn đầu kỳ đã có sẵn ràng buộc — rồi đọc lại bằng `findById` để
 * response gương đúng `GET :id`. Lý do đầy đủ ở doc của chính hai method đó.
 */
@Injectable()
export class MobileProductService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly itemCrud: InventoryItemCrudService,
    private readonly mediaQuery: MediaQueryService,
  ) {}

  async list(
    query: {
      page: number;
      limit: number;
      sort: MobileProductSort;
      search?: string;
      categoryId?: string;
      isActive?: boolean;
    },
    actor: ActorContext,
  ): Promise<MobileProductPageDto> {
    const { page, limit, sort, search, categoryId, isActive } = query;
    const offset = (page - 1) * limit;

    // Tham số đánh số ĐỘNG, không viết cứng `$2`/`$3`.
    //
    // `$1` là `organizationId` và nó được tham chiếu NHIỀU LẦN bên trong
    // `COMBINED_CTE`, nên nó phải luôn đứng đầu. Mọi thứ thêm sau đó đẩy số của
    // `LIMIT`/`OFFSET` đi — viết cứng là lệch tham số ngay khi có `search`, và
    // lệch kiểu đó không ném lỗi mà trả sai dữ liệu.
    const params: unknown[] = [actor.organizationId];

    // Gom từng mệnh đề rồi nối bằng `AND` một lần, thay vì gán đè `whereSql` —
    // với ba bộ lọc độc lập thì gán đè là cách chắc chắn có ngày một bộ lọc
    // nuốt mất bộ lọc trước nó.
    const conditions: string[] = [];

    if (search?.trim()) {
      const escaped = escapeLikeTerm(search.trim());

      params.push(`%${escaped}%`);

      // `COALESCE(...,'')` vì cả hai cột đều NULL được ở nhánh `product` của
      // CTE (`code` là `COALESCE(p.code, p.name, MIN(i.code))`). `NULL ILIKE x`
      // cho `NULL` chứ không `false` — vẫn không khớp, nhưng viết rõ ra thì
      // người sau không phải tra lại luật ba trạng thái của SQL.
      conditions.push(
        `(COALESCE(code, '') ILIKE $${params.length} OR COALESCE(name, '') ILIKE $${params.length})`,
      );
    }

    if (categoryId) {
      params.push(categoryId);

      // Correlated `EXISTS` chứ KHÔNG thêm cột `categoryId` vào
      // `buildCombinedCte`: CTE đó dùng CHUNG với `SearchInventoryItemsV2Handler`
      // và tự cảnh báo rằng một sửa đổi chỉ nghĩ tới một phía sẽ làm hỏng phía
      // kia mà không có gì báo. Mệnh đề này nằm NGOÀI CTE nên không ai khác
      // chịu ảnh hưởng.
      //
      // `OR` hai vế phủ trọn hai nhánh của `combined` mà không cần đọc cột
      // `type`: mẫu mã khớp qua `product_id`, item lẻ khớp qua chính `id`. Hai
      // vế không bao giờ cùng đúng — `products.id` và `items.id` là hai bảng.
      //
      // Vẫn lặp `f.organization_id = $1` dù CTE đã scope: ranh giới multi-tenant
      // phải đứng ở TỪNG câu, cùng luật mà `findById` đang giữ.
      conditions.push(`EXISTS (
        SELECT 1 FROM items f
        WHERE f.organization_id = $1
          AND f.category_id = $${params.length}
          AND (f.product_id = combined.id OR f.id = combined.id)
      )`);
    }

    if (isActive !== undefined) {
      params.push(isActive);

      // `"isActive"` đã là cột của `combined` nên không cần `EXISTS`. Nhớ nó là
      // `bool_and` ở nhánh mẫu mã — cạm bẫy đã khai ở
      // `MobileProductListQueryDto.isActive`.
      conditions.push(`"isActive" = $${params.length}`);
    }

    // MỘT nguồn duy nhất cho cả `dataSql` lẫn `countSql`. Hai câu lệnh viết rời
    // nhau là chỗ chúng phân kỳ, và hệ quả nêu ngay dưới đây.
    const whereSql = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Chốt tham số của `countSql` TRƯỚC khi thêm `LIMIT`/`OFFSET`: câu đếm dùng
    // CÙNG `whereSql` nhưng không phân trang. Thêm nhầm hai tham số thừa vào là
    // Postgres ném "bind message supplies N parameters".
    const countParams = [...params];

    params.push(limit, offset);
    const limitParam = `$${params.length - 1}`;
    const offsetParam = `$${params.length}`;

    // MẶC ĐỊNH không lọc `"isActive"`: hiện cả hàng đã ngừng kinh doanh, khớp
    // đúng trang web (`crudV2Search.ts` đặt `includeInactive: true` kèm ghi chú
    // "Management list shows both active + discontinued"). Đây là màn quản lý
    // danh mục, không phải màn bán hàng — một mặt hàng biến mất khỏi danh sách
    // thì người dùng không còn đường nào tìm lại nó.
    //
    // Người dùng vẫn CHỌN lọc được, qua `query.isActive` — đó là một thao tác
    // tường minh trên màn lọc, khác hẳn một mặc định âm thầm. Cạm bẫy `bool_and`
    // khi bật lọc đã khai ở `MobileProductListQueryDto.isActive`.
    //
    // `SELECT` liệt kê từng cột, KHÔNG `SELECT *` — đây là thứ chặn
    // `purchasePrice`/`barcode`/`isPosVisible` rò ra response. Handler của web
    // trả thẳng raw row; đừng chép chỗ đó sang đây.
    const dataSql = `
      ${COMBINED_CTE}
      SELECT id, code, name, "sellingPrice"
      FROM combined
      ${whereSql}
      ORDER BY ${ORDER_BY[sort]}
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    // HAI truy vấn chứ không một `COUNT(*) OVER()`: gộp lại thì CTE chỉ chạy
    // một lần, nhưng `COUNT(*) OVER()` chỉ đọc được TỪ một dòng trả về — hỏi
    // trang vượt quá cuối (`?page=999`) cho `data` rỗng và `total` thành 0, tức
    // client phân trang theo `total` nhận tín hiệu sai.
    // `whereSql` PHẢI giống hệt câu trên. Lệch một chữ là `total` không khớp
    // `data`, và cuộn vô tận sẽ đòi thêm trang cho những dòng không tồn tại.
    const countSql = `
      ${COMBINED_CTE}
      SELECT COUNT(*)::int AS total FROM combined
      ${whereSql}
    `;

    const [rows, countResult] = await Promise.all([
      this.dataSource.query<Omit<MobileProductResponseDto, 'thumbnailUrl'>[]>(
        dataSql,
        params,
      ),
      this.dataSource.query<CountRow[]>(countSql, countParams),
    ]);

    // Ảnh bìa tra MỘT lần cho cả trang, không một truy vấn mỗi dòng. `id` của
    // dòng chính là chủ sở hữu ảnh (mẫu mã hoặc item lẻ) — cùng luật với
    // [findById]. Kho chưa cấu hình thì Map rỗng, mọi dòng ra `null`.
    const imagesByOwner = await this.mediaQuery.resolvePublicUrls(
      rows.map((row) => row.id),
      actor.organizationId,
    );
    const data: MobileProductResponseDto[] = rows.map((row) => ({
      ...row,
      thumbnailUrl: imagesByOwner.get(row.id)?.[0]?.url ?? null,
    }));

    return { data, total: countResult[0]?.total ?? 0, page, limit };
  }

  /**
   * Chi tiết một hàng hoá theo `id` HỖN HỢP của danh sách.
   *
   * HAI câu lệnh tuần tự, không gộp:
   *
   * 1. Tra `id` trên CTE `combined` — chính CTE của [list], nên `code`/`name`/
   *    giá/`isActive` ở đây KHỚP con số màn danh sách (mẫu mã: giá trung bình,
   *    `bool_and(is_active)`). Cột `type` cho biết dòng đó là mẫu mã hay item
   *    lẻ — đó là toàn bộ lý do client không phải gửi kèm `type`.
   * 2. Lấy các item thuộc dòng đó: mẫu mã -> mọi item có `product_id = id`;
   *    item lẻ -> chính nó. Item ĐẠI DIỆN (mã nhỏ nhất) cấp nhóm hàng, đơn vị,
   *    cân nặng, kích thước — `products` không có các cột này. Với mẫu mã, cả
   *    danh sách đó thành `variants`.
   *
   * Không gộp thành một `JOIN` vì hai nhánh của CTE nối với `items` theo hai
   * cột khác nhau (`product_id` với mẫu mã, `id` với item lẻ); một câu `OR`
   * vẫn đúng nhưng câu lệnh và test của nó khó đọc hơn hẳn hai câu thẳng.
   *
   * `::float` ở MỌI cột decimal là bắt buộc: driver `pg` trả `numeric` thành
   * CHUỖI, và app đọc `"250.00"` được nhưng phát cảnh báo sai kiểu mỗi lần mở
   * màn. CTE đã tự ép ở phía nó.
   *
   * Câu 404 KHÔNG nội suy `id`: cùng luật với nhà cung cấp — thông điệp đi
   * thẳng ra toast của app.
   */
  async findById(
    id: string,
    actor: ActorContext,
  ): Promise<MobileProductDetailResponseDto> {
    // `$1` là organizationId — CTE tham chiếu nó nhiều lần nên phải đứng đầu.
    const params = [actor.organizationId, id];

    const headerSql = `
      ${COMBINED_CTE}
      SELECT type, id, code, name, "purchasePrice", "sellingPrice",
             "isActive", "isPosVisible"
      FROM combined
      WHERE id = $2
    `;
    const [header] = await this.dataSource.query<HeaderRow[]>(
      headerSql,
      params,
    );
    if (!header) {
      throw new NotFoundException('Không tìm thấy hàng hoá.');
    }

    // Vẫn giữ `i.organization_id = $1` dù `id` đã qua CTE có scope: ranh giới
    // multi-tenant phải đứng ở TỪNG câu, không dựa vào câu trước.
    const itemFilter =
      header.type === 'product' ? 'i.product_id = $2' : 'i.id = $2';
    // `color`/`size` là hai subquery tương quan chứ KHÔNG phải `JOIN`: một item
    // có 0..n dòng `item_attribute_values`, nên join sẽ nhân đôi dòng item và
    // `items[0]` (item đại diện) không còn chắc là item đại diện nữa.
    //
    // `LOWER(d.name) IN ('color','size')` là ĐÚNG cách mà
    // `ItemCrudService.loadProductAttributes` đang dò — hai chỗ phải khớp, vì
    // chính service đó tạo ra các định nghĩa này với tên `"Color"`/`"Size"`.
    // Mẫu mã nào đặt tên chiều khác (`"Màu sắc"`) sẽ ra `null` ở CẢ HAI nơi.
    const itemSql = `
      SELECT
        i.id,
        i.code,
        i.variant_label          AS "variantLabel",
        i.unit,
        i.category_id            AS "categoryId",
        c.name                   AS "categoryName",
        i.purchase_price::float  AS "purchasePrice",
        i.selling_price::float   AS "sellingPrice",
        i.weight_gram::float     AS "weightGram",
        i.length_cm::float       AS "lengthCm",
        i.width_cm::float        AS "widthCm",
        i.height_cm::float       AS "heightCm",
        i.description,
        (
          SELECT b.code FROM item_barcodes b
          WHERE b.item_id = i.id AND b.organization_id = $1
          ORDER BY b.created_at ASC, b.code ASC
          LIMIT 1
        )                        AS "barcode",
        (
          SELECT o.value_label
          FROM item_attribute_values av
          JOIN product_attribute_definitions d ON d.id = av.attribute_definition_id
          JOIN product_attribute_options o ON o.id = av.option_id
          WHERE av.item_id = i.id AND LOWER(d.name) = 'color'
          LIMIT 1
        )                        AS "color",
        (
          SELECT o.value_label
          FROM item_attribute_values av
          JOIN product_attribute_definitions d ON d.id = av.attribute_definition_id
          JOIN product_attribute_options o ON o.id = av.option_id
          WHERE av.item_id = i.id AND LOWER(d.name) = 'size'
          LIMIT 1
        )                        AS "size"
      FROM items i
      LEFT JOIN inventory_item_categories c ON c.id = i.category_id
      WHERE i.organization_id = $1 AND ${itemFilter}
      ORDER BY i.code ASC, i.id ASC
    `;
    const items = await this.dataSource.query<ItemRow[]>(itemSql, params);

    // Rỗng chỉ khi bản ghi bị xoá giữa hai câu lệnh: vẫn là 404, không phải
    // `TypeError` đọc thuộc tính của `undefined`.
    const representative = items[0];
    if (!representative) {
      throw new NotFoundException('Không tìm thấy hàng hoá.');
    }

    // Map TỪNG trường chứ không spread `ItemRow`: `unit`/`weightGram`… của
    // từng item không được rò vào mảng biến thể.
    const variants: MobileProductVariantDto[] =
      header.type === 'product'
        ? items.map(
            ({
              id,
              code,
              variantLabel,
              purchasePrice,
              sellingPrice,
              color,
              size,
            }) => ({
              id,
              code,
              variantLabel,
              purchasePrice,
              sellingPrice,
              color,
              size,
            }),
          )
        : [];

    const imagesByOwner = await this.mediaQuery.resolvePublicUrls(
      [header.id],
      actor.organizationId,
    );

    return {
      id: header.id,
      code: header.code,
      name: header.name,
      isActive: header.isActive,
      isPosVisible: header.isPosVisible,
      purchasePrice: header.purchasePrice,
      sellingPrice: header.sellingPrice,
      categoryId: representative.categoryId,
      categoryName: representative.categoryName,
      unit: representative.unit,
      weightGram: representative.weightGram,
      lengthCm: representative.lengthCm,
      widthCm: representative.widthCm,
      heightCm: representative.heightCm,
      barcode: representative.barcode,
      description: representative.description,
      variants,
      images: imagesByOwner.get(header.id) ?? [],
    };
  }

  /**
   * Tạo một hàng hoá từ app.
   *
   * **UỶ QUYỀN trọn vẹn cho `InventoryItemCrudService`**, không viết lại gì:
   * service đó đã giữ toàn bộ nghiệp vụ — tách mảng lồng, ma trận biến thể,
   * upsert đơn vị quy đổi và mã vạch, ghi tồn đầu kỳ qua `StockLedgerService`,
   * kiểm nhóm hàng thuộc đúng tổ chức. Chép một phần sang đây là dựng bản sao
   * thứ hai của những ràng buộc đó, và nó sẽ phân kỳ.
   *
   * Vì thế method này chỉ còn làm ĐÚNG BA việc mà app cần và service kia không
   * làm: sinh mã khi để trống, gói `barcode` thành mảng, và chuẩn hoá hai hình
   * dạng kết quả về một `MobileProductDetailResponseDto`.
   *
   * Đọc lại bằng [findById] chứ KHÔNG dựng response từ `dto`: server có thể đã
   * chuẩn hoá dữ liệu (mã sinh tự động, giá ép về 0, nhãn biến thể ghép sẵn), và
   * trả lại chính thứ client vừa gửi là nói dối về những thay đổi đó. Cùng lý do
   * `MobileSupplierController` nêu — response gương đúng `GET :id` nên
   * `ProductDetailModel.fromJson` phía Dart parse thẳng, không cần model thứ hai.
   */
  async create(
    dto: MobileProductCreateDto,
    actor: ActorContext,
  ): Promise<MobileProductDetailResponseDto> {
    const payload = await this.toCrudPayload(dto, actor);

    const created = (await this.itemCrud.create(
      payload,
      actor,
    )) as ItemCrudWriteResult;

    return this.findById(this.resolveWrittenId(created), actor);
  }

  /**
   * Sửa một hàng hoá theo `id` HỖN HỢP — cùng giá trị mà [list] và [findById]
   * dùng. `InventoryItemCrudService.update` tự dò `id` là mẫu mã hay item lẻ và
   * rẽ nhánh; app không phải phân biệt, đúng như ở đường đọc.
   *
   * **KHÔNG sinh mã ở đây.** Bỏ trống `code` lúc Sửa nghĩa là "đừng đụng vào
   * mã", chứ không phải "sinh cho tôi một mã mới" — sinh mã sẽ âm thầm đổi SKU
   * của một mặt hàng đang lưu hành.
   */
  async update(
    id: string,
    dto: MobileProductUpdateDto,
    actor: ActorContext,
  ): Promise<MobileProductDetailResponseDto> {
    // Ném 404 TRƯỚC khi ghi: `ItemCrudService.update` dò `id` trên hai bảng và
    // ca "không thấy ở cả hai" của nó không phải lúc nào cũng là 404 đọc được.
    await this.findById(id, actor);

    const payload = await this.toCrudPayload(dto, actor, {
      generateCode: false,
    });

    await this.itemCrud.update(id, payload, actor);

    return this.findById(id, actor);
  }

  /**
   * Xoá một hàng hoá — UỶ QUYỀN TRẦN cho `InventoryItemCrudService.remove`,
   * ĐÚNG service mà web gọi qua `DELETE /admin/entities/inventory-items/records/:id`
   * (client ở `apps/backoffice-web/src/components/crud/useCrudApi.ts`).
   *
   * Yêu cầu là **web và mobile hành xử GIỐNG HỆT nhau**, kể cả ở những chỗ
   * đường xoá đang hỏng — nên method này cố ý không thêm bất cứ thứ gì.
   *
   * **KHÔNG có `await this.findById(id, actor)` phủ đầu như [update].** Ở đó nó
   * cần thiết vì lượt GHI phải chắc chắn bản ghi tồn tại trước khi đụng vào
   * nhiều bảng; ở đây thêm vào là mobile ném 404 tiếng Việt trong khi web ném
   * `Record ... not found` của `BaseCrudService.getById` — tức lệch.
   *
   * **Hai khiếm khuyết ĐÃ BIẾT của đường dùng chung, cố ý không vá ở đây:**
   *
   * 1. `BaseCrudService.remove` truyền kết quả `getById` vào `manager.remove`,
   *    mà `InventoryItemCrudService` override `getById` để trả một OBJECT
   *    LITERAL (nó spread `transformListResults`; nhánh product-id thì
   *    `getRepresentativeItemForProduct` cũng spread). TypeORM từ chối xoá một
   *    object không có prototype entity — `CannotDetermineEntityError` — nên
   *    lượt xoá hợp lệ hiện trả 500 ở CẢ hai đầu.
   * 2. `beforeDelete` dò `stock_ledger_entries WHERE item_id = $1`. `id` ở đây
   *    là HỖN HỢP (mẫu mã hoặc item lẻ), nên một `products.id` không khớp dòng
   *    nào và guard "đã phát sinh chứng từ" im lặng cho qua.
   *
   * Cả hai thuộc `BaseCrudService` / `InventoryItemCrudService`. Sửa ở FILE NÀY
   * là làm mobile lệch web — đúng thứ yêu cầu cấm. Sửa ở đó thì cả hai đầu cùng
   * đúng mà không phải mở lại file này.
   */
  remove(id: string, actor: ActorContext): Promise<void> {
    return this.itemCrud.remove(id, actor);
  }

  /**
   * Hình dạng của app -> hình dạng mà `InventoryItemCrudService` đọc.
   *
   * Chỉ có hai phép biến đổi thật, phần còn lại là chuyển tiếp nguyên văn:
   *
   * - `barcode` (MỘT chuỗi, vì form có một ô) -> `barcodes: [{ code }]`, tên mà
   *   `saveBarcodes` đọc. Chuỗi rỗng đã thành `undefined` ở DTO, nên vắng ô là
   *   vắng khoá — tức "giữ nguyên", không phải "xoá".
   * - `code` trống ở chế độ Thêm -> sinh từ tên, xem [generateItemCode].
   *
   * `colors`/`sizes`/`variants`/`units` đi thẳng: tên trường đã khớp hợp đồng
   * của service kia, và đó là chủ ý khi đặt tên DTO.
   */
  private async toCrudPayload(
    dto: MobileProductCreateDto | MobileProductUpdateDto,
    actor: ActorContext,
    options: { generateCode: boolean } = { generateCode: true },
  ): Promise<Record<string, unknown>> {
    const { barcode, code, ...rest } = dto;

    const payload: Record<string, unknown> = { ...rest };

    if (code) {
      payload.code = code;
    } else if (options.generateCode) {
      payload.code = await this.generateItemCode(dto.name ?? '', actor);
    }

    if (barcode !== undefined) {
      payload.barcodes = [{ code: barcode }];
    }

    return payload;
  }

  /**
   * Lấy id của bản ghi vừa ghi, từ MỘT trong hai hình dạng kết quả.
   *
   * Nhánh nào cho hình dạng nào đã khai ở [ItemCrudWriteResult]. Không đoán
   * theo việc dto có `colors`/`sizes` hay không: điều kiện rẽ nhánh nằm trong
   * service kia, và suy lại nó ở đây là dựng một bản sao sẽ lệch.
   */
  private resolveWrittenId(result: ItemCrudWriteResult): string {
    const productId = (result as { productId?: unknown }).productId;
    if (typeof productId === 'string' && productId) return productId;

    const id = (result as { id?: unknown }).id;
    if (typeof id === 'string' && id) return id;

    // Không bao giờ nên xảy ra. Ném ở đây để nó lộ ra như một lỗi có tên, thay
    // vì thành `findById(undefined)` rồi biến thành một 404 gây hiểu nhầm.
    throw new Error(
      'InventoryItemCrudService trả về kết quả không có id — hợp đồng đã đổi.',
    );
  }

  /**
   * Sinh mã hàng hoá từ tên khi người dùng để trống ô SKU.
   *
   * Form của app ghi rõ "để trống thì máy tự sinh mã", nên bỏ trống KHÔNG được
   * phép thành 409 — người dùng không gõ mã nào thì cũng không sửa được nó.
   *
   * Thuật toán gương đúng `variantSlug` của trang web (bỏ dấu, `đ`->`d`, viết
   * hoa, chỉ giữ A-Z0-9) để hai nơi sinh ra cùng một mã cho cùng một tên. Khác
   * một điểm: web để va chạm nổ thành 409, còn ở đây ta dò thêm hậu tố `-2`,
   * `-3`… vì app không có ô nào để người dùng tự gỡ va chạm.
   *
   * Vòng lặp có TRẦN: hết 50 lượt thì lùi về một hậu tố ngẫu nhiên. Dò không
   * giới hạn trên một danh mục lớn là một vòng lặp có thể chạy rất lâu dưới
   * request, và một mã hơi xấu vẫn tốt hơn một request treo.
   *
   * **Vẫn có thể va chạm khi hai người bấm Lưu cùng lúc** — đây là kiểm-rồi-ghi,
   * không phải khoá. Ca đó rơi vào 409 của `toConflictIfDuplicate` như cũ; ràng
   * buộc UNIQUE ở DB vẫn là chốt cuối và không ai lách qua nó.
   */
  private async generateItemCode(
    name: string,
    actor: ActorContext,
  ): Promise<string> {
    const base =
      name
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[đĐ]/g, (char) => (char === 'đ' ? 'd' : 'D'))
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '')
        .slice(0, 40) || 'SP';

    const repo = this.dataSource.getRepository(ItemEntity);

    for (let attempt = 1; attempt <= 50; attempt += 1) {
      const candidate = attempt === 1 ? base : `${base}-${attempt}`;
      const taken = await repo.exist({
        where: { organizationId: actor.organizationId, code: candidate },
      });
      if (!taken) return candidate;
    }

    return `${base}-${Date.now().toString(36).toUpperCase()}`;
  }
}
