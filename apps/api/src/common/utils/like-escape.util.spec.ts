import { escapeLikeTerm } from './like-escape.util';

describe('escapeLikeTerm', () => {
  it('neutralises the two LIKE wildcards', () => {
    // Chưa escape thì gõ `%` khớp MỌI dòng và gõ `_` khớp mọi ký tự đơn — ô
    // tìm kiếm biến thành một câu LIKE do người dùng viết.
    expect(escapeLikeTerm('50%')).toBe('50\\%');
    expect(escapeLikeTerm('a_b')).toBe('a\\_b');
  });

  it('escapes the backslash itself, and does it in ONE pass', () => {
    // Hai lượt thay thế nối tiếp sẽ escape lại chính dấu vừa thêm: `%` -> `\%`
    // -> `\\%`, tức khớp một dấu gạch chéo theo sau là ký tự đại diện. Regex
    // một lượt không có ca đó.
    expect(escapeLikeTerm('a\\b')).toBe('a\\\\b');
    expect(escapeLikeTerm('%')).toBe('\\%');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeLikeTerm('NK000010')).toBe('NK000010');
    expect(escapeLikeTerm('Biti’s Hunter')).toBe('Biti’s Hunter');
  });

  it('does NOT add the surrounding % — that is the caller’s choice', () => {
    // Nơi gọi quyết định `contains` hay `startsWith`; hàm này chỉ vô hiệu hoá
    // phần do người dùng gõ.
    expect(escapeLikeTerm('abc')).toBe('abc');
  });
});
