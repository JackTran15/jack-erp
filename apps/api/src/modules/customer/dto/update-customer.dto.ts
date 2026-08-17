import { PartialType, OmitType } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsInt, Min } from 'class-validator';
import { CustomerStatus } from '@erp/shared-interfaces';
import { CreateCustomerDto } from './create-customer.dto';

// Membership card is omitted on purpose: create() handles the inline card in its
// own transaction, update() (inherited from BaseCrudService) has no such branch.
// Card edits go through PATCH /customers/:id/membership-card.
export class UpdateCustomerDto extends PartialType(
  OmitType(CreateCustomerDto, ['membershipCard'] as const),
) {
  @IsOptional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  version?: number;
}
