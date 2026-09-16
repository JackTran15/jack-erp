import { ApiProperty } from '@nestjs/swagger';

/**
 * Một cửa hàng (chi nhánh) mà người dùng được phép làm việc trên đó.
 *
 * SÁU trường. Màn bộ lọc của app chỉ vẽ đúng [name] — nhưng [code] và [isMain]
 * đi kèm vì chúng rẻ và là thứ một màn quản lý chi nhánh sẽ cần ngay; cả hai
 * cũng là tiêu chí sắp xếp tự nhiên khi tổ chức có nhiều chi nhánh.
 *
 * **[address] và [phone] mở ngày 2026-09-14** theo yêu cầu của Loc. Bản trước
 * khai thẳng rằng hai trường này bị giữ lại vì *"một danh sách chọn không phải
 * chỗ để phát tán thông tin liên hệ nội bộ"* — lập luận đó đã hết đúng khi có
 * một nơi dùng cụ thể: **PHIẾU THU** của app in đầu phiếu ba dòng tên / địa chỉ
 * / điện thoại của cửa hàng, đúng như bản POS, và tờ phiếu đó đưa tận tay khách
 * hàng. Hai trường này KHÔNG phải thông tin nội bộ — chúng là địa chỉ cửa hàng
 * mà khách đang đứng.
 *
 * `email` thì VẪN giữ lại: không màn nào của app bày nó, và một địa chỉ thư nội
 * bộ thì đúng là thứ không nên rò ra qua một danh sách chọn. Cùng lập luận đã
 * bỏ `maxDebt` khỏi `MobileSupplierResponseDto`.
 *
 * `parentBranchId`, `organizationId` và các dấu thời gian của `BranchEntity`
 * cũng ở nguyên bên trong.
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

  @ApiProperty({
    nullable: true,
    description:
      'Địa chỉ cửa hàng — in ở đầu PHIẾU THU. NULL là hợp lệ: cột nullable, và ' +
      'dữ liệu thật đang có chi nhánh trống địa chỉ. Tờ phiếu tự bỏ dòng khi thiếu.',
  })
  address!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Điện thoại cửa hàng — in ở đầu PHIẾU THU. NULL là hợp lệ.',
  })
  phone!: string | null;
}
