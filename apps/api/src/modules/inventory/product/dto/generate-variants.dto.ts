import { IsOptional, IsBoolean } from 'class-validator';

export class GenerateVariantsDto {
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}
