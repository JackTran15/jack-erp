import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { escapeLikeTerm } from '../../../common/utils/like-escape.util';
import { ItemEntity } from '../../inventory/location/item.entity';
import {
  MobileItemPageDto,
  MobileItemResponseDto,
} from '../dto/mobile-item.response.dto';

/**
 * Hàng hoá để thêm vào phiếu kho — **danh sách BIẾN THỂ**.
 *
 * Vì sao không dùng lại `/mobile/products`: nó gộp biến thể theo mẫu mã, nên
 * `id` của nó là hỗn hợp `products.id` / `items.id` tuỳ dòng, và response cố ý
 * bỏ `unit` lẫn `purchasePrice`. Cả ba thứ dòng hàng cần đều thiếu.
 *
 * Đọc thẳng repository chứ không qua `QueryBus` như `MobileProductService`:
 * bên kia phải gộp ba bảng bằng SQL thô, còn ở đây là một bảng và một phép lọc.
 *
 * Hàng hoá scope theo TỔ CHỨC, không theo chi nhánh — danh mục là chung, chỉ
 * tồn kho mới theo kho. Đó là lý do service này không nhận `branchId`.
 */
@Injectable()
export class MobileItemService {
  constructor(
    @InjectRepository(ItemEntity)
    private readonly items: Repository<ItemEntity>,
  ) {}

  async list(
    query: { page: number; limit: number; search?: string },
    actor: ActorContext,
  ): Promise<MobileItemPageDto> {
    const { page, limit, search } = query;

    const qb = this.items
      .createQueryBuilder('item')
      .where('item.organizationId = :organizationId', {
        organizationId: actor.organizationId,
      })
      // Màn này là màn GIAO DỊCH, không phải màn quản lý danh mục: hàng đã
      // ngừng kinh doanh không được xuất hiện để lập phiếu mới.
      .andWhere('item.isActive = true');

    if (search?.trim()) {
      qb.andWhere(
        '(item.code ILIKE :search OR item.name ILIKE :search OR item.variantLabel ILIKE :search)',
        { search: `%${escapeLikeTerm(search.trim())}%` },
      );
    }

    // `id` làm khoá phụ: `name` trùng nhau rất nhiều (sáu biến thể của một mẫu
    // mã chỉ khác nhau ở nhãn), và `LIMIT/OFFSET` trên một thứ tự không duy
    // nhất thì Postgres được phép trả khác nhau giữa hai lượt — biểu hiện ra là
    // cuộn tới trang 2 thấy lặp lại một dòng của trang 1.
    qb.orderBy('lower(item.name)', 'ASC')
      .addOrderBy('item.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    const [rows, total] = await qb.getManyAndCount();

    return { data: rows.map(toMobileItem), total, page, limit };
  }
}

/**
 * Chép TƯỜNG MINH năm trường — cùng lý do ở mọi mapper khác của module này.
 * `ItemEntity` có ~35 cột, và spread rồi xoá bớt sẽ lặng lẽ rò mọi cột thêm
 * sau này.
 */
function toMobileItem(row: ItemEntity): MobileItemResponseDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    variantLabel: row.variantLabel ?? null,
    unit: row.unit,
    // Cột `decimal` của Postgres về Node dưới dạng chuỗi; ép một lần ở đây thay
    // vì để client tự parse.
    purchasePrice: Number(row.purchasePrice) || 0,
  };
}
