import { IsString, IsNotEmpty, IsInt, IsOptional, Min } from 'class-validator';

export class CreateAttributeDefinitionDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}
