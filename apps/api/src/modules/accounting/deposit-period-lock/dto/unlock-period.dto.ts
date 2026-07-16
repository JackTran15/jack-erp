import { IsString, MaxLength, MinLength } from 'class-validator';

/** Unlock a period (BR-PERM-03, Kế toán trưởng only) — reason is mandatory. */
export class UnlockPeriodDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason: string;
}
