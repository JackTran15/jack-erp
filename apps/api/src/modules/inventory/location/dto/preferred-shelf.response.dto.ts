import { ApiProperty } from '@nestjs/swagger';

export class PreferredShelfResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}
