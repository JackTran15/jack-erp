import {
  IsString,
  IsOptional,
  IsUUID,
  IsNumber,
  Min,
} from 'class-validator';

export class OpenSessionDto {
  @IsOptional()
  @IsUUID()
  terminalId?: string;

  @IsUUID()
  branchId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingCashAmount: number;
}

export class StartSalesDto {
  @IsUUID()
  sessionId: string;
}
