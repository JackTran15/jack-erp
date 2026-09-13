import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { CustomerStatus } from '@erp/shared-interfaces';
import { DataSource, QueryFailedError } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { escapeLikeTerm } from '../../../common/utils/like-escape.util';
import { CustomerService } from '../../customer/customer.service';
import { CreateCustomerDto } from '../../customer/dto/create-customer.dto';
import { UpdateCustomerDto } from '../../customer/dto/update-customer.dto';
import {
  MobileCustomerOrder,
  MobileCustomerSort,
  MobileCustomerStatus,
} from '../dto/mobile-customer-list.query.dto';
import {
  MobileCustomerCreateDto,
  MobileCustomerUpdateDto,
} from '../dto/mobile-customer-write.dto';
import {
  MobileCustomerPageDto,
  MobileCustomerResponseDto,
} from '../dto/mobile-customer.response.dto';

/** Một dòng của câu đếm — tổng số và tổng doanh thu của TOÀN tập khớp. */
interface CountRow {
  total: number;
  totalRevenue: number;
}

/**
 * Doanh thu và số hoá đơn theo từng khách, gom sẵn để `LEFT JOIN`.
 *
 * Định nghĩa "đã chốt" lấy Y HỆT `CustomerSummaryService`: hoá đơn BÁN
 * (`type = 'SALE'`) ở trạng thái `paid` / `debt` / `partial_debt`, cộng
 * `amount_due`. Lệch một trạng thái là con số trên màn danh sách khác con số
 * trên màn chi tiết của web cho cùng một khách, mà không có gì báo.
 *
 * `$1` là `organizationId`. Lọc ngay trong CTE chứ không chờ `JOIN` với
 * `customers`: bảng hoá đơn lớn hơn bảng khách nhiều lần, và index
 * `IDX_invoices_org_customer_type_status` phục vụ đúng bốn cột này.
 *
 * `::float` vì driver `pg` trả `numeric` thành CHUỖI — app đọc `"850000.00"`
 * được nhưng phát cảnh báo sai kiểu mỗi lần mở màn. KHÔNG `::bigint`: `int8`
 * cũng về chuỗi.
 */
const SALES_CTE = `
  WITH sales AS (
    SELECT
      customer_id,
      SUM(amount_due)::float AS revenue,
      COUNT(*)::int          AS invoice_count
    FROM invoices
    WHERE organization_id = $1
      AND customer_id IS NOT NULL
      AND type = 'SALE'
      AND status IN ('paid', 'debt', 'partial_debt')
    GROUP BY customer_id
  )
`;

/**
 * Cột trả về, liệt kê từng cái — KHÔNG `SELECT c.*`. Đây là thứ chặn
 * `national_id` / `tax_code` / `company_name` rò ra response (xem
 * `MobileCustomerResponseDto`).
 *
 * Ba phép `::text` trên cột enum không phải trang trí: `CASE`/`NULLIF` so một
 * enum với một literal chưa định kiểu vẫn chạy, nhưng chỉ vì Postgres đoán
 * đúng — ép về text thì câu lệnh không còn phụ thuộc phép đoán đó.
 *
 * `to_char(birth_date, 'YYYY-MM-DD')`: cột `date` không giờ, trả nguyên dạng
 * thì driver dựng `Date` theo múi giờ máy chủ và app nhận một mốc lệch ngày.
 *
 * `cardTier` là TÊN hạng thẻ do tổ chức đặt (`membership_card_types.name`,
 * vd "Thẻ Vàng"), không phải mã enum: app chỉ hiển thị, và tên là thứ người
 * dùng đã tự chọn ở web. Lùi về mã enum khi tổ chức chưa khai tên cho hạng
 * đó; `null` khi chưa có thẻ hoặc thẻ hạng `none`.
 */
const SELECT_COLUMNS = `
  SELECT
    c.id,
    c.code,
    c.name,
    c.phone,
    c.email,
    c.address,
    c.note,
    to_char(c.birth_date, 'YYYY-MM-DD')                       AS "birthDate",
    c.gender::text                                            AS gender,
    CASE WHEN c.status::text = 'ACTIVE' THEN 'active' ELSE 'inactive' END AS status,
    g.name                                                    AS "groupName",
    CASE WHEN m.tier IS NULL OR m.tier::text = 'none' THEN NULL
         ELSE COALESCE(t.name, m.tier::text) END              AS "cardTier",
    COALESCE(s.revenue, 0)::float                             AS revenue,
    COALESCE(s.invoice_count, 0)::int                         AS "invoiceCount"
`;

/**
 * `membership_cards.customer_id` có unique index nên `LEFT JOIN` không nhân
 * dòng; `membership_card_types` unique theo (tổ chức, hạng) và phải loại bản
 * đã xoá mềm (`deleted_at`) — thiếu vế đó là một hạng thẻ có thể ra HAI tên.
 * `customer_groups` nối theo khoá chính.
 */
const FROM_CLAUSE = `
  FROM customers c
  LEFT JOIN sales s                 ON s.customer_id = c.id
  LEFT JOIN customer_groups g       ON g.id = c.group_id
  LEFT JOIN membership_cards m      ON m.customer_id = c.id
  LEFT JOIN membership_card_types t ON t.organization_id = c.organization_id
                                   AND t.tier = m.tier
                                   AND t.deleted_at IS NULL
`;

/**
 * Whitelist `ORDER BY`: (tiêu chí, chiều) -> câu SQL VIẾT SẴN. Chuỗi của
 * client không bao giờ chạm tới câu lệnh — `@IsEnum` là hàng rào thứ nhất,
 * bảng tra toàn phần trên hai enum này là hàng rào thật.
 *
 * Mọi nhánh kết bằng `c.id` — tie-break BẮT BUỘC khi phân trang, cùng lý do
 * đã ghi ở `ORDER_BY` của `MobileProductService`: trùng tên là chuyện thật,
 * và mọi khách chưa mua gì đều có doanh thu bằng nhau.
 *
 * Sắp theo doanh thu thì tiêu chí phụ là TÊN, không phải id: người dùng đang
 * nhìn một cột số, hai khách cùng số phải xếp theo thứ gì họ đọc được.
 * `lower()` vì thứ tự text phụ thuộc collation — xem cùng chỗ ở product.
 */
const ORDER_BY: Record<MobileCustomerSort, Record<MobileCustomerOrder, string>> =
  {
    [MobileCustomerSort.NAME]: {
      [MobileCustomerOrder.ASC]: 'lower(c.name) ASC, c.id ASC',
      [MobileCustomerOrder.DESC]: 'lower(c.name) DESC, c.id ASC',
    },
    [MobileCustomerSort.REVENUE]: {
      [MobileCustomerOrder.ASC]: 'revenue ASC, lower(c.name) ASC, c.id ASC',
      [MobileCustomerOrder.DESC]: 'revenue DESC, lower(c.name) ASC, c.id ASC',
    },
  };

/** `MobileCustomerStatus` (viết thường, của app) -> giá trị cột (viết hoa). */
const STATUS_COLUMN_VALUE: Record<MobileCustomerStatus, CustomerStatus> = {
  [MobileCustomerStatus.ACTIVE]: CustomerStatus.ACTIVE,
  [MobileCustomerStatus.INACTIVE]: CustomerStatus.INACTIVE,
};

/** Một dòng của câu tra trùng — chỉ cần biết CÓ hay không. */
interface DuplicateRow {
  id: string;
}

/**
 * Khách hàng cho app mobile — ca THỨ BA trong module này phải tự đọc dữ liệu
 * thay vì uỷ quyền cho service sẵn có. Bốn lý do, không cái nào là gu:
 *
 * 1. `GET /customers` (và cả `/customers/:id/summary`) nằm sau
 *    `@RequireBranchScope()` cấp class: thiếu `X-Branch-Id` là 403, dù chính
 *    entity khai scope theo TỔ CHỨC. Nhà cung cấp của mobile không đòi header
 *    đó, và app không có lý do gì để gửi nó cho một danh mục toàn tổ chức.
 * 2. Không đường có sẵn nào trả DOANH THU ở danh sách. Web phải gọi
 *    `/customers/:id/summary` cho từng khách; app có thanh "Tổng" và mục sắp
 *    xếp theo doanh thu, nên số đó phải nằm ngay trong trang trả về.
 * 3. `POST /v2/customers/search` khoá cứng `ORDER BY code ASC` và không có tìm
 *    tự do — nó nhận từng cột một, AND lại với nhau.
 * 4. Mọi đường có sẵn trả nguyên `CustomerEntity`, gồm `nationalId` (CCCD) và
 *    mã số thuế mà app không hiển thị.
 *
 * `@InjectDataSource` chứ không `@InjectRepository`: câu lệnh đụng năm bảng
 * (`customers`, `invoices`, `customer_groups`, `membership_cards`,
 * `membership_card_types`) — không
 * entity nào sở hữu nó. Tiền lệ: `MobileProductService`. `TypeOrmCoreModule`
 * là `@Global()` nên `MobileModule` không phải khai `forFeature`.
 *
 * Khách hàng scope theo TỔ CHỨC: `X-Branch-Id` không dự phần. Cột `branch_id`
 * của bảng chỉ là vết tích "tạo từ chi nhánh nào", không phải khoá phân vùng.
 */
@Injectable()
export class MobileCustomerService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    // Đường GHI uỷ quyền cho service của web — xem [create].
    private readonly customers: CustomerService,
  ) {}

  async list(
    query: {
      page: number;
      limit: number;
      sort: MobileCustomerSort;
      order: MobileCustomerOrder;
      status?: MobileCustomerStatus;
      search?: string;
    },
    actor: ActorContext,
  ): Promise<MobileCustomerPageDto> {
    const { page, limit, sort, order, status, search } = query;
    const offset = (page - 1) * limit;

    // Tham số đánh số ĐỘNG — `$1` là `organizationId` và CTE tham chiếu nó,
    // nên nó phải đứng đầu; mọi thứ thêm sau đẩy số của `LIMIT`/`OFFSET` đi.
    // Cùng cách `MobileProductService` xử.
    const params: unknown[] = [actor.organizationId];

    // `MERGED` luôn bị loại, KHÔNG phụ thuộc `status` của query: khách đã gộp
    // trỏ sang khách khác và không còn là một bản ghi để xem. Hai điều kiện
    // này đứng cạnh nhau cố ý — bỏ vế đầu đi thì "vắng status" lại trả cả
    // khách đã gộp.
    const where: string[] = [
      'c.organization_id = $1',
      `c.status::text <> 'MERGED'`,
    ];

    if (status !== undefined) {
      params.push(STATUS_COLUMN_VALUE[status]);
      where.push(`c.status::text = $${params.length}`);
    }

    // Cả ba vế `OR` nằm trong MỘT cặp ngoặc — tách ra là `OR` leo ra ngoài và
    // phá luôn điều kiện tổ chức ở trên, tức rò dữ liệu sang tổ chức khác.
    //
    // `COALESCE(c.phone, '')`: cột nullable, `NULL ILIKE x` cho `NULL` chứ
    // không `false` — vẫn không khớp, nhưng viết rõ thì người sau không phải
    // tra lại luật ba trạng thái của SQL. `code`/`name` là NOT NULL.
    if (search?.trim()) {
      params.push(`%${escapeLikeTerm(search.trim())}%`);
      const p = `$${params.length}`;
      where.push(
        `(c.code ILIKE ${p} OR c.name ILIKE ${p} OR COALESCE(c.phone, '') ILIKE ${p})`,
      );
    }

    const whereSql = `WHERE ${where.join('\n    AND ')}`;

    // Chốt tham số của câu đếm TRƯỚC khi thêm `LIMIT`/`OFFSET`: nó dùng CÙNG
    // `whereSql` nhưng không phân trang. Thêm nhầm hai tham số thừa là
    // Postgres ném "bind message supplies N parameters".
    const countParams = [...params];

    params.push(limit, offset);
    const limitParam = `$${params.length - 1}`;
    const offsetParam = `$${params.length}`;

    const dataSql = `
      ${SALES_CTE}
      ${SELECT_COLUMNS}
      ${FROM_CLAUSE}
      ${whereSql}
      ORDER BY ${ORDER_BY[sort][order]}
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    // HAI truy vấn chứ không `COUNT(*) OVER()`: cùng lý do đã ghi ở
    // `MobileProductService.list` — trang vượt quá cuối phải vẫn trả `total`
    // thật. Câu đếm gánh luôn `totalRevenue`, vì nó đã quét đúng tập khớp.
    //
    // `whereSql` PHẢI giống hệt câu trên. Lệch một chữ là `total` không khớp
    // `data`, và thanh "Tổng" nói một con số không có trong danh sách.
    const countSql = `
      ${SALES_CTE}
      SELECT
        COUNT(*)::int                                   AS total,
        COALESCE(SUM(COALESCE(s.revenue, 0)), 0)::float AS "totalRevenue"
      ${FROM_CLAUSE}
      ${whereSql}
    `;

    const [data, countResult] = await Promise.all([
      this.dataSource.query<MobileCustomerResponseDto[]>(dataSql, params),
      this.dataSource.query<CountRow[]>(countSql, countParams),
    ]);

    return {
      data,
      total: countResult[0]?.total ?? 0,
      page,
      limit,
      totalRevenue: countResult[0]?.totalRevenue ?? 0,
    };
  }

  /**
   * Tra theo `id`, nhưng VẪN lọc `organizationId` và VẪN loại `MERGED`: uuid
   * là khoá toàn cục, bỏ vế tổ chức là một uuid đoán trúng đọc được khách của
   * tổ chức khác. Cùng luật với `MobileSupplierService.findById`.
   *
   * Câu 404 KHÔNG nội suy `id` — chuỗi máy, người dùng cuối đọc chỉ thấy nhiễu.
   */
  async findById(
    id: string,
    actor: ActorContext,
  ): Promise<MobileCustomerResponseDto> {
    const sql = `
      ${SALES_CTE}
      ${SELECT_COLUMNS}
      ${FROM_CLAUSE}
      WHERE c.organization_id = $1
        AND c.status::text <> 'MERGED'
        AND c.id = $2
    `;
    const [row] = await this.dataSource.query<MobileCustomerResponseDto[]>(
      sql,
      [actor.organizationId, id],
    );
    if (!row) {
      throw new NotFoundException('Không tìm thấy khách hàng.');
    }
    return row;
  }

  /**
   * Tạo khách hàng — UỶ QUYỀN cho `CustomerService.create`, KHÁC đường ghi
   * nhà cung cấp vốn tự `INSERT`. Lý do: bản ghi khách hàng không đứng một
   * mình. `CustomerService.create` còn cấp mã `KH…` qua `CustomerCodeService`
   * (bảng đánh số chung với web), phát thẻ thành viên trong cùng transaction,
   * và chặn sửa khách đã gộp. Chép lại ba việc đó là ba chỗ sẽ phân kỳ với web.
   *
   * Cái giá phải trả và cách trả: câu 409 trùng SĐT/email của service đó là
   * tiếng Anh, mà app hiện thẳng `message` lên toast. Nên tra trùng TRƯỚC ở
   * đây bằng câu tiếng Việt ([assertNoDuplicate]); nếu hai request đua nhau
   * thì lượt thua vẫn nhận câu tiếng Anh từ unique index — hiếm, và không mất
   * dữ liệu.
   *
   * Trả về qua [findById] chứ không trả entity vừa lưu: envelope của app có
   * doanh thu và TÊN hạng thẻ, thứ mà entity không mang.
   */
  async create(
    dto: MobileCustomerCreateDto,
    actor: ActorContext,
  ): Promise<MobileCustomerResponseDto> {
    const code = toOptional(dto.code);
    const phone = toOptional(dto.phone);
    const email = toOptional(dto.email);

    await this.assertNoDuplicate({ code, phone, email, actor });

    // `status` không có trong `CreateCustomerDto` của web (web luôn tạo khách
    // đang theo dõi), nhưng `CustomerService.create` spread trọn payload vào
    // entity, nên gài thêm ở đây là một lần ghi thay vì tạo rồi sửa. Ép kiểu
    // là để nói rõ đây là cố ý, không phải DTO của web thiếu sót.
    const payload = {
      code,
      name: dto.name.trim(),
      phone,
      email,
      address: toOptional(dto.address),
      birthDate: dto.birthDate ?? undefined,
      gender: dto.gender ?? undefined,
      note: toOptional(dto.note),
      status: STATUS_COLUMN_VALUE[dto.status ?? MobileCustomerStatus.ACTIVE],
    } as CreateCustomerDto;

    const saved = await this.customers.create(payload, actor);

    return this.findById(saved.id, actor);
  }

  /**
   * Sửa khách hàng — uỷ quyền `CustomerService.update`, cùng lý do [create].
   *
   * `undefined` (vắng khoá) = giữ nguyên; `null` hoặc chuỗi rỗng = xoá trắng ô
   * đó — cùng hợp đồng PATCH với nhà cung cấp. Riêng `code` rỗng nghĩa là GIỮ
   * mã cũ (mã do hệ thống cấp, không xoá trắng được) — `CustomerService`
   * tự xử ca đó.
   *
   * [findById] chạy TRƯỚC để 404 nói tiếng Việt và để khách đã gộp không sửa
   * được qua đường mobile (nó bị loại ngay từ câu SELECT).
   */
  async update(
    id: string,
    dto: MobileCustomerUpdateDto,
    actor: ActorContext,
  ): Promise<MobileCustomerResponseDto> {
    await this.findById(id, actor);

    const code = dto.code === undefined ? undefined : toOptional(dto.code);
    const phone = dto.phone === undefined ? undefined : toOptional(dto.phone);
    const email = dto.email === undefined ? undefined : toOptional(dto.email);

    await this.assertNoDuplicate({ code, phone, email, actor, excludeId: id });

    const payload: UpdateCustomerDto = {};
    if (dto.code !== undefined) payload.code = dto.code;
    if (dto.name !== undefined) payload.name = dto.name.trim();
    // `null` phải đi XUỐNG tận entity để `repository.merge` ghi NULL — kiểu
    // của DTO web khai `string | undefined`, nên ép kiểu đúng một chỗ, là đây.
    if (dto.phone !== undefined) payload.phone = phone as string | undefined;
    if (dto.email !== undefined) payload.email = email as string | undefined;
    if (dto.address !== undefined) {
      payload.address = toOptional(dto.address) as string | undefined;
    }
    if (dto.birthDate !== undefined) {
      payload.birthDate = dto.birthDate as string | undefined;
    }
    if (dto.gender !== undefined) {
      payload.gender = dto.gender as UpdateCustomerDto['gender'];
    }
    if (dto.note !== undefined) {
      payload.note = toOptional(dto.note) as string | undefined;
    }
    if (dto.status !== undefined) payload.status = STATUS_COLUMN_VALUE[dto.status];

    await this.customers.update(id, payload, actor);

    return this.findById(id, actor);
  }

  /**
   * Xoá CỨNG một khách hàng — cùng chính sách mà web áp cho nhà cung cấp
   * (`InventoryProviderCrudService` khai `deletionPolicy: HARD`), theo yêu cầu
   * "xoá giống web".
   *
   * KHÔNG uỷ quyền `CustomerService.remove`: policy của nó là SOFT — gán
   * `deletedAt` rồi `save`, mà bảng `customers` không có cột đó, nên lượt xoá
   * của web là một no-op im lặng (bản ghi vẫn còn, web vẫn báo "Đã xoá").
   *
   * Hệ quả của xoá cứng, đọc từ FK của bảng: `membership_cards` xoá theo
   * (CASCADE); `invoices.customer_id` về NULL — hoá đơn cũ thành khách lẻ;
   * `invoice_debts` / `customer_credits` / `merged_into_id` chặn (RESTRICT) —
   * Postgres ném `23503`, dịch thành 409 tiếng Việt vì app hiện thẳng
   * `message`. Người dùng còn muốn giữ lịch sử thì có công tắc "Ngừng theo
   * dõi" ở form; đây là nút xoá.
   *
   * [findById] chạy trước để 404 nói tiếng Việt và khách đã gộp không xoá
   * được qua đường này.
   */
  async remove(id: string, actor: ActorContext): Promise<void> {
    await this.findById(id, actor);

    await this.dataSource
      .query(`DELETE FROM customers WHERE organization_id = $1 AND id = $2`, [
        actor.organizationId,
        id,
      ])
      .catch((err: unknown) => {
        if (pgCodeOf(err) === '23503') {
          throw new ConflictException(
            'Khách hàng đang có công nợ, tín dụng hoặc bản ghi liên quan, không thể xoá.',
          );
        }
        throw err;
      });
  }

  /**
   * 409 tiếng Việt khi mã/SĐT/email đã thuộc khách khác trong tổ chức.
   *
   * Mã cũng tra ở đây dù `CustomerService.beforeUpdate` đã tra (tiếng Việt):
   * đường CREATE của nó KHÔNG tra và cũng không bắt `23505`, nên mã trùng lúc
   * tạo ra thẳng 500 — đã thấy trên server dev. Chặn ở đây là 409 đọc được.
   *
   * KHÔNG loại khách đã gộp: unique index của bảng không loại họ, nên một SĐT
   * của khách đã gộp vẫn đụng ở DB — báo trước ở đây là báo đúng sự thật.
   */
  private async assertNoDuplicate(input: {
    code: string | null | undefined;
    phone: string | null | undefined;
    email: string | null | undefined;
    actor: ActorContext;
    excludeId?: string;
  }): Promise<void> {
    const { code, phone, email, actor, excludeId } = input;

    const taken = async (column: 'code' | 'phone' | 'email', value: string) => {
      const rows = await this.dataSource.query<DuplicateRow[]>(
        `SELECT id FROM customers
         WHERE organization_id = $1 AND ${column} = $2
           AND ($3::uuid IS NULL OR id <> $3::uuid)
         LIMIT 1`,
        [actor.organizationId, value, excludeId ?? null],
      );
      return rows.length > 0;
    };

    if (code && (await taken('code', code))) {
      throw new ConflictException(`Mã khách hàng "${code}" đã tồn tại.`);
    }
    if (phone && (await taken('phone', phone))) {
      throw new ConflictException(
        `Số điện thoại "${phone}" đã được dùng cho khách hàng khác.`,
      );
    }
    if (email && (await taken('email', email))) {
      throw new ConflictException(
        `Email "${email}" đã được dùng cho khách hàng khác.`,
      );
    }
  }
}

/**
 * Mã lỗi Postgres của một lỗi TypeORM, nếu có. Đọc `err.code` rồi mới tới
 * `driverError.code`: TypeORM gói lỗi driver ở độ sâu khác nhau tuỳ phiên bản
 * — cùng cách `rethrowDuplicateCode` của nhà cung cấp.
 */
function pgCodeOf(err: unknown): string | undefined {
  if (!(err instanceof QueryFailedError)) return undefined;
  return (
    (err as QueryFailedError & { code?: string }).code ??
    (err as { driverError?: { code?: string } }).driverError?.code
  );
}

/**
 * Chuỗi rỗng / toàn khoảng trắng / `null` -> `null`; còn lại -> đã `trim`.
 *
 * `null` chứ không `undefined` để phân biệt được "xoá trắng" với "không đổi" ở
 * [MobileCustomerService.update]; nơi gọi tự đổi sang `undefined` khi cần.
 */
function toOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
