import { ApiProperty } from '@nestjs/swagger';

/**
 * Một cửa hàng (chi nhánh) mà người dùng được phép làm việc trên đó.
 *
 * BỐN trường. Màn bộ lọc của app chỉ vẽ đúng [name] — nhưng [code] và [isMain]
 * đi kèm vì chúng rẻ và là thứ một màn quản lý chi nhánh sẽ cần ngay; cả hai
 * cũng là tiêu chí sắp xếp tự nhiên khi tổ chức có nhiều chi nhánh.
 *
 * Cố ý KHÔNG trả `address`, `phone`, `email`, `parentBranchId`,
 * `organizationId` và các dấu thời gian của `BranchEntity`: app không hiển thị
 * chúng, và một danh sách chọn không phải chỗ để phát tán thông tin liên hệ
 * nội bộ. Cùng lập luận đã bỏ `maxDebt` khỏi `MobileSupplierResponseDto`.
 */
export class MobileBranchResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Tên cửa hàng — thứ DUY NHẤT màn bộ lọc hiển thị' })
  name!: string;

  @ApiProperty({
    nullable: true,
    description: 'Mã cửa hàng. NULL là hợp lệ — backend không bắt buộc trường này.',
  })
  code!: string | null;

  @ApiProperty({
    description:
      'Cửa hàng chính của tổ chức. Trường của entity tên là `isMainBranch`; ' +
      'rút gọn ở đây vì trong một danh sách chi nhánh thì chữ "Branch" là thừa.',
  })
  isMain!: boolean;
}
