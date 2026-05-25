import { IsEnum, IsOptional, IsUUID } from 'class-validator';

/**
 * Mirrors the POS `invoice_debts.status` values (open/paid/overdue). Declared
 * locally so the cash-vouchers module stays decoupled from the POS module.
 */
export enum CustomerDebtStatus {
  OPEN = 'open',
  PAID = 'paid',
  OVERDUE = 'overdue',
}

export class QueryCustomerDebtsDto {
  @IsUUID()
  customerId: string;

  /** Defaults to OPEN (outstanding debts) when omitted. */
  @IsOptional()
  @IsEnum(CustomerDebtStatus)
  status?: CustomerDebtStatus;
}
