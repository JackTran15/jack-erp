import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class LinesStatusQueryDto {
  @ApiProperty({
    type: [String],
    description:
      'Line ids to check the current status of — used by the FE to poll a partial transfer ("Xử lý chuyển kho") until it actually lands instead of trusting the 202 response alone.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',') : value))
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  ids: string[];
}
