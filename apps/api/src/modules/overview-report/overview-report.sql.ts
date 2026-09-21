import {
  CashReceiptReferenceType,
  CashVoucherCategoryDirection,
  CashVoucherStatus,
} from '../accounting/cash-vouchers/enums';
import {
  BankReceiptReferenceType,
  BankVoucherStatus,
} from '../accounting/deposit-vouchers/enums';
import { InvoiceStatus } from '../pos/entities/invoice.entity';

/**
 * Mảnh SQL riêng của Tổng quan web — chỉ những câu mobile CHƯA có. Mọi câu
 * còn lại dùng thẳng mảnh của `modules/mobile` (xem service), để hai màn
 * Tổng quan cùng kỳ cùng chi nhánh ra cùng số.
 *
 * Cùng quy ước tham số mobile: `$1` org, `$2` from, `$3` to (ngày trần, bao
 * trọn ngày cuối), `$4` mảng chi nhánh (VARCHAR → `::text[]`).
 */

/**
 * Hoá đơn HUỶ trong kỳ, kèm giá trị — cùng WHERE với `CANCELLED_SQL` của chi
 * tiết cửa hàng mobile (câu đó chỉ đếm), thêm tổng `amount_due`.
 */
export const CANCELLED_WITH_AMOUNT_SQL = `
  SELECT COUNT(*)::int AS count,
         COALESCE(SUM(i.amount_due), 0)::float AS amount
  FROM invoices i
  WHERE i.organization_id = $1
    AND i.branch_id = ANY($4::text[])
    AND i.is_draft = false
    AND i.status = '${InvoiceStatus.CANCELLED}'
    AND i.issued_at >= $2::date
    AND i.issued_at < ($3::date + INTERVAL '1 day')
`;

const excludedReceiptRefs = [
  CashReceiptReferenceType.INVOICE,
  CashReceiptReferenceType.INVOICE_DEBT,
  CashReceiptReferenceType.RECEIVABLE,
  CashReceiptReferenceType.REVERSAL,
]
  .map((v) => `'${v}'`)
  .join(', ');

/**
 * "Thu khác" trong kỳ, theo phương thức — chép ĐÚNG vế 3 và 4 ("thu khác")
 * của `cellsSql` (báo cáo kinh doanh mobile ≡ web KQKD): phiếu thu tiền mặt
 * → `cash`, phiếu thu tiền gửi có `affect_revenue` → `bank_transfer`. Sửa
 * điều kiện ở đó thì sửa cả ở đây.
 */
export const OTHER_RECEIPTS_SQL = `
  SELECT 'cash' AS method, COALESCE(SUM(l.amount), 0)::float AS amount
  FROM cash_receipt_lines l
  JOIN cash_receipts r ON r.id = l.cash_receipt_id
  LEFT JOIN cash_voucher_categories c ON c.id = l.category_id
  WHERE r.organization_id = $1
    AND r.status = '${CashVoucherStatus.POSTED}'
    AND r.posted_at >= $2::date
    AND r.posted_at < ($3::date + INTERVAL '1 day')
    AND r.branch_id = ANY($4::text[])
    AND (l.category_id IS NULL OR c.direction = '${CashVoucherCategoryDirection.IN}')
    AND (r.reference_type IS NULL OR r.reference_type NOT IN (${excludedReceiptRefs}))

  UNION ALL

  SELECT 'bank_transfer' AS method, COALESCE(SUM(l.amount), 0)::float AS amount
  FROM bank_receipt_lines l
  JOIN bank_receipts r ON r.id = l.bank_receipt_id
  LEFT JOIN cash_voucher_categories c ON c.id = l.category_id
  WHERE r.organization_id = $1
    AND r.status = '${BankVoucherStatus.POSTED}'
    AND r.posted_at >= $2::date
    AND r.posted_at < ($3::date + INTERVAL '1 day')
    AND r.branch_id = ANY($4::text[])
    AND r.affect_revenue = true
    AND (l.category_id IS NULL OR c.direction = '${CashVoucherCategoryDirection.IN}')
    AND (r.reference_type IS NULL OR r.reference_type <> '${BankReceiptReferenceType.REVERSAL}')
`;
