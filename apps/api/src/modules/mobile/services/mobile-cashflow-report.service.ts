import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { MobileCashflowKind } from '../dto/mobile-cashflow-report.query.dto';
import {
  MobileCashflowCategoryDto,
  MobileCashflowStoreDto,
  MobileCashflowStoreListDto,
  MobileCashflowSummaryDto,
} from '../dto/mobile-cashflow-report.response.dto';
import { resolveReportBranchScope } from './mobile-report-scope.util';

interface SummaryRow {
  opening: number | string | null;
  closing: number | string | null;
  income: number | string | null;
  expense: number | string | null;
}

/** Một dòng = một (cửa hàng × hạng mục); cửa hàng không có hạng mục nào ra đúng một dòng với ba cột category NULL. */
interface StoreCategoryRow {
  id: string;
  name: string;
  amount: number | string | null;
  categoryId: string | null;
  categoryName: string | null;
  categoryAmount: number | string | null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Mỗi dòng là một CHÂN của một movement trên một quỹ trong phạm vi — là
 * `signedCase()` của `CashLedgerService` viết lại theo quỹ thay vì theo một
 * `$1` cố định, để một câu quét được nhiều quỹ (nhiều cửa hàng) cùng lúc.
 *
 * `$1` tổ chức, `$2` từ ngày, `$3` đến ngày, `$4` mảng chi nhánh (VARCHAR →
 * `::text[]`, như mọi báo cáo mobile khác).
 *
 * Ba điều phải biết trước khi "sửa cho gọn":
 *
 * 1. **Phạm vi lọc theo `cash_accounts.branch_id`, KHÔNG theo
 *    `cash_movements.branch_id`.** Một dòng TRANSFER giữa hai chi nhánh mang
 *    `branch_id` của bên nguồn; đọc theo cột đó thì quỹ đích không thấy tiền
 *    về. Vế `UNION ALL` thứ hai là chân ĐÍCH của TRANSFER: cùng movement, dấu
 *    dương, gán cho chi nhánh của `to_account_id`. Chuyển giữa hai quỹ cùng
 *    phạm vi thì ra chi ở A + thu ở B, tổng chênh lệch bằng 0 — đúng cách sổ
 *    quỹ web bày cùng một dòng ở cả hai sổ.
 * 2. **Chặn `created_at` ở mốc CUỐI ngay trong CTE**, mốc đầu để ngoài: đầu kỳ
 *    cần cả phần trước `$2`, còn phần sau `$3` thì không câu nào cần. Cột là
 *    timestamptz nên so `< ($3::date + INTERVAL '1 day')` để tính TRỌN ngày
 *    cuối — cùng luật mọi endpoint `/mobile/reports/*`.
 * 3. **`cash_movements` KHÔNG có `deleted_at`** (chỉ phiếu mới có), nên không
 *    có vế soft-delete ở đây. Đừng thêm "cho đồng bộ" — cột không tồn tại.
 *
 * `m.type` là enum Postgres nên so với literal `'TRANSFER'`, không bind
 * `$n::text` — cùng cách `CashLedgerService` viết.
 */
export const LEGS_CTE = `
  WITH legs AS (
    SELECT ca.branch_id,
           m.id                                    AS movement_id,
           m.created_at,
           CASE
             WHEN m.type = 'DEPOSIT'    THEN  m.amount
             WHEN m.type = 'ADJUSTMENT' THEN  m.amount
             WHEN m.type = 'WITHDRAWAL' THEN -m.amount
             WHEN m.type = 'TRANSFER'   THEN -m.amount
             ELSE 0
           END                                     AS signed
    FROM cash_movements m
    JOIN cash_accounts ca ON ca.id = m.cash_account_id
    WHERE m.organization_id = $1
      AND ca.branch_id = ANY($4::text[])
      AND m.created_at < ($3::date + INTERVAL '1 day')

    UNION ALL

    SELECT ca.branch_id,
           m.id,
           m.created_at,
           m.amount
    FROM cash_movements m
    JOIN cash_accounts ca ON ca.id = m.to_account_id
    WHERE m.organization_id = $1
      AND m.type = 'TRANSFER'
      AND ca.branch_id = ANY($4::text[])
      AND m.created_at < ($3::date + INTERVAL '1 day')
  )
`;

/**
 * Bốn con số của màn chính, MỘT câu — `legs` đã chặn ở hết ngày cuối kỳ nên
 * `closing` là tổng trơn, còn ba số kia rẽ theo mốc đầu kỳ.
 */
const SUMMARY_SQL = `
  ${LEGS_CTE}
  SELECT COALESCE(SUM(CASE WHEN created_at <  $2::date THEN signed END), 0)::float                AS opening,
         COALESCE(SUM(signed), 0)::float                                                           AS closing,
         COALESCE(SUM(CASE WHEN created_at >= $2::date AND signed > 0 THEN  signed END), 0)::float AS income,
         COALESCE(SUM(CASE WHEN created_at >= $2::date AND signed < 0 THEN -signed END), 0)::float AS expense
  FROM legs
`;

/**
 * Whitelist theo chiều tiền — tra toàn phần trên enum, KHÔNG bind `kind` vào
 * SQL: giá trị đi thẳng vào thân câu lệnh, và cách duy nhất để một chuỗi lạ
 * không lọt tới đó là nó không phải khoá của bảng này.
 */
const KIND_SQL: Record<MobileCashflowKind, { where: string; amount: string }> = {
  [MobileCashflowKind.INCOME]: { where: 'signed > 0', amount: 'signed' },
  [MobileCashflowKind.EXPENSE]: { where: 'signed < 0', amount: '-signed' },
};

/**
 * Chép `VOUCHER_JOINS` của `CashLedgerService`: `LEFT JOIN LATERAL ... LIMIT 1`
 * chứ không join thường, vì `cash_movement_id` là 1:1 theo hợp đồng nhưng một
 * join thường sẽ lặng lẽ nhân dòng nếu hợp đồng đó gãy. Phiếu xoá mềm bị loại;
 * phiếu chi thắng phiếu thu khi cả hai cùng trỏ một movement.
 */
const VOUCHER_OF_CTE = `
  voucher_of AS (
    SELECT p.branch_id,
           p.movement_id,
           cp.id AS payment_id,
           cr.id AS receipt_id
    FROM period p
    LEFT JOIN LATERAL (
      SELECT r.id FROM cash_receipts r
      WHERE r.cash_movement_id = p.movement_id AND r.deleted_at IS NULL
      LIMIT 1
    ) cr ON true
    LEFT JOIN LATERAL (
      SELECT x.id FROM cash_payments x
      WHERE x.cash_movement_id = p.movement_id AND x.deleted_at IS NULL
      LIMIT 1
    ) cp ON true
  )
`;

/**
 * Báo cáo "Tình hình thu chi" cho app mobile — sổ QUỸ TIỀN MẶT gộp theo cửa
 * hàng, không gồm tiền gửi (chốt với người dùng 2026-09-13).
 *
 * Không uỷ quyền cho `CashLedgerService` được: nó nhận đúng MỘT quỹ mỗi lượt
 * (`resolveBranchCashFund` theo `X-Branch-Id`) và trả bảng dòng để cuộn, trong
 * khi app cần bốn con số cho N cửa hàng rồi tách theo hạng mục. Nên chép ĐÚNG
 * `signedCase()` và hai mốc kỳ của nó vào `LEGS_CTE` — sửa dấu ở bên kia thì
 * phải sửa cả ở đây, và đó là điều kiện để số ở app khớp "Sổ chi tiết tiền
 * mặt" trên web cùng kỳ cùng quỹ.
 *
 * Hệ quả phải nói thẳng, vì nó KHÁC cách nhìn theo phiếu: một phiếu bị ĐẢO
 * ra hai movement ngược dấu, nên nó hiện ở cả cột thu lẫn cột chi — web cũng
 * vậy. Số dư thì đúng; hai tổng thì "phồng" đều nhau. Đã cân nhắc đọc thẳng
 * bảng phiếu (loại `REVERSAL`) và từ chối: đầu/cuối kỳ khi đó không còn là số
 * dư thật của quỹ (thiếu điều chỉnh, chuyển quỹ, tiền phiên POS không có phiếu).
 *
 * Phạm vi chi nhánh = tập PHÂN CÔNG qua `resolveReportBranchScope`, cùng luật
 * với mọi báo cáo mobile khác. `@InjectDataSource` vì câu lệnh đụng sáu bảng.
 */
@Injectable()
export class MobileCashflowReportService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getSummary(
    query: { from: string; to: string; branchIds?: string[] },
    actor: ActorContext,
  ): Promise<MobileCashflowSummaryDto> {
    // 403 TRƯỚC khi chạm DB, và tập trả về là thứ đi vào `$4`.
    const branchIds = resolveReportBranchScope({ requested: query.branchIds, actor });
    const params: unknown[] = [actor.organizationId, query.from, query.to, branchIds];

    const rows = await this.dataSource.query<SummaryRow[]>(SUMMARY_SQL, params);
    const row = rows[0];

    // `round2` vì `SUM` trên float đẻ rác phần lẻ (0.1 + 0.2), và tiền đồng
    // không có phần lẻ để mà giữ. Không có dòng nào (quỹ chưa từng có
    // movement) thì bốn số 0 — đó là sổ trống, không phải lỗi.
    return {
      opening: round2(Number(row?.opening ?? 0)),
      closing: round2(Number(row?.closing ?? 0)),
      income: round2(Number(row?.income ?? 0)),
      expense: round2(Number(row?.expense ?? 0)),
    };
  }

  /**
   * Cửa hàng có phát sinh theo chiều [kind], mỗi cửa hàng kèm tiền theo hạng
   * mục. Cửa hàng trong phạm vi mà KHÔNG phát sinh thì không có dòng — app hiện
   * trang rỗng khi danh sách rỗng, và một lát 0% trên donut thì không nói gì.
   */
  async listStores(
    query: { kind: MobileCashflowKind; from: string; to: string; branchIds?: string[] },
    actor: ActorContext,
  ): Promise<MobileCashflowStoreListDto> {
    const branchIds = resolveReportBranchScope({ requested: query.branchIds, actor });
    const params: unknown[] = [actor.organizationId, query.from, query.to, branchIds];
    const { where, amount } = KIND_SQL[query.kind];

    // Hạng mục nằm ở DÒNG phiếu (`cash_*_lines.category_id`), không ở đầu
    // phiếu, nên phải đi movement → phiếu → dòng. Vế `receipt` thêm
    // `payment_id IS NULL` để một movement không bị cộng hai lần khi cả hai
    // loại phiếu cùng trỏ vào nó — cùng ưu tiên với `VOUCHER_OF_CTE`.
    //
    // Tên cửa hàng lùi về id khi `branches` không có dòng (id lạ, chi nhánh đã
    // xoá): một dòng với mã còn đọc được, một dòng trống thì không.
    const sql = `
      ${LEGS_CTE},
      period AS (
        SELECT branch_id, movement_id, ${amount} AS amount
        FROM legs
        WHERE created_at >= $2::date AND ${where}
      ),
      stores AS (
        SELECT branch_id, SUM(amount)::float AS amount
        FROM period
        GROUP BY branch_id
      ),
      ${VOUCHER_OF_CTE},
      categorized AS (
        SELECT v.branch_id, l.category_id, SUM(l.amount) AS amount
        FROM voucher_of v
        JOIN cash_payment_lines l ON l.cash_payment_id = v.payment_id
        GROUP BY v.branch_id, l.category_id

        UNION ALL

        SELECT v.branch_id, l.category_id, SUM(l.amount)
        FROM voucher_of v
        JOIN cash_receipt_lines l ON l.cash_receipt_id = v.receipt_id
        WHERE v.payment_id IS NULL
        GROUP BY v.branch_id, l.category_id
      ),
      by_category AS (
        SELECT branch_id, category_id, SUM(amount)::float AS amount
        FROM categorized
        WHERE category_id IS NOT NULL
        GROUP BY branch_id, category_id
      )
      SELECT s.branch_id                    AS id,
             COALESCE(b.name, s.branch_id)  AS name,
             s.amount,
             c.category_id::text            AS "categoryId",
             cat.name                       AS "categoryName",
             c.amount                       AS "categoryAmount"
      FROM stores s
      LEFT JOIN branches b ON b.id::text = s.branch_id
      LEFT JOIN by_category c ON c.branch_id = s.branch_id
      LEFT JOIN cash_voucher_categories cat ON cat.id = c.category_id
      ORDER BY s.amount DESC, s.branch_id ASC, c.amount DESC NULLS LAST, cat.name ASC
    `;

    const rows = await this.dataSource.query<StoreCategoryRow[]>(sql, params);

    return { data: this.groupStores(rows) };
  }

  /**
   * Gom dòng (cửa hàng × hạng mục) thành cửa hàng, GIỮ thứ tự SQL, rồi thêm
   * dòng "chưa xếp hạng mục" bằng phần DƯ `amount − Σ hạng mục`.
   *
   * Tính bằng phần dư chứ không cộng riêng các dòng `category_id IS NULL`, vì
   * Σ dòng phiếu ≠ Σ movement là chuyện thường: movement không có phiếu
   * (chuyển quỹ, điều chỉnh, tiền phiên POS), movement BÙ khi sửa/xoá phiếu
   * không gắn `cash_movement_id`, phiếu đã xoá mềm bị loại khỏi join. Phần dư
   * gom trọn mọi ca đó, và Σ hạng mục luôn bằng tiền của cửa hàng — điều kiện
   * để tỷ trọng ở app cộng ra 100%.
   *
   * Ca biên đã biết, CHẤP NHẬN: phiếu ghi ở kỳ trước bị sửa trong kỳ này thì
   * Σ hạng mục có thể VƯỢT tiền cửa hàng; khi đó phần dư âm và không có dòng
   * `null` — không kẹp các hạng mục lại, vì chúng là số thật của phiếu.
   */
  private groupStores(rows: StoreCategoryRow[]): MobileCashflowStoreDto[] {
    const stores: MobileCashflowStoreDto[] = [];
    const byId = new Map<string, MobileCashflowStoreDto>();

    for (const row of rows) {
      let store = byId.get(row.id);
      if (!store) {
        store = {
          id: row.id,
          name: row.name,
          amount: round2(Number(row.amount ?? 0)),
          categories: [],
        };
        byId.set(row.id, store);
        stores.push(store);
      }

      if (row.categoryId) {
        store.categories.push({
          id: row.categoryId,
          name: row.categoryName,
          amount: round2(Number(row.categoryAmount ?? 0)),
        });
      }
    }

    for (const store of stores) {
      const categorized = store.categories.reduce((sum, c) => sum + c.amount, 0);
      const rest = round2(store.amount - categorized);
      if (rest > 0) {
        const uncategorized: MobileCashflowCategoryDto = { id: null, name: null, amount: rest };
        store.categories.push(uncategorized);
      }
    }

    return stores;
  }
}
