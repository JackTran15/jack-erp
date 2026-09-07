import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { FilterBuilder } from './filter.builder';
import { StringFilterDto, StringOperator } from './filter.dto';

/**
 * Chỉ khoá `applyOrString` — mệnh đề DUY NHẤT trong lớp này nối bằng OR.
 *
 * Các `apply*` còn lại đều nối bằng AND và đã được phủ gián tiếp qua spec của
 * từng handler; viết lại chúng ở đây là chép cùng một khẳng định lần thứ hai.
 */
describe('FilterBuilder.applyOrString', () => {
  let qb: { andWhere: jest.Mock };

  beforeEach(() => {
    qb = { andWhere: jest.fn().mockReturnThis() };
  });

  const build = () =>
    new FilterBuilder(qb as unknown as SelectQueryBuilder<ObjectLiteral>);

  const lastCall = () => qb.andWhere.mock.calls.at(-1)!;

  it('nối các cột bằng OR trong MỘT mệnh đề, bọc trong MỘT cặp ngoặc', () => {
    build().applyOrString(['gr.documentNumber', 'provider.name'], 'NK0001');

    expect(qb.andWhere).toHaveBeenCalledTimes(1);

    const [sql] = lastCall();

    // Cặp ngoặc là thứ giữ an toàn, không phải thẩm mỹ: thiếu nó thì `OR` leo
    // ra ngoài và vô hiệu hoá mọi điều kiện tổ chức/chi nhánh đã đặt trước đó
    // trên cùng query builder — rò dữ liệu sang tenant khác.
    expect(sql).toMatch(/^\(.*\)$/);
    expect(sql).toContain(' OR ');
    expect(sql).toContain('gr.documentNumber ILIKE');
    expect(sql).toContain('provider.name ILIKE');
  });

  it('mọi cột dùng CHUNG một tham số', () => {
    build().applyOrString(['a.x', 'b.y', 'c.z'], 'tim');

    const [sql, params] = lastCall();

    expect(Object.keys(params)).toHaveLength(1);
    const key = Object.keys(params)[0];
    expect(sql.match(new RegExp(`:${key}\\b`, 'g'))).toHaveLength(3);
  });

  it('bọc `%` hai đầu và cắt khoảng trắng thừa', () => {
    build().applyOrString(['a.x'], '  NK0001  ');

    expect(Object.values(lastCall()[1])).toEqual(['%NK0001%']);
  });

  it('escape `%`, `_` và `\\` — người dùng gõ chúng là KÝ TỰ', () => {
    build().applyOrString(['a.x'], '50%_off\\now');

    // Không escape thì gõ `%` khớp mọi dòng và gõ `_` khớp mọi ký tự đơn — ô
    // tìm kiếm biến thành một câu LIKE do người dùng viết.
    expect(Object.values(lastCall()[1])).toEqual(['%50\\%\\_off\\\\now%']);
  });

  it('KHÁC applyString ở chỗ escape — chỗ lệch này là CÓ CHỦ Ý', () => {
    const filter: StringFilterDto = {
      value: '50%',
      operator: StringOperator.CONTAINS,
    };

    build().applyString('a.x', filter);

    // `applyString` nhận từ một ô lọc có chọn toán tử, nơi một `%` có thể là ý
    // của người dùng. Ghi lại đây để không ai "sửa cho đồng bộ" một chiều mà
    // không đọc lý do.
    expect(Object.values(lastCall()[1])).toEqual(['%50%%']);
  });

  it('giá trị rỗng, toàn khoảng trắng, hoặc không có cột nào thì KHÔNG thêm gì', () => {
    const b = build();

    b.applyOrString(['a.x'], undefined);
    b.applyOrString(['a.x'], '');
    b.applyOrString(['a.x'], '   ');
    b.applyOrString([], 'tim');

    expect(qb.andWhere).not.toHaveBeenCalled();
  });

  it('tên tham số KHÔNG trùng nhau giữa hai lần gọi', () => {
    const b = build();

    b.applyOrString(['a.x'], 'mot');
    b.applyOrString(['b.y'], 'hai');

    // Trùng tên thì lần thứ hai ghi đè lần đầu và một trong hai bộ lọc biến
    // mất — im lặng, vì SQL vẫn hợp lệ.
    const [k1] = Object.keys(qb.andWhere.mock.calls[0][1]);
    const [k2] = Object.keys(qb.andWhere.mock.calls[1][1]);
    expect(k1).not.toBe(k2);
  });
});
