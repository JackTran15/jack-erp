import { IsString, MinLength, MaxLength } from 'class-validator';

export class ReverseJournalDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason: string;
}
