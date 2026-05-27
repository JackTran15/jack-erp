import { ApiProperty } from '@nestjs/swagger';
import { MembershipTier } from '../membership-card.entity';

export class CustomerPurchasesSummaryDto {
  @ApiProperty({ description: 'Total amount of finalised sale invoices (sum of amountDue)' })
  totalSpending: number;

  @ApiProperty({ description: 'Number of finalised sale invoices' })
  invoiceCount: number;
}

export class CustomerDebtSummaryDto {
  @ApiProperty({ description: 'Total remaining balance across open/overdue debts' })
  totalOutstanding: number;

  @ApiProperty({ description: 'Number of outstanding debt documents' })
  documentCount: number;
}

export class CustomerMembershipSummaryDto {
  @ApiProperty()
  cardNumber: string;

  @ApiProperty({ enum: MembershipTier })
  tier: MembershipTier;

  @ApiProperty({ description: 'Current point balance on the card' })
  points: number;

  @ApiProperty({ description: 'Total points ever redeemed (sum of |delta| of REDEEM entries)' })
  pointsUsed: number;
}

export class CustomerSummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  customerId: string;

  @ApiProperty({ type: CustomerPurchasesSummaryDto })
  purchases: CustomerPurchasesSummaryDto;

  @ApiProperty({ type: CustomerDebtSummaryDto })
  debt: CustomerDebtSummaryDto;

  @ApiProperty({
    type: CustomerMembershipSummaryDto,
    nullable: true,
    description: 'Membership card summary, or null when the customer has no card',
  })
  membership: CustomerMembershipSummaryDto | null;
}
