import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/**
 * Query của `GET /mobile/inventory/storages`.
 *
 * MỘT tham số, BẮT BUỘC. Kho thuộc về đúng một cửa hàng, và màn Sửa dòng hàng
 * luôn biết cửa hàng đang lập phiếu — một danh sách kho không gắn cửa hàng là
 * danh sách không màn nào dùng được.
 */
export class MobileInventoryStorageListQueryDto {
  @ApiProperty({ format: 'uuid', description: 'Cửa hàng — `branches.id`' })
  @IsUUID()
  branchId!: string;
}

/**
 * Query của `GET /mobile/inventory/locations`.
 *
 * MỘT tham số, BẮT BUỘC: app luôn chọn Kho trước rồi mới chọn Vị trí, nên một
 * danh sách bin không gắn kho cũng là danh sách không ai dùng.
 *
 * KHÔNG có `includeUnassigned`/`activeOnly` như `GET /inventory/locations` của
 * web. Màn chọn của app chỉ cần đúng MỘT cách cư xử — đúng cách web rơi vào khi
 * nó đi tìm bin dự phòng: lấy cả bin "Chưa xếp", bỏ bin và kho đã ngừng hoạt
 * động. Phơi hai cờ boolean qua query string là ba hình dạng response cho một
 * màn hình, cộng chuyện phải parse chuỗi `'false'` thành boolean.
 */
export class MobileInventoryLocationListQueryDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Kho — `storages.id`, lấy từ `GET /mobile/inventory/storages`',
  })
  @IsUUID()
  storageId!: string;
}
