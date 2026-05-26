import { IsEnum, IsOptional, IsUUID } from 'class-validator';

/**
 * Mirrors the `supplier_debts.status` values (open/paid/overdue). Declared
 * locally so the cash-vouchers module stays decoupled from the inventory module.
 */
export enum SupplierDebtStatusFilter {
  OPEN = 'open',
  PAID = 'paid',
  OVERDUE = 'overdue',
}

export class QuerySupplierDebtsDto {
  @IsUUID()
  supplierId: string;

  /** Defaults to OPEN (outstanding debts) when omitted. */
  @IsOptional()
  @IsEnum(SupplierDebtStatusFilter)
  status?: SupplierDebtStatusFilter;
}
