import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  EmployeeAccessMode,
  EmployeeAddressType,
  EmployeeGender,
  EmploymentStatus,
  MaritalStatus,
  Weekday,
} from '@erp/shared-interfaces';

const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class EmployeeAddressDto {
  @ApiProperty({ enum: EmployeeAddressType })
  @IsEnum(EmployeeAddressType)
  type: EmployeeAddressType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  province?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ward?: string;
}

export class EmployeeEmergencyContactDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  relationship?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  mobile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  homePhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
}

export class EmployeeAccessScheduleDayDto {
  @ApiProperty({ enum: Weekday })
  @IsEnum(Weekday)
  weekday: Weekday;

  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ example: '08:00' })
  @Matches(TIME_HHMM, { message: 'startTime must be in HH:mm format' })
  startTime: string;

  @ApiProperty({ example: '17:30' })
  @Matches(TIME_HHMM, { message: 'endTime must be in HH:mm format' })
  endTime: string;
}

export class EmployeeProfileDto {
  @ApiProperty({ description: 'Employee code, unique per organization (e.g. NV000002)' })
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  mobile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  homePhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  idCardNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idCardIssuePlace?: string;

  @ApiPropertyOptional({ description: 'ISO date YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  idCardIssueDate?: string;

  @ApiPropertyOptional({ description: 'ISO date YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ enum: EmployeeGender })
  @IsOptional()
  @IsEnum(EmployeeGender)
  gender?: EmployeeGender;

  @ApiPropertyOptional({ enum: MaritalStatus })
  @IsOptional()
  @IsEnum(MaritalStatus)
  maritalStatus?: MaritalStatus;

  @ApiPropertyOptional({ enum: EmploymentStatus })
  @IsOptional()
  @IsEnum(EmploymentStatus)
  employmentStatus?: EmploymentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  photoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  jobPositionId?: string;

  @ApiPropertyOptional({ description: 'ISO date YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  probationDate?: string;

  @ApiPropertyOptional({ description: 'ISO date YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  officialDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  salary?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  deposit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  originalDocumentsNote?: string;

  @ApiPropertyOptional({ enum: EmployeeAccessMode })
  @IsOptional()
  @IsEnum(EmployeeAccessMode)
  accessMode?: EmployeeAccessMode;

  @ApiPropertyOptional({ type: [EmployeeAddressDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeAddressDto)
  addresses?: EmployeeAddressDto[];

  @ApiPropertyOptional({ type: EmployeeEmergencyContactDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => EmployeeEmergencyContactDto)
  emergencyContact?: EmployeeEmergencyContactDto;

  @ApiPropertyOptional({ type: [EmployeeAccessScheduleDayDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EmployeeAccessScheduleDayDto)
  accessSchedule?: EmployeeAccessScheduleDayDto[];
}
