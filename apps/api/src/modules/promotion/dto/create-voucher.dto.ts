import { IsString, IsNumber, IsOptional, IsUUID, IsDateString, Min } from 'class-validator';

export class CreateVoucherDto {
  @IsString() code: string;
  @IsNumber() @Min(0) faceValue: number;
  @IsOptional() @IsUUID() customerId?: string;
  @IsDateString() validFrom: string;
  @IsDateString() validTo: string;
}
