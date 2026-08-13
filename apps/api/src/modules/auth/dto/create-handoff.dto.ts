import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class CreateHandoffDto {
  @ApiPropertyOptional({
    description:
      "Branch the receiving app should open on; must be one of the user's " +
      'assigned branches. Defaults to the caller\'s currently active branch.',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}
