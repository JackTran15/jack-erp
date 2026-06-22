import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export enum CounterpartyKind {
  SUPPLIER = 'supplier',
  CUSTOMER = 'customer',
  EMPLOYEE = 'employee',
  ALL = 'all',
}

export class SearchCounterpartiesDto {
  @ApiPropertyOptional({ enum: CounterpartyKind, default: CounterpartyKind.ALL })
  @IsOptional()
  @IsEnum(CounterpartyKind)
  type: CounterpartyKind = CounterpartyKind.ALL;

  @ApiPropertyOptional({ description: 'Match on name or code' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class CounterpartyOptionDto {
  @ApiProperty({ enum: ['supplier', 'customer', 'employee'] })
  kind: 'supplier' | 'customer' | 'employee';

  @ApiProperty()
  id: string;

  @ApiProperty({ nullable: true })
  code: string | null;

  @ApiProperty()
  name: string;

  @ApiProperty({ nullable: true })
  phone: string | null;

  @ApiProperty({ nullable: true })
  address: string | null;
}

export class SearchCounterpartiesResponseDto {
  @ApiProperty({ type: [CounterpartyOptionDto] })
  data: CounterpartyOptionDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;
}
