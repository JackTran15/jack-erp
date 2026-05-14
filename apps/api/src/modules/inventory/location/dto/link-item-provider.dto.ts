import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class LinkItemProviderDto {
  @IsUUID()
  providerId: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
