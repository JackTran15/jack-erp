import { ApiProperty } from '@nestjs/swagger';

export class InTransitRowDto {
  @ApiProperty() id: string;
  @ApiProperty() amount: string;
  @ApiProperty() fromBranchId: string;
  @ApiProperty({ required: false, nullable: true }) fromBranchName?: string | null;
  @ApiProperty() toBranchId: string;
  @ApiProperty({ required: false, nullable: true }) toBranchName?: string | null;
  @ApiProperty({ required: false, nullable: true }) fromAccountName?: string | null;
  @ApiProperty({ required: false, nullable: true }) toAccountName?: string | null;
  @ApiProperty() initiatedAt: string;
  @ApiProperty() initiatedBy: string;
  @ApiProperty() daysInTransit: number;
  @ApiProperty() isOverdue: boolean;
}

export class InTransitReportDto {
  @ApiProperty() total: string;
  @ApiProperty() staleDays: number;
  @ApiProperty({ type: [InTransitRowDto] }) data: InTransitRowDto[];
}

export class AccountBalanceDto {
  @ApiProperty() accountId: string;
  @ApiProperty() name: string;
  @ApiProperty() type: string;
  @ApiProperty() balance: string;
}

export class BranchBalanceDto {
  @ApiProperty() branchId: string;
  @ApiProperty({ required: false, nullable: true }) branchName?: string | null;
  @ApiProperty({ type: [AccountBalanceDto] }) accounts: AccountBalanceDto[];
  @ApiProperty() branchTotal: string;
}

export class OrgBalanceDashboardDto {
  @ApiProperty({ type: [BranchBalanceDto] }) branches: BranchBalanceDto[];
  @ApiProperty() accountsTotal: string;
  @ApiProperty() inTransitTotal: string;
  /** R5 — invariant across create/confirm: Σ(deposit_accounts.balance) + Σ(in-transit). */
  @ApiProperty() grandTotal: string;
}
