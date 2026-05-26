import { IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class DenominationDto {
  /** Note/coin face value, e.g. 500000. */
  @IsNumber()
  @Min(1)
  denom: number;

  /** Quantity of this denomination counted. */
  @IsInt()
  @Min(0)
  count: number;

  /** Per-line note ("Diễn giải") for this denomination row. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
