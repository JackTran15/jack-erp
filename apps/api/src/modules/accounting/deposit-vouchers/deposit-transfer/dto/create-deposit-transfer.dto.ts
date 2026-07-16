import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

/** Leg A (source) is always the caller's active branch — see ActorContext.branchId. */
export class CreateDepositTransferDto {
  @ApiProperty({ description: 'Destination branch (B)' })
  @IsUUID()
  toBranchId: string;

  @ApiProperty({ description: 'Destination deposit account (must belong to toBranchId)' })
  @IsUUID()
  toAccountId: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
