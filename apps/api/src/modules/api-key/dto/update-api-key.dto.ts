import {
  IsString,
  IsArray,
  IsOptional,
  MinLength,
  MaxLength,
  ArrayMinSize,
  Matches,
} from 'class-validator';

const IPV4_OR_CIDR = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;

export class UpdateApiKeyDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  /** Omitted/undefined = not restricted to a subset of the organization's branches. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  branchIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @Matches(IPV4_OR_CIDR, { each: true })
  ipWhitelist?: string[];
}
