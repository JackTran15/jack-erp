import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ReceivableStatus } from '@erp/shared-interfaces';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { escapeLikeTerm } from '../../../common/utils/like-escape.util';
import { MobileCustomerOrder } from '../dto/mobile-customer-list.query.dto';
import { MobileCustomerDebtSort } from '../dto/mobile-debt-report.query.dto';
import {
  MobileCustomerDebtDto,
  MobileCustomerDebtPageDto,
} from '../dto/mobile-debt-report.response.dto';
import { resolveReportBranchScope } from './mobile-report-scope.util';

interface CountRow {
  total: number;
  totalClosing: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Trạng thái receivable đã GHI SỔ — chép đúng `BOOKED_RECEIVABLE_STATUSES` của
 * `CustomerDebtsReport` (loại DRAFT/VOIDED). Dùng enum chứ không chuỗi trần
 * để đổi tên ở `@erp/shared-interfaces` thì đây gãy lúc build.
 */
const BOOKED_RECEIVABLE_STATUSES = [
  ReceivableStatus.POSTED,
  ReceivableStatus.PARTIALLY_SETTLED,
  ReceivableStatus.SETTLED,
  ReceivableStatus.WRITTEN_OFF,
];

const BOOKED_STATUSES_SQL = BOOKED_RECEIVABLE_STATUSES.map((s) => `'${s}'`).join(', ');

/**
 * Sổ công nợ khách hàng gộp từ BỐN nguồn, mỗi dòng `(customer_id, opening,
 * period)` ĐÃ MANG DẤU (tăng dương, giảm âm) — chép đúng bốn `DebtLedgerSource`
 * của `CustomerDebtsReport` (web), chỉ khác là gộp bằng `UNION ALL` +
 * `GROUP BY` thay vì bốn query + merge trong bộ nhớ.
 *
 * | Nguồn | Tăng/giảm | Cột ngày | Kiểu | Chi nhánh lọc theo |
 * |---|---|---|---|---|
 * | `invoice_debts`          | tăng | `issued_at`       | date        | chính nó |
 * | `debt_payments`          | giảm | `paid_at`         | timestamptz | NỢ GỐC (`invoice_debts.branch_id`) |
 * | `receivables`            | tăng | `posted_at`       | timestamptz | chính nó |
 * | `receivable_settlements` | giảm | `settlement_date` | date        | receivable gốc |
 *
 * Hai điều phải biết trước khi "sửa cho gọn":
 *
 * 1. **Cột `date` so `<= $to::date`, cột `timestamptz` so
 *    `< ($to::date + INTERVAL '1 day')`.** Web so cả bốn bằng `<= :toDate`
 *    (chuỗi ngày), mà với timestamptz đó là "≤ 00:00 ngày cuối" — tức BỎ SÓT
 *    khoản thu và ghi sổ phát sinh trong ngày cuối kỳ. Mobile tính trọn ngày
 *    cuối (đã chốt với người dùng 2026-09-13), cùng khuôn mọi endpoint
 *    `/mobile/reports/*`. Hệ quả: số ở app có thể KHÁC web đúng vào ngày có
 *    thu nợ trong ngày cuối kỳ, và app mới là số đúng. Đừng "đồng bộ" ngược.
 * 2. **Bản ghi `branch_id IS NULL` (ghi ở cấp tổ chức) bị LOẠI.** Mobile không
 *    có vế hợp nhất (`resolveReportBranchScope` luôn trả một mảng), nên `= ANY`
 *    không khớp `NULL`. Web với quyền `reporting.debts.consolidated.read` thì
 *    tính chúng. Lệch này là hệ quả của luật "phạm vi mobile = phân công" đã
 *    chốt ở Tổng quan, không phải bug riêng ở đây.
 *
 * `adjustment` (trả hàng bù trừ) có `original_amount` ÂM sẵn nên đi qua nguồn
 * tăng mà không cần nhánh riêng — cùng cách web đọc.
 *
 * Cột `branch_id`/`organization_id` là VARCHAR ở cả bốn bảng (kiểm bằng
 * `information_schema` 2026-09-13) → `ANY($4::text[])`, không `::uuid[]`.
 */
const LEDGER_CTE = `
  WITH ledger AS (
    SELECT d.customer_id,
           CASE WHEN d.issued_at <  $2::date THEN d.original_amount ELSE 0 END AS opening,
           CASE WHEN d.issued_at >= $2::date AND d.issued_at <= $3::date
                THEN d.original_amount ELSE 0 END                             AS period
    FROM invoice_debts d
    WHERE d.organization_id = $1
      AND d.branch_id = ANY($4::text[])

    UNION ALL

    SELECT d.customer_id,
           -(CASE WHEN p.paid_at <  $2::date THEN p.amount ELSE 0 END),
           -(CASE WHEN p.paid_at >= $2::date AND p.paid_at < ($3::date + INTERVAL '1 day')
                  THEN p.amount ELSE 0 END)
    FROM debt_payments p
    JOIN invoice_debts d ON d.id = p.debt_id
    WHERE p.organization_id = $1
      AND d.branch_id = ANY($4::text[])

    UNION ALL

    SELECT r.customer_id,
           CASE WHEN r.posted_at <  $2::date THEN r.amount ELSE 0 END,
           CASE WHEN r.posted_at >= $2::date AND r.posted_at < ($3::date + INTERVAL '1 day')
                THEN r.amount ELSE 0 END
    FROM receivables r
    WHERE r.organization_id = $1
      AND r.branch_id = ANY($4::text[])
      AND r.status::text IN (${BOOKED_STATUSES_SQL})

    UNION ALL

    SELECT r.customer_id,
           -(CASE WHEN s.settlement_date <  $2::date THEN s.amount ELSE 0 END),
           -(CASE WHEN s.settlement_date >= $2::date AND s.settlement_date <= $3::date
                  THEN s.amount ELSE 0 END)
    FROM receivable_settlements s
    JOIN receivables r ON r.id = s.receivable_id
    WHERE s.organization_id = $1
      AND r.branch_id = ANY($4::text[])
  ),
  balances AS (
    SELECT customer_id,
           (SUM(opening) + SUM(period))::float AS closing
    FROM ledger
    GROUP BY customer_id
  )
`;

/**
 * `JOIN` chứ không `LEFT JOIN`: một khách có trong sổ mà không có ở
 * `customers` (cùng tổ chức) là dữ liệu hỏng, không bày ra. Hệ quả cần biết:
 * khách chỉ phát sinh SAU `to` vẫn có dòng với `closing = 0` — web cũng vậy
 * (`mergeLedgerSides` không lọc theo ngày), và bỏ họ đi là mất "đã trả hết
 * trong kỳ" khỏi danh sách.
 */
const FROM_CLAUSE = `
  FROM balances b
  JOIN customers c ON c.id = b.customer_id
`;

/**
 * Whitelist `ORDER BY` — tra toàn phần trên hai enum như `MobileCustomerService`,
 * và cùng hai luật: mọi nhánh kết `c.id` (tie-break bắt buộc khi phân trang),
 * sắp theo số thì tiêu chí phụ là TÊN vì đó là thứ người dùng đọc được khi
 * hai khách cùng số nợ.
 */
const ORDER_BY: Record<
  MobileCustomerDebtSort,
  Record<MobileCustomerOrder, string>
> = {
  [MobileCustomerDebtSort.NAME]: {
    [MobileCustomerOrder.ASC]: 'lower(c.name) ASC, c.id ASC',
    [MobileCustomerOrder.DESC]: 'lower(c.name) DESC, c.id ASC',
  },
  [MobileCustomerDebtSort.DEBT]: {
    [MobileCustomerOrder.ASC]: 'b.closing ASC, lower(c.name) ASC, c.id ASC',
    [MobileCustomerOrder.DESC]: 'b.closing DESC, lower(c.name) ASC, c.id ASC',
  },
};

/**
 * Báo cáo "Công nợ khách hàng" cho app mobile — nợ CUỐI KỲ từng khách, phân
 * trang, tìm kiếm, sắp xếp ở SQL.
 *
 * Không uỷ quyền cho `CustomerDebtsReport` của web được: nó là `POST` trả bảng
 * cột động, gộp bốn query trong bộ nhớ rồi `In(customerIds)`, sắp cố định
 * theo tên và cắt trang bằng `slice` — không tìm theo mã/SĐT, không sắp theo
 * nợ. Nên chép ĐÚNG bốn nguồn + công thức của nó vào `LEDGER_CTE` — sửa nguồn
 * ở bên kia thì phải sửa cả ở đây.
 *
 * Phạm vi chi nhánh = tập PHÂN CÔNG qua `resolveReportBranchScope`, cùng luật
 * với mọi báo cáo mobile khác. `@InjectDataSource` vì câu lệnh đụng năm bảng.
 */
@Injectable()
export class MobileDebtReportService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async listCustomers(
    query: {
      from: string;
      to: string;
      branchIds?: string[];
      search?: string;
      sort: MobileCustomerDebtSort;
      order: MobileCustomerOrder;
      page: number;
      limit: number;
    },
    actor: ActorContext,
  ): Promise<MobileCustomerDebtPageDto> {
    const { page, limit, sort, order, search } = query;
    const offset = (page - 1) * limit;

    // 403 TRƯỚC khi chạm DB, và tập trả về là thứ đi vào `$4`.
    const branchIds = resolveReportBranchScope({
      requested: query.branchIds,
      actor,
    });

    // `$1..$4` cố định vì CTE tham chiếu chúng theo số; phần sau đánh số động
    // như `MobileCustomerService.list`.
    const params: unknown[] = [actor.organizationId, query.from, query.to, branchIds];

    // `MERGED` luôn bị loại: khách đã gộp trỏ sang khách khác và không còn là
    // một bản ghi để xem. Sổ nợ của họ (nếu có) là dữ liệu chưa được dọn theo,
    // không phải thứ để bày lên app.
    const where: string[] = [
      'c.organization_id = $1',
      `c.status::text <> 'MERGED'`,
    ];

    // Cả ba vế `OR` trong MỘT cặp ngoặc — tách ra là `OR` leo ra ngoài và phá
    // điều kiện tổ chức, tức rò dữ liệu. `COALESCE(c.phone, '')` vì cột nullable.
    if (search?.trim()) {
      params.push(`%${escapeLikeTerm(search.trim())}%`);
      const p = `$${params.length}`;
      where.push(
        `(c.code ILIKE ${p} OR c.name ILIKE ${p} OR COALESCE(c.phone, '') ILIKE ${p})`,
      );
    }

    const whereSql = `WHERE ${where.join('\n    AND ')}`;

    // Chốt tham số câu đếm TRƯỚC khi thêm `LIMIT`/`OFFSET`.
    const countParams = [...params];

    params.push(limit, offset);
    const limitParam = `$${params.length - 1}`;
    const offsetParam = `$${params.length}`;

    const dataSql = `
      ${LEDGER_CTE}
      SELECT c.id::text AS id,
             c.code,
             c.name,
             b.closing
      ${FROM_CLAUSE}
      ${whereSql}
      ORDER BY ${ORDER_BY[sort][order]}
      LIMIT ${limitParam} OFFSET ${offsetParam}
    `;

    // HAI truy vấn, cùng `whereSql`: trang vượt cuối vẫn phải trả `total`
    // thật, và câu đếm gánh luôn `totalClosing` vì nó đã quét đúng tập khớp.
    const countSql = `
      ${LEDGER_CTE}
      SELECT COUNT(*)::int                       AS total,
             COALESCE(SUM(b.closing), 0)::float  AS "totalClosing"
      ${FROM_CLAUSE}
      ${whereSql}
    `;

    const [rows, countResult] = await Promise.all([
      this.dataSource.query<MobileCustomerDebtDto[]>(dataSql, params),
      this.dataSource.query<CountRow[]>(countSql, countParams),
    ]);

    // `round2` vì `SUM` trên float đẻ rác phần lẻ (0.1 + 0.2), và tiền đồng
    // không có phần lẻ để mà giữ.
    return {
      data: rows.map((r) => ({ ...r, closing: round2(Number(r.closing ?? 0)) })),
      total: countResult[0]?.total ?? 0,
      page,
      limit,
      totalClosing: round2(Number(countResult[0]?.totalClosing ?? 0)),
    };
  }
}
