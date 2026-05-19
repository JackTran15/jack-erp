import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class SetUserRolesDto {
  /** Replaces the entire role set for the user with this list. */
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  roleIds: string[];
}
