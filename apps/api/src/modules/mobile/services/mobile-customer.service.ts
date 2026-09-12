import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  CounterpartyKind,
  CounterpartyOptionDto,
  SearchCounterpartiesResponseDto,
} from '../../counterparty/dto/search-counterparties.dto';
import { SearchCounterpartiesQuery } from '../../counterparty/queries/search-counterparties.query';
import {
  MobileCustomerPageDto,
  MobileCustomerResponseDto,
} from '../dto/mobile-customer.response.dto';

/**
 * Danh sách khách hàng cho màn CHỌN KHÁCH của app bán hàng.
 *
 * ## Vì sao uỷ quyền cho `SearchCounterpartiesQuery`, không cho `CustomerService`
 *
 * `CustomerService` kế thừa `BaseCrudService`, tức `list()` của nó là mặt tiền
 * CRUD chung: trả TRỌN bản ghi khách hàng (điểm thưởng, hạng thẻ, công nợ, ngày
 * sinh, địa chỉ…) và nhận một chuỗi `filters` JSON tự do. Cả hai đều sai cho
 * đường này — thứ nhất là phát tán dữ liệu, thứ hai là một bề mặt không kiểm
 * soát được.
 *
 * `SearchCounterpartiesQuery` thì đã là một truy vấn TÌM-ĐỂ-CHỌN: nó lọc theo
 * tổ chức, bỏ khách đã gộp (`status != merged`), tìm theo mã/tên/điện thoại, và
 * phân trang. Đúng câu hỏi của màn này. Đây cũng là nguồn mà
 * `MobileCounterpartyService` đang dùng, nên hai đường không thể lệch nhau về
 * cách tìm.
 *
 * ## Vì sao KHÔNG gộp vào `/mobile/counterparties`
 *
 * Nghe rất gần: chỉ khác một `kinds=customer`. Nhưng ba thứ khác nhau, và cả ba
 * đều là hợp đồng:
 *
 * 1. **Quyền.** Đường kia đòi `inventory.read` vì nó phục vụ phiếu kho; đường
 *    này đòi `customer.read`. Gộp lại là buộc một trong hai vai mang quyền nó
 *    không cần.
 * 2. **Hình dạng trả về.** Đường kia cố ý KHÔNG trả `phone`; ở đây `phone` là
 *    khoá tra cứu chính. Thêm nó vào DTO dùng chung là nới một bề mặt đã thu
 *    hẹp có chủ đích.
 * 3. **Tập giá trị `kind`.** Đường kia khai `enum ['supplier','employee']` và
 *    có một ràng buộc cứng ở tầng dưới từ chối `customer`.
 */
@Injectable()
export class MobileCustomerService {
  constructor(private readonly queryBus: QueryBus) {}

  async list(
    query: { page: number; limit: number; search?: string },
    actor: ActorContext,
  ): Promise<MobileCustomerPageDto> {
    const { page, limit, search } = query;

    const result = await this.queryBus.execute<
      SearchCounterpartiesQuery,
      SearchCounterpartiesResponseDto
    >(
      new SearchCounterpartiesQuery(
        {
          // CHỈ khách hàng. `type: ALL` là cách hợp đồng bên dưới nói "đọc
          // `types[]`" — bỏ nó thì `types` bị bỏ qua và nhà cung cấp lẫn nhân
          // viên trôi vào danh sách chọn khách.
          types: [CounterpartyKind.CUSTOMER],
          type: CounterpartyKind.ALL,
          search,
          page,
          pageSize: limit,
        },
        actor,
      ),
    );

    return {
      data: result.data.map(toMobileCustomer),
      total: result.total,
      page: result.page,
      limit: result.pageSize,
    };
  }
}

/**
 * Chép TƯỜNG MINH bốn trường.
 *
 * Không `...row`: nguồn còn mang `kind` và `address`, và một ngày nào đó sẽ
 * mang thêm thứ khác — trải nó ra là để bề mặt của đường này lớn lên mà không
 * ai quyết định.
 */
function toMobileCustomer(row: CounterpartyOptionDto): MobileCustomerResponseDto {
  return {
    id: row.id,
    code: row.code ?? null,
    name: row.name,
    phone: row.phone ?? null,
  };
}
