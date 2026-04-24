import { IsUUID } from 'class-validator';

export class UnassignSalesPersonDto {
  @IsUUID()
  userId: string;
}
