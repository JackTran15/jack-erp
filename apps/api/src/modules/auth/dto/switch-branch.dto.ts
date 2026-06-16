import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class SwitchBranchDto {
  @ApiProperty({
    description: "Branch to activate; must be one of the user's assigned branches.",
    format: 'uuid',
  })
  @IsUUID()
  branchId: string;
}
