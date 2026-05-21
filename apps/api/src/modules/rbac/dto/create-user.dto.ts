import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { EmployeeProfileDto } from "./employee-profile.dto";

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

  /** Whether the user can sign in. Defaults to true when omitted. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Optional initial roles to assign on creation. */
  @IsOptional()
  @IsArray()
  @IsUUID("all", { each: true })
  roleIds?: string[];

  /** Optional initial branch assignments. */
  @IsOptional()
  @IsArray()
  @IsUUID("all", { each: true })
  branchIds?: string[];

  /** Optional HR profile persisted alongside the user account. */
  @IsOptional()
  @ValidateNested()
  @Type(() => EmployeeProfileDto)
  profile?: EmployeeProfileDto;
}
