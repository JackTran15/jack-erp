import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class SetUserBranchesDto {
  /** Replaces the entire branch assignment set for the user with this list. */
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  branchIds: string[];
}
