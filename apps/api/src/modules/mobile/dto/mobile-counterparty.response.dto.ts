import { ApiProperty } from '@nestjs/swagger';

/**
 * Một đối tượng của chứng từ kho: nhà cung cấp hoặc nhân viên.
 *
 * [kind] PHẢI đi ra ngoài dù màn hình không vẽ nó: payload lúc lưu cần cả
 * `counterpartyKind` lẫn `counterpartyId`, và backend route hai loại đi hai
 * đường khác nhau (nhà cung cấp ghi vào cả `provider_id`, nhân viên thì không).
 * App không suy ra được loại từ một mình `id`.
 *
 * KHÔNG có `customer`: phiếu kho từ chối loại đó ở tầng dưới.
 */
export class MobileCounterpartyResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    enum: ['supplier', 'employee'],
    description: 'Đi thẳng vào `counterpartyKind` của payload lúc lưu phiếu',
  })
  kind!: 'supplier' | 'employee';

  @ApiProperty({ nullable: true, description: 'Mã. NULL là hợp lệ — nhân viên có thể chưa có mã.' })
  code!: string | null;

  @ApiProperty()
  name!: string;
}

export class MobileCounterpartyPageDto {
  @ApiProperty({ type: [MobileCounterpartyResponseDto] })
  data!: MobileCounterpartyResponseDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
