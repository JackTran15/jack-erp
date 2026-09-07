import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  CounterpartyKind,
  CounterpartyOptionDto,
  SearchCounterpartiesResponseDto,
} from '../../counterparty/dto/search-counterparties.dto';
import { SearchCounterpartiesQuery } from '../../counterparty/queries/search-counterparties.query';
import { MOBILE_DOC_COUNTERPARTY_KINDS } from '../dto/mobile-counterparty-list.query.dto';
import {
  MobileCounterpartyPageDto,
  MobileCounterpartyResponseDto,
} from '../dto/mobile-counterparty.response.dto';

/**
 * Đối tượng của chứng từ kho — nhà cung cấp và nhân viên.
 *
 * Uỷ quyền cho `SearchCounterpartiesQuery` mà trang web đang dùng: nó đã gộp ba
 * bảng (nhà cung cấp / khách hàng / nhân viên) và phân trang trên tập gộp. Tự
 * viết lại là chép một phép hợp ba nguồn, và hai bản sẽ phân kỳ.
 *
 * Phục vụ HAI màn bằng một đường: "Đối tượng" (không truyền `kinds`) và "Nhân
 * viên mua hàng" (`kinds=employee`). Hai màn khác nhau đúng một tham số, nên
 * tách thành hai endpoint là chép đôi mọi thứ còn lại.
 */
@Injectable()
export class MobileCounterpartyService {
  constructor(private readonly queryBus: QueryBus) {}

  async list(
    query: {
      page: number;
      limit: number;
      search?: string;
      kinds?: CounterpartyKind[];
    },
    actor: ActorContext,
  ): Promise<MobileCounterpartyPageDto> {
    const { page, limit, search, kinds } = query;

    const result = await this.queryBus.execute<
      SearchCounterpartiesQuery,
      SearchCounterpartiesResponseDto
    >(
      new SearchCounterpartiesQuery(
        {
          // Bỏ trống thì lấy TRỌN tập mà phiếu kho nhận được, không phải `all`:
          // `all` kéo theo khách hàng, mà `resolveDocCounterparty` từ chối loại
          // đó — danh sách sẽ bày ra thứ chọn xong là 400.
          types: kinds?.length ? kinds : [...MOBILE_DOC_COUNTERPARTY_KINDS],
          type: CounterpartyKind.ALL,
          search,
          page,
          pageSize: limit,
        },
        actor,
      ),
    );

    return {
      data: result.data.map(toMobileCounterparty),
      total: result.total,
      page: result.page,
      limit: result.pageSize,
    };
  }
}

/**
 * Chép TƯỜNG MINH bốn trường. Nguồn còn mang `phone` và `address` — hai thứ
 * một danh sách chọn không cần và không nên phát tán.
 */
function toMobileCounterparty(
  row: CounterpartyOptionDto,
): MobileCounterpartyResponseDto {
  return {
    id: row.id,
    // `customer` đã bị lọc từ `types` nên không tới được đây; ép kiểu để hợp
    // đồng phía app chỉ thấy hai giá trị nó xử được.
    kind: row.kind as 'supplier' | 'employee',
    code: row.code ?? null,
    name: row.name,
  };
}
