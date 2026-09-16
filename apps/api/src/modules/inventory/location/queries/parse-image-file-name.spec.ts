import { parseImageFileName } from './parse-image-file-name';

// AC-12 — the `SKU (NN)` rule, one row per edge case named in the ticket.
describe('parseImageFileName', () => {
  it.each([
    // name                   code          seq    error
    ['ABC (01).png',          'ABC',        1,     null],
    ['ABC(2)',                'ABC',        2,     null],
    ['abc (10).PNG',          'abc',        10,    null],
    ['ABC (11)',              'ABC',        11,    'SEQ_OUT_OF_RANGE'],
    ['ABC (00)',              'ABC',        0,     'SEQ_OUT_OF_RANGE'],
    ['ABC (99).jpg',          'ABC',        99,    'SEQ_OUT_OF_RANGE'],
    ['ABC',                   'ABC',        null,  null],
    ['ABC.jpeg',              'ABC',        null,  null],
    ['(01)',                  '',           1,     null],
    ['A B (03)',              'A B',        3,     null],
    ['ABC (1) (2)',           'ABC (1)',    2,     null],
    ['ABC (1)(2)',            'ABC (1)',    2,     null],
    ['  ABC (5).webp  ',      'ABC',        5,     null],
    ['ABC (5).gif',           'ABC',        5,     null],
    ['ABC (5).JPEG',          'ABC',        5,     null],
  ])('%j → code %j, seq %j, error %j', (name, code, seq, error) => {
    expect(parseImageFileName(name)).toEqual({ code, seq, error });
  });

  it('strips only the final image extension, and only a known one', () => {
    expect(parseImageFileName('ABC.png.jpg')).toEqual({ code: 'ABC.png', seq: null, error: null });
    expect(parseImageFileName('ABC.txt')).toEqual({ code: 'ABC.txt', seq: null, error: null });
    expect(parseImageFileName('ABC.pdf (01)')).toEqual({ code: 'ABC.pdf', seq: 1, error: null });
  });

  it('does not treat a non-numeric or 3-digit suffix as a sequence', () => {
    expect(parseImageFileName('ABC (a)')).toEqual({ code: 'ABC (a)', seq: null, error: null });
    expect(parseImageFileName('ABC (100)')).toEqual({ code: 'ABC (100)', seq: null, error: null });
    expect(parseImageFileName('ABC ()')).toEqual({ code: 'ABC ()', seq: null, error: null });
  });

  it('returns an empty code for an empty or extension-only name', () => {
    expect(parseImageFileName('')).toEqual({ code: '', seq: null, error: null });
    expect(parseImageFileName('.png')).toEqual({ code: '', seq: null, error: null });
    expect(parseImageFileName('   ')).toEqual({ code: '', seq: null, error: null });
  });

  it('keeps the code on an out-of-range sequence so the card can still show it', () => {
    const parsed = parseImageFileName('AK1359 (12).png');
    expect(parsed.code).toBe('AK1359');
    expect(parsed.error).toBe('SEQ_OUT_OF_RANGE');
  });
});
