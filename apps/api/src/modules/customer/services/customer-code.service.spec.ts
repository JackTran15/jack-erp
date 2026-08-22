import { ConflictException } from '@nestjs/common';
import { DocumentType } from '@erp/shared-interfaces';
import { CustomerCodeService } from './customer-code.service';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';

const actor: ActorContext = {
  userId: 'user-1',
  organizationId: 'org-1',
  branchId: 'branch-1',
  roles: [],
};

function build(existingCodes: string[], generated: string[]) {
  const queue = [...generated];
  const docNumbering = {
    generate: jest.fn(async () => queue.shift() ?? 'EXHAUSTED'),
    ensureSequenceAtLeast: jest.fn(async () => undefined),
  };
  const customerRepo = {
    findOne: jest.fn(async ({ where }: { where: { code: string } }) =>
      existingCodes.includes(where.code) ? { id: 'x' } : null,
    ),
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(async () => ({
        max: String(
          Math.max(
            0,
            ...existingCodes.map((c) => Number(c.replace(/\D+/g, ''))),
          ),
        ),
      })),
    })),
  };
  const service = new CustomerCodeService(
    customerRepo as never,
    docNumbering as never,
  );
  return { service, docNumbering, customerRepo };
}

describe('CustomerCodeService', () => {
  it('returns the generated code when it is free', async () => {
    const { service, docNumbering } = build([], ['KH000001']);

    await expect(service.issue(actor)).resolves.toBe('KH000001');
    expect(docNumbering.ensureSequenceAtLeast).not.toHaveBeenCalled();
  });

  it('fast-forwards the counter past codes the counter never issued', async () => {
    // The drift this repairs: seeds/imports hold KH000001..KH000103 while the
    // counter sits at 1, so `generate` keeps re-issuing taken numbers.
    const existing = Array.from({ length: 103 }, (_, i) =>
      `KH${String(i + 1).padStart(6, '0')}`,
    );
    const { service, docNumbering } = build(existing, ['KH000002', 'KH000104']);

    await expect(service.issue(actor)).resolves.toBe('KH000104');
    expect(docNumbering.ensureSequenceAtLeast).toHaveBeenCalledWith(
      DocumentType.CUSTOMER,
      actor.branchId,
      actor,
      103,
      undefined,
    );
  });

  it('gives up with a conflict rather than letting the insert hit the unique index', async () => {
    const { service } = build(['KH000001'], ['KH000001', 'KH000001', 'KH000001']);

    await expect(service.issue(actor)).rejects.toBeInstanceOf(ConflictException);
  });
});
