import {
  IsString,
  IsArray,
  IsOptional,
  MinLength,
  MaxLength,
  ArrayMinSize,
  Matches,
} from 'class-validator';

// IPv4 address, optionally with a /0-32 CIDR suffix (A-04 — IPv6 out of scope).
const IPV4_OR_CIDR = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;

export class CreateApiKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  roles: string[];

  /** Omitted/undefined = not restricted to a subset of the organization's branches. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  branchIds?: string[];

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Matches(IPV4_OR_CIDR, { each: true })
  ipWhitelist: string[];
}
