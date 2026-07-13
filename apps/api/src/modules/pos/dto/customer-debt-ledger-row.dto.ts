import { ApiProperty } from '@nestjs/swagger';
import { DebtDocumentType, DebtStatus } from '../entities/invoice-debt.entity';

/** Category of a customer debt-ledger row (debt-raising documents + collections). */
export type CustomerDebtLedgerDocumentType =
  | DebtDocumentType
  | 'collect_debt_cash'
  | 'collect_debt_bank';

/**
 * One row of a customer's debt ledger. Debt-raising documents (credit invoices,
 * return adjustments) come from `invoice_debts`; collections (Phiếu thu) come
 * from `debt_payments`. Rows are ordered oldest-first with a running balance.
 */
export class CustomerDebtLedgerRowDto {
  @ApiProperty({
    description: 'Row id — the debt id for debt rows, the payment id for collections',
  })
  id: string;

  @ApiProperty({
    enum: ['debt', 'collection'],
    description: 'Whether this row raises debt or collects it',
  })
  kind: 'debt' | 'collection';

  @ApiProperty({ description: 'Source invoice id, for drill-through to the receipt' })
  invoiceId: string;

  @ApiProperty({
    description:
      'Displayed document number — the invoice code, or the Phiếu thu number for collections',
  })
  referenceCode: string;

  @ApiProperty({
    enum: [
      'credit_invoice',
      'payment_receipt',
      'adjustment',
      'collect_debt_cash',
      'collect_debt_bank',
    ],
    description: 'Category of the ledger document',
  })
  documentType: CustomerDebtLedgerDocumentType;

  @ApiProperty({
    description: 'Signed debt delta — positive raises debt, negative collects it',
  })
  amount: number;

  @ApiProperty({ description: 'Running customer debt balance after this row' })
  runningBalance: number;

  @ApiProperty({ description: 'Ledger date (YYYY-MM-DD)' })
  issuedAt: string;

  @ApiProperty({
    description:
      'Row creation timestamp (ISO) — shown as the document date and used for ordering',
  })
  createdAt: string;

  @ApiProperty({ required: false, nullable: true, description: 'Branch scope of the document' })
  branchId?: string | null;

  @ApiProperty({ required: false, nullable: true, description: 'Display name of the branch' })
  branchName?: string | null;

  @ApiProperty({
    required: false,
    enum: DebtStatus,
    description: 'Debt collection status (debt rows only)',
  })
  status?: DebtStatus;
}
