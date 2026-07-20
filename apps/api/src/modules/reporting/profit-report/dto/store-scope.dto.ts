import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsUUID } from 'class-validator';

/** Multi-store scope for chain consolidation. */
export class StoreScopeDto {
  /** "all" = every branch the actor may read; "group" = the listed storeIds. */
  @ApiProperty({ enum: ['all', 'group'] })
  @IsIn(['all', 'group'])
  scope: 'all' | 'group';

  /** Selected branch ids (used when scope = "group"; ignored for "all"). */
  @IsArray()
  @IsUUID('4', { each: true })
  storeIds: string[];
}
