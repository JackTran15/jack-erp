import { IsString, IsEnum, IsObject, IsDateString, IsArray, IsOptional, IsUUID } from 'class-validator';
import { PromotionType } from '../promotion.entity';

export class CreatePromotionDto {
  @IsString() name: string;
  @IsEnum(PromotionType) type: PromotionType;
  @IsObject() conditions: Record<string, any>;
  @IsObject() benefits: Record<string, any>;
  @IsDateString() validFrom: string;
  @IsDateString() validTo: string;
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) applicableBranchIds?: string[];
}
