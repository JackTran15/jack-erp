import { IsEnum, IsOptional, IsString } from 'class-validator';
import { DocumentType } from '@erp/shared-interfaces';

export class GenerateDocumentNumberDto {
  @IsEnum(DocumentType)
  documentType: DocumentType;

  @IsOptional()
  @IsString()
  branchId?: string;
}
