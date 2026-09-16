import { EntityManager, In } from 'typeorm';
import { InvoiceEntity, InvoiceStatus } from '../../pos/entities/invoice.entity';
import { DebtStatus, InvoiceDebtEntity } from '../../pos/entities/invoice-debt.entity';

const round = (v: number): number => Math.round(v * 100) / 100;

/**
 * Đồng bộ HOÁ ĐƠN sau khi một khoản nợ của nó đổi (thu nợ hay hoàn lại phiếu thu).
 *
 * Trước 2026-09-14 hai saga thu nợ chỉ ghi `invoice_debts`; `invoices.status` đứng
 * mãi ở `debt`/`partial_debt` và `total_paid` không đổi — app bày dấu GHI NỢ và nút
 * *Thu nợ* trên một hoá đơn đã thu đủ (Loc bắt được trên máy). Ở đây:
 * `total_paid` cộng/trừ `delta`; trạng thái tính lại từ CHÍNH các khoản nợ còn mở
 * của hoá đơn: hết nợ → `paid`, còn nợ nhưng đã thu một phần → `partial_debt`, chưa
 * thu gì → `debt`. Chỉ đụng hoá đơn đang ở nhóm nợ — không chạm `cancelled`/`draft`.
 */
export async function syncInvoiceAfterDebtChange(
  manager: EntityManager,
  debt: Pick<InvoiceDebtEntity, 'invoiceId' | 'organizationId'>,
  delta: number,
): Promise<void> {
  if (!debt.invoiceId) return;
  const invoice = await manager.findOne(InvoiceEntity, {
    where: { id: debt.invoiceId, organizationId: debt.organizationId },
  });
  if (!invoice) return;
  const debtStatuses: InvoiceStatus[] = [InvoiceStatus.DEBT, InvoiceStatus.PARTIAL_DEBT, InvoiceStatus.PAID];
  if (!debtStatuses.includes(invoice.status)) return;

  const totalPaid = round(Math.max(0, Number(invoice.totalPaid) + delta));
  const openDebts = await manager.count(InvoiceDebtEntity, {
    where: { invoiceId: invoice.id, status: In([DebtStatus.OPEN, DebtStatus.OVERDUE]) },
  });

  invoice.totalPaid = totalPaid;
  invoice.status =
    openDebts === 0 && totalPaid >= Number(invoice.amountDue) - 0.001
      ? InvoiceStatus.PAID
      : totalPaid > 0
        ? InvoiceStatus.PARTIAL_DEBT
        : InvoiceStatus.DEBT;
  await manager.save(invoice);
}
