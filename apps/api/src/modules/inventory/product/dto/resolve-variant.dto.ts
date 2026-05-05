import { IsObject, IsNotEmpty } from 'class-validator';

export class ResolveVariantDto {
  @IsObject()
  @IsNotEmpty()
  attributes: Record<string, string>;
}
