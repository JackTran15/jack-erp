import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateInvoiceItemDto } from './create-invoice.dto';
import { ReturnInvoiceLineDto } from './create-return-invoice.dto';

export class CreateExchangeInvoiceDto {
  @IsString()
  sessionId: string;

  @IsUUID()
  originalInvoiceId: string;

  @IsString()
  reason: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  /** Items being returned (direction=IN). Must reference original SALE lines. */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReturnInvoiceLineDto)
  returnLines: ReturnInvoiceLineDto[];

  /** New items being purchased (direction=OUT). Same shape as a normal SALE. */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceItemDto)
  newLines: CreateInvoiceItemDto[];
}
