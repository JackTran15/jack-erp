import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { MobileItemListQueryDto } from './mobile-item-list.query.dto';

/** Mức mà một dòng của danh mục bán hàng đại diện cho. */
export enum MobileSalesItemViewBy {
  /** Một dòng = một BIẾN THỂ (`items.id`) — bán được ngay. */
  ITEM = 'item',
  /** Một dòng = một MẪU MÃ (`products.id`) — phải chọn biến thể mới bán được. */
  MODEL = 'model',
}

/**
 * Query của `GET /mobile/sales-items`.
 *
 * Tách khỏi `MobileItemListQueryDto` — mà nó vẫn kế thừa — đúng vào lúc doc của
 * `MobileSalesItemController` đã hẹn trước: *"ngày nào màn bán hàng cần thêm bộ
 * lọc riêng thì mới tách"*. Hai tham số dưới đây là ngày đó; ba tham số phân
 * trang/tìm kiếm vẫn dùng chung, nên chúng không có cơ hội phân kỳ.
 */
export class MobileSalesItemListQueryDto extends MobileItemListQueryDto {
  /**
   * Xem danh mục ở mức nào — hai nút *"Mẫu mã"* / *"Hàng hoá"* của panel lọc.
   *
   * Quyết định này đổi Ý NGHĨA của `id` trong response, nên nó phải là một tham
   * số của request chứ không phải một phép gộp ở client: ở `model`, `id` là
   * `products.id` và **không đặt được vào dòng đơn hàng**. `type` trong mỗi
   * dòng trả về nói lại điều đó để client không phải nhớ mình đã hỏi gì.
   *
   * **Mặc định là `model`** (Loc chốt 2026-09-10): người bán tìm hàng theo MẪU
   * MÃ — một dòng "Giày Gelli" thay vì mười bốn dòng chỉ khác nhau ở đuôi mã.
   * Trên dữ liệu dev, chênh lệch là 2.539 dòng so với 20.997. Mức `item` vẫn
   * giữ, nhưng nay là lựa chọn phải bấm chứ không phải thứ nhận được khi không
   * nói gì.
   */
  @ApiPropertyOptional({
    enum: MobileSalesItemViewBy,
    default: MobileSalesItemViewBy.MODEL,
  })
  @IsOptional()
  @IsEnum(MobileSalesItemViewBy)
  viewBy?: MobileSalesItemViewBy = MobileSalesItemViewBy.MODEL;

  /**
   * Chỉ giữ hàng **còn tồn**: tổng tồn có dấu > 0 tại `actor.branchId`.
   *
   * **Chi nhánh nào, chính xác:** `ActorContext` giải ra
   * `JWT.branchId ?? X-Branch-Id ?? JWT.branchIds[0]` — comment tại chỗ ghi
   * *"always: jwt > header > jwtList"*. `/mobile/auth/login` CÓ phát claim
   * `branchId`, nên với client mobile thì **JWT thắng header**: đổi cửa hàng
   * trong app KHÔNG đổi chi nhánh mà bộ lọc này đọc. Đã đo trên dev
   * (2026-09-10): bốn `X-Branch-Id` khác nhau cho ra cùng một tập 103 mặt
   * hàng. Muốn bộ lọc đi theo cửa hàng đang chọn thì phải sửa MỘT trong hai —
   * bỏ claim `branchId` khỏi token mobile, hoặc cho route này đọc
   * `resolveExplicitBranchId` — và cả hai đều là quyết định cấp nền tảng.
   *
   * Là PHẦN BÙ CHẶT của `outOfStock` bên `POST /v2/inventory-items/search`
   * (`<= 0`) — cùng phép cộng, cùng phạm vi chi nhánh, ngưỡng đối nhau — nên một
   * mặt hàng không bao giờ vừa "còn hàng" ở app vừa "hết hàng" ở web. Nhãn trên
   * app là *"Hàng hoá còn hàng (SL > 0)"*, và dấu `>` đó là hợp đồng.
   *
   * Tổng có DẤU: một mặt hàng có -1 ở kho này và +1 ở kho kia tổng bằng 0 và
   * đọc là hết hàng. Mặt hàng chưa từng có dòng `stock_balances` nào cũng vậy.
   */
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  inStockOnly?: boolean = false;

  /**
   * Chỉ giữ hàng thuộc MỘT nhóm hàng hoá (`items.category_id`).
   *
   * Nhóm lấy từ `GET /mobile/item-categories/tree` — cùng cây mà backoffice
   * dùng. Bỏ trống = *Tất cả*.
   *
   * **Lọc theo ĐÚNG nhóm đó, không gồm nhóm con.** Cây chỉ có hai tầng trong dữ
   * liệu thật (`GIÀY DÉP` → `Giày nam`…), và mặt hàng luôn gắn vào nhóm LÁ, nên
   * "gồm cả con" chỉ đổi kết quả khi người dùng chọn một nhóm cha — thứ mà ảnh
   * MISA cho thấy là một TIÊU ĐỀ, không chạm được. Ngày cây sâu hơn thì đây là
   * chỗ phải mở rộng, không phải ở client.
   */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;
}
