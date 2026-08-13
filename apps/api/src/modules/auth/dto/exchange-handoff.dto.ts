import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class ExchangeHandoffDto {
  @ApiProperty({
    description: 'Single-use code from POST /auth/handoff.',
    format: 'uuid',
  })
  @IsUUID()
  code: string;
}
