import { IsString, IsNotEmpty, IsInt, IsOptional, Min } from 'class-validator';

export class CreateAttributeOptionDto {
  @IsString()
  @IsNotEmpty()
  valueLabel: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @IsString()
  @IsOptional()
  codeSuffix?: string;
}
