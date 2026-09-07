import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { escapeLikeTerm } from '../../../common/utils/like-escape.util';
import { COMBINED_CTE } from '../../inventory/location/queries/search-inventory-items-v2.handler';
import { MobileProductSort } from '../dto/mobile-product-list.query.dto';
import {
  MobileProductPageDto,
  MobileProductResponseDto,
} from '../dto/mobile-product.response.dto';

interface CountRow {
  total: number;
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
 */
@Injectable()
export class MobileProductService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async list(
    query: {
      page: number;
      limit: number;
      sort: MobileProductSort;
      search?: string;
    },
    actor: ActorContext,
  ): Promise<MobileProductPageDto> {
    const { page, limit, sort, search } = query;
    const offset = (page - 1) * limit;

    // Tham số đánh số ĐỘNG, không viết cứng `$2`/`$3`.
    //
    // `$1` là `organizationId` và nó được tham chiếu NHIỀU LẦN bên trong
    // `COMBINED_CTE`, nên nó phải luôn đứng đầu. Mọi thứ thêm sau đó đẩy số của
    // `LIMIT`/`OFFSET` đi — viết cứng là lệch tham số ngay khi có `search`, và
    // lệch kiểu đó không ném lỗi mà trả sai dữ liệu.
    const params: unknown[] = [actor.organizationId];
    let whereSql = '';

    if (search?.trim()) {
      const escaped = escapeLikeTerm(search.trim());

      params.push(`%${escaped}%`);

      // `COALESCE(...,'')` vì cả hai cột đều NULL được ở nhánh `product` của
      // CTE (`code` là `COALESCE(p.code, p.name, MIN(i.code))`). `NULL ILIKE x`
      // cho `NULL` chứ không `false` — vẫn không khớp, nhưng viết rõ ra thì
      // người sau không phải tra lại luật ba trạng thái của SQL.
      whereSql = `WHERE (COALESCE(code, '') ILIKE $${params.length} OR COALESCE(name, '') ILIKE $${params.length})`;
    }

    // Chốt tham số của `countSql` TRƯỚC khi thêm `LIMIT`/`OFFSET`: câu đếm dùng
    // CÙNG `whereSql` nhưng không phân trang. Thêm nhầm hai tham số thừa vào là
    // Postgres ném "bind message supplies N parameters".
    const countParams = [...params];

    params.push(limit, offset);
    const limitParam = `$${params.length - 1}`;
    const offsetParam = `$${params.length}`;

    // KHÔNG lọc `"isActive" = true`: hiện cả hàng đã ngừng kinh doanh, khớp
    // đúng trang web (`crudV2Search.ts` đặt `includeInactive: true` kèm ghi chú
    // "Management list shows both active + discontinued"). Đây là màn quản lý
    // danh mục, không phải màn bán hàng — một mặt hàng biến mất khỏi danh sách
    // thì người dùng không còn đường nào tìm lại nó.
    //
    // Lọc active-only còn vấp một bẫy của chính CTE: nhánh product tính
    // `bool_and(i.is_active)`, nên một mẫu mã mười biến thể chỉ cần MỘT biến thể
    // ngừng kinh doanh là cả mẫu mã biến mất. Web không lộ ra điều đó vì nó
    // cũng không lọc.
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

    const [data, countResult] = await Promise.all([
      this.dataSource.query<MobileProductResponseDto[]>(dataSql, params),
      this.dataSource.query<CountRow[]>(countSql, countParams),
    ]);

    return { data, total: countResult[0]?.total ?? 0, page, limit };
  }
}
