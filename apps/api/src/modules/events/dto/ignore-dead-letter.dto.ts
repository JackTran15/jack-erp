import { IsOptional, IsString, MaxLength } from 'class-validator';

export class IgnoreDeadLetterDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}
