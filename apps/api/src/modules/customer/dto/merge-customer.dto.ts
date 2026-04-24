import { IsUUID } from 'class-validator';

export class MergeCustomerDto {
  @IsUUID()
  targetCustomerId: string;
}
