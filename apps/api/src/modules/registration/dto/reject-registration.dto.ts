import { IsString, MinLength, MaxLength } from 'class-validator';

export class RejectRegistrationDto {
  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  reason: string;
}
