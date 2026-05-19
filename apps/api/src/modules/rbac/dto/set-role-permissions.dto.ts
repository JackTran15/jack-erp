import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class SetRolePermissionsDto {
  /** Replaces the entire permission set for the role with this list. */
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionKeys: string[];
}
