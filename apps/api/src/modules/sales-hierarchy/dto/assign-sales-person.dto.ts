import { IsUUID } from 'class-validator';

export class AssignSalesPersonDto {
  @IsUUID()
  userId: string;
}
