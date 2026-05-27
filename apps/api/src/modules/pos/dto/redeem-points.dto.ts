import { IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RedeemPointsDto {
  @ApiProperty({ minimum: 1, description: 'Number of loyalty points to redeem against this invoice' })
  @IsInt()
  @Min(1)
  points: number;
}
