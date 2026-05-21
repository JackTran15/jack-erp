import { IsInt, IsNumber, Min } from 'class-validator';

export class DenominationDto {
  /** Note/coin face value, e.g. 500000. */
  @IsNumber()
  @Min(1)
  denom: number;

  /** Quantity of this denomination counted. */
  @IsInt()
  @Min(0)
  count: number;
}
