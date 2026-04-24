import { IsUUID } from 'class-validator';

export class AssignStorageManagerDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  storageId: string;
}

export class UnassignStorageManagerDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  storageId: string;
}
