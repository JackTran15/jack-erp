import { IsInt, IsOptional, Min, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Org-wide POS defaults read by the POS app (e.g. to prefill checkout fields). */
export class PosSettingsDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Default credit days used to prefill the POS due-date modal; null when unset.',
    example: 30,
  })
  defaultCreditDays: number | null;
}

export class UpdatePosSettingsDto {
  @ApiProperty({
    type: Number,
    nullable: true,
    description: 'Default credit days; send null to clear.',
    example: 30,
  })
  @IsOptional()
  @ValidateIf((o) => o.defaultCreditDays !== null)
  @IsInt()
  @Min(0)
  defaultCreditDays?: number | null;
}
