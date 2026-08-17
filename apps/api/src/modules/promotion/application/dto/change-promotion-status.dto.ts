import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PromotionStatus } from '@erp/shared-interfaces';

export class ChangePromotionStatusV2Dto {
  @ApiProperty({ enum: PromotionStatus })
  @IsEnum(PromotionStatus)
  status: PromotionStatus;
}
