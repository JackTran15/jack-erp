import {
  IsString,
  IsArray,
  IsOptional,
  IsUUID,
  MinLength,
  MaxLength,
  ArrayMinSize,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

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

  /**
   * Sales channel this key speaks for. Omitted = the key belongs to no channel
   * (internal/other integration); only the partner order path requires it.
   * Must be declared here even though the generic CRUD controller bypasses
   * these DTOs — `ValidationPipe` runs with `forbidNonWhitelisted`.
   */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  salesChannelId?: string;
}
