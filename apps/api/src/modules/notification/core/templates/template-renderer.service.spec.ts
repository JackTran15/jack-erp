import { PUSH_TEMPLATES } from '../../templates';
import { NOTIFICATION_DEFINITION_CLASSES } from '../../definitions';
import { TemplateRenderer } from './template-renderer.service';

describe('TemplateRenderer', () => {
  const renderer = new TemplateRenderer(PUSH_TEMPLATES);
  const data = { actor: 'Nguyễn Văn A', code: '2609220001', amount: 1250000, store: 'Cửa hàng Q1' };

  it('renders vi with money formatted', () => {
    expect(renderer.render('invoice', 'vi', data)).toEqual({
      title: 'Hoá đơn mới 2609220001',
      body: 'Nguyễn Văn A đã lập hoá đơn 2609220001 trị giá 1.250.000 ₫ tại Cửa hàng Q1.',
    });
  });

  it('renders en and normalises locale tags', () => {
    expect(renderer.render('invoice', 'en-US', data)?.body).toBe(
      'Nguyễn Văn A created invoice 2609220001 worth 1,250,000 ₫ at Cửa hàng Q1.',
    );
  });

  it('falls back to vi for an unknown locale', () => {
    expect(renderer.render('invoice', 'fr', data)?.title).toBe('Hoá đơn mới 2609220001');
  });

  it('never leaks a raw placeholder when a variable is missing', () => {
    const text = renderer.render('invoice', 'vi', { code: 'X1', amount: 5 })!;
    expect(text.body).not.toMatch(/\{\{|\}\}/);
    expect(text.body).not.toMatch(/\s{2,}/);
  });

  it('formats `date` as dd/MM/yyyy in business time', () => {
    expect(renderer.render('revenue', 'vi', { date: '2026-09-21T17:30:00Z', amount: 10, store: 'S' })?.title).toBe(
      'Doanh thu ngày 22/09/2026',
    );
  });

  it('picks the singular variant when the count is 0', () => {
    expect(renderer.render('stock_alert', 'vi', { product: 'Giày A', more: 0, store: 'Q1' })?.body).toBe(
      'Giày A đã hết hàng tại Q1.',
    );
    expect(renderer.render('stock_alert', 'vi', { product: 'Giày A', more: 3, store: 'Q1' })?.body).toBe(
      'Giày A và 3 mặt hàng khác đã hết hàng tại Q1.',
    );
  });

  it('returns null for an unknown type', () => {
    expect(renderer.render('nope', 'vi', {})).toBeNull();
  });

  it('every registered definition has a push template in every locale', () => {
    const types = NOTIFICATION_DEFINITION_CLASSES.map((cls) => new (cls as any)({}).type as string);
    for (const type of types) {
      expect(renderer.hasTemplate(type, 'vi')).toBe(true);
      expect(renderer.hasTemplate(type, 'en')).toBe(true);
    }
  });
});
