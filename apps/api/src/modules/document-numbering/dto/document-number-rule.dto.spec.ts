import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DocumentType } from '@erp/shared-interfaces';
import { CreateDocumentNumberRuleDto } from './create-document-number-rule.dto';
import { UpdateDocumentNumberRuleDto } from './update-document-number-rule.dto';

/**
 * The invoice rule has an empty prefix, a YYMMDD date and an empty separator.
 * The migration writes it straight to the table, but an administrator editing
 * that same rule on the settings screen goes through these DTOs — and until
 * this change all three of those values were rejected with a 400 whose message
 * did not say which field was at fault.
 */
const failedFields = (dto: object): string[] =>
  validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).map(
    (e) => e.property,
  );

const create = (overrides: Partial<CreateDocumentNumberRuleDto> = {}) =>
  plainToInstance(CreateDocumentNumberRuleDto, {
    documentType: DocumentType.INVOICE,
    prefix: 'INV',
    ...overrides,
  });

const update = (overrides: Partial<UpdateDocumentNumberRuleDto> = {}) =>
  plainToInstance(UpdateDocumentNumberRuleDto, { ...overrides });

describe('document number rule DTOs — the YYMMDD invoice shape', () => {
  it('accepts an empty prefix', () => {
    expect(failedFields(create({ prefix: '' }))).toEqual([]);
    expect(failedFields(update({ prefix: '' }))).toEqual([]);
  });

  it('still rejects a prefix with characters that would break the code', () => {
    expect(failedFields(create({ prefix: 'IN V' }))).toEqual(['prefix']);
    expect(failedFields(create({ prefix: 'INV#' }))).toEqual(['prefix']);
  });

  it('requires prefix to be present — the column is NOT NULL with no default', () => {
    const dto = plainToInstance(CreateDocumentNumberRuleDto, {
      documentType: DocumentType.INVOICE,
    });
    expect(failedFields(dto)).toEqual(['prefix']);
  });

  it('accepts YYMMDD as a date format', () => {
    expect(failedFields(create({ dateFormat: 'YYMMDD' }))).toEqual([]);
    expect(failedFields(update({ dateFormat: 'YYMMDD' }))).toEqual([]);
  });

  it('still rejects a date format the formatter does not know', () => {
    expect(failedFields(create({ dateFormat: 'DDMMYY' }))).toEqual([
      'dateFormat',
    ]);
  });

  it('accepts an empty separator and a one-character one', () => {
    for (const separator of ['', '-', '/', '.']) {
      expect(failedFields(create({ separator }))).toEqual([]);
      expect(failedFields(update({ separator }))).toEqual([]);
    }
  });

  it('rejects a separator longer than the column', () => {
    expect(failedFields(create({ separator: 'abcdef' }))).toEqual(['separator']);
  });

  it('accepts the suffix that tells returns apart from sales', () => {
    expect(failedFields(update({ suffix: 'TH' }))).toEqual([]);
  });
});
