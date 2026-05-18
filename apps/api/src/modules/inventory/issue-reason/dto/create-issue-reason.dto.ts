import { IsBoolean, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IssueReasonPurpose } from '@erp/shared-interfaces';

export class CreateIssueReasonDto {
  @ApiPropertyOptional({
    description: 'Mã lý do (slug). Tự sinh từ name nếu không cung cấp.',
    example: 'HONG_BAO_QUAN',
  })
  @IsOptional()
  @IsString()
  @Length(1, 64)
  @Matches(/^[A-Z0-9_]+$/, { message: 'code chỉ chứa A-Z, 0-9, _' })
  code?: string;

  @ApiProperty({ description: 'Tên lý do', example: 'Hàng hỏng do bảo quản chưa tốt' })
  @IsString()
  @Length(1, 255)
  name: string;

  @ApiProperty({ enum: IssueReasonPurpose, description: 'Nhóm lý do (OTHER hoặc DISPOSAL)' })
  @IsEnum(IssueReasonPurpose)
  purpose: IssueReasonPurpose;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
