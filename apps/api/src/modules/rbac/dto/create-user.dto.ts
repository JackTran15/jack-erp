import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  /** Temporary password set by the administrator; user is expected to change it on first login. */
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  temporaryPassword: string;

  /** Optional initial roles to assign on creation. */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  roleIds?: string[];

  /** Optional initial branch assignments. */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  branchIds?: string[];
}
