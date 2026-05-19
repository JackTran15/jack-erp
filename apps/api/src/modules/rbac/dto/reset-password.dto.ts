import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  /** New temporary password the administrator wants to set for the user. */
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newTemporaryPassword: string;
}
