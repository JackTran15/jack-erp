import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { MobileProductAttributeService } from './mobile-product-attribute.service';

const actor: ActorContext = {
  userId: 'seller-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  branchIds: ['branch-1'],
  roles: [],
};

describe('MobileProductAttributeService', () => {
  let service: MobileProductAttributeService;
  let dataSource: { query: jest.Mock };

  beforeEach(async () => {
    dataSource = { query: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MobileProductAttributeService,
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();

    service = module.get(MobileProductAttributeService);
  });

  const sql = () => String(dataSource.query.mock.calls[0][0]);

  it('lọc theo TỔ CHỨC ngay trong câu lệnh', async () => {
    await service.list(actor);

    // Cùng luật với mọi truy vấn khác của tầng này. Thiếu nó thì hàng chip lọc
    // của một cửa hàng bày ra màu/size của tổ chức khác.
    expect(sql()).toContain('p.organization_id = $1');
    expect(dataSource.query.mock.calls[0][1]).toEqual(['org-1']);
  });

  it('gộp theo TÊN chiều, không theo `definition.id`', async () => {
    // `product_attribute_definitions` gắn với TỪNG `product_id`, nên mỗi mẫu mã
    // có bản `Màu sắc` riêng. Hai dòng dưới đây đến từ hai mẫu mã khác nhau —
    // gộp theo id thì hàng chip có HAI chiều cùng tên `Màu sắc`.
    dataSource.query.mockResolvedValueOnce([
      { name: 'Màu sắc', label: 'Đen', codeSuffix: 'D' },
      { name: 'Màu sắc', label: 'Nâu', codeSuffix: 'N' },
      { name: 'Size', label: '38', codeSuffix: '38' },
    ]);

    const result = await service.list(actor);

    expect(result.map((item) => item.name)).toEqual(['Màu sắc', 'Size']);
    expect(result[0].values).toHaveLength(2);
  });

  it('`label` và `codeSuffix` là HAI thứ, không phải một', async () => {
    // Đây là ca mà bảng mock cũ của app đã che mất: nó đặt `code == name`, nên
    // bộ lọc so hậu tố mã với NHÃN vẫn tình cờ đúng. Dữ liệu thật thì nhãn là
    // `Đen` còn hậu tố là `D` — lấy nhầm một cái cho cả hai việc là một bộ lọc
    // luôn rỗng mà không báo lỗi gì.
    dataSource.query.mockResolvedValueOnce([{ name: 'Màu sắc', label: 'Đen', codeSuffix: 'D' }]);

    const result = await service.list(actor);

    expect(result[0].values[0]).toEqual({ label: 'Đen', codeSuffix: 'D' });
  });

  it('`code_suffix` NULL thì SUY RA từ nhãn, không trả `null`', async () => {
    // **Ca của TOÀN BỘ dữ liệu thật**, không phải một ca biên: đo 2026-09-11,
    // `code_suffix` rỗng ở mọi hàng của tổ chức dev (4092 biến thể màu `D`).
    // Trả `null` ra thì app bỏ hết khỏi chip và bộ lọc màu/size biến mất — đúng
    // cái đã xảy ra ở lượt e2e đầu.
    //
    // Giá trị suy ra phải khớp ĐÚNG thứ `VariantGenerationService` đã ghép vào
    // mã: bỏ dấu, bỏ ký tự không phải chữ/số, ba ký tự đầu, viết hoa.
    dataSource.query.mockResolvedValueOnce([
      { name: 'Màu sắc', label: 'D', codeSuffix: null },
      { name: 'Màu sắc', label: 'Đen nhám', codeSuffix: null },
    ]);

    const result = await service.list(actor);

    expect(result[0].values[0].codeSuffix).toBe('D');
    // `ENN`, KHÔNG phải `DEN` — và đây là một quirk phải khoá lại, không phải
    // một lỗi: `Đ` (U+0110) KHÔNG phân rã dưới NFD (nét gạch là một phần của
    // chính ký tự, không phải dấu tổ hợp), nên `[^a-zA-Z0-9]` xoá sạch nó và
    // `Đen nhám` -> `ennham` -> `ENN`.
    //
    // Vô hại cho việc lọc vì mã biến thể trong CSDL cũng sinh ra bằng đúng hàm
    // này — hai bên khớp nhau. Nhưng ai định "sửa cho đúng" phải biết rằng nó
    // sẽ làm lệch mọi mã đã sinh trước đó.
    expect(result[0].values[1].codeSuffix).toBe('ENN');
  });

  it('`code_suffix` khai tường minh thì THẮNG nhãn', async () => {
    dataSource.query.mockResolvedValueOnce([{ name: 'Màu sắc', label: 'Đen nhám', codeSuffix: 'DN' }]);

    const result = await service.list(actor);

    expect(result[0].values[0].codeSuffix).toBe('DN');
  });

  it('giữ THỨ TỰ của câu lệnh, KHÔNG sắp lại ở tầng TS', async () => {
    // `S, M, L` sắp bằng `sort()` ra `L, M, S` — sai. Thứ tự đúng đến từ
    // `ORDER BY` (`sort_order` đã cấu hình), nên tầng này chỉ được gom.
    dataSource.query.mockResolvedValueOnce([
      { name: 'Size', label: 'S', codeSuffix: 'S' },
      { name: 'Size', label: 'M', codeSuffix: 'M' },
      { name: 'Size', label: 'L', codeSuffix: 'L' },
    ]);

    const result = await service.list(actor);

    expect(result[0].values.map((value) => value.label)).toEqual(['S', 'M', 'L']);
  });

  it('danh mục chưa khai thuộc tính nào thì trả mảng RỖNG, không ném', async () => {
    expect(await service.list(actor)).toEqual([]);
  });
});
