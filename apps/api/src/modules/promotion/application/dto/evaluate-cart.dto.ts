import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsUUID,
  IsISO8601,
  IsInt,
  IsNumber,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EvaluateCartLineInputDto {
  @ApiProperty({ description: 'Client-supplied, echoed back in lineDiscounts so the client can map results without guessing by order' })
  @IsString()
  @IsNotEmpty()
  lineId: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  itemId: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiPropertyOptional({ description: 'Per-line discount the cashier already entered manually' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  manualLineDiscount?: number;
}

export class EvaluateCartDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Omit for a walk-in customer' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'ISO datetime; omitted = server current time' })
  @IsOptional()
  @IsISO8601()
  at?: string;

  /**
   * Dual meaning (ADR-03 in 03-logical-design.md, deliberately one field, not two):
   * 1. Turns on an `auto_apply=false` program — without this, it never runs.
   * 2. Makes a listed program win a contested resource ahead of `priority`
   *    (PromotionResolver.resolve) — including one that's `auto_apply=true`
   *    and currently winning. Ids for programs not eligible/not contesting
   *    anything are simply ignored.
   */
  @ApiPropertyOptional({ type: [String], description: 'Ids of auto_apply=false programs the cashier picked manually, and/or ids that should win a contested resource ahead of priority (ADR-03)' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedProgramIds?: string[];

  /**
   * ADR-07 (pos-promotion-apply/03-logical-design.md) — ids to keep out of
   * the race entirely, filtered out before `selectedProgramIds` is even
   * consulted. The inverse of `selectedProgramIds`: always "exclude", never
   * "add". Wins on conflict if an id is in both.
   */
  @ApiPropertyOptional({ type: [String], description: 'Ids of programs to exclude entirely, even if auto_apply=true (ADR-07) — wins over selectedProgramIds on conflict' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  excludedProgramIds?: string[];

  /**
   * Empty is valid on purpose: the POS promotion dialog previews the program
   * catalog (names, "chưa đủ điều kiện"/"có thể áp dụng" per row) before the
   * cashier has scanned anything, not just once the cart has lines.
   */
  @ApiProperty({ type: [EvaluateCartLineInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvaluateCartLineInputDto)
  lines: EvaluateCartLineInputDto[];
}
