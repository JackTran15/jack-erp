import { BadRequestException, UnprocessableEntityException } from '@nestjs/common';
import { DocCounterpartyKind, GoodsReceiptStatus } from '@erp/shared-interfaces';
import { MediaException } from '../../../media/media.exception';
import { CreateGoodsReceiptV2Handler } from './create-goods-receipt-v2.handler';
import { CreateGoodsReceiptV2Command } from './create-goods-receipt-v2.command';

const actor = { organizationId: 'org1', branchId: 'b1', userId: 'u1', roles: [] } as never;

function makeHandler(opts: {
  items: { id: string; productId: string | null }[];
  counterparty?: unknown;
}) {
  // The ambient, non-transactional manager: used for every read/validation
  // before the write.
  const manager = {
    find: jest.fn(async () => opts.items),
    findOne: jest.fn(async () => opts.counterparty ?? null),
    create: jest.fn((_entity: unknown, obj: unknown) => obj),
  };
  // Distinct object from `manager` above, handed to the `dataSource.transaction`
  // callback — the insert and the media attach both run through this one, so a
  // test can tell whether the write path actually used the transaction's own
  // manager (T-04-02 security review) rather than the ambient one.
  const trxManager = {
    save: jest.fn(async (r: Record<string, unknown>) => ({ ...r, id: 'gr1' })),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const dataSource = {
    manager,
    transaction: jest.fn((cb: (m: unknown) => Promise<unknown>) => cb(trxManager)),
  };
  const documentNumbering = { generate: jest.fn(async () => 'PNK-1') };
  // Permissive by default: these cases are about the write path, not the
  // purpose gate. The gate has its own tests.
  const rbac = { hasPermission: jest.fn(async () => true) };
  // Stub added for the ticket T-04-02 dependency (`MediaLinkService`); its own
  // tests below override `syncOwner` where the return value or a rejection
  // matters.
  const mediaLink = { syncOwner: jest.fn(async (): Promise<string[]> => []) };
  const handler = new CreateGoodsReceiptV2Handler(
    dataSource as never,
    documentNumbering as never,
    rbac as never,
    mediaLink as never,
  );
  return { handler, manager, trxManager, documentNumbering, rbac, mediaLink };
}

const line = (itemId: string, locationId: string) => ({
  itemId,
  locationId,
  uomCode: 'cái',
  quantity: 2,
  unitPrice: 10,
});

describe('CreateGoodsReceiptV2Handler', () => {
  it('numbers the lines 1..n in submitted order (T-04-03, ADR-05)', async () => {
    const { handler, manager } = makeHandler({
      items: [
        { id: 'v1', productId: 'p1' },
        { id: 'v2', productId: 'p1' },
        { id: 'v3', productId: 'p1' },
      ],
    });

    await handler.execute(
      new CreateGoodsReceiptV2Command(
        {
          receivedAt: '2026-06-18T00:00:00.000Z',
          lines: [line('v1', 'L1'), line('v2', 'L1'), line('v3', 'L1')],
        } as never,
        actor,
      ),
    );

    // This path builds its lines itself rather than going through
    // GoodsReceiptService.makeLine, so it is its own chance to forget the
    // ordinal — and `line_no` is NOT NULL with no default, so forgetting it
    // fails at the insert.
    const created = manager.create.mock.calls
      .map((c) => c[1] as { lineNo?: number; itemId?: string })
      .filter((o) => 'itemId' in o);
    expect(created.map((o) => [o.lineNo, o.itemId])).toEqual([
      [1, 'v1'],
      [2, 'v2'],
      [3, 'v3'],
    ]);
  });

  it('creates a DRAFT, mirrors a supplier counterparty into provider_id', async () => {
    const { handler, trxManager } = makeHandler({
      items: [
        { id: 'v1', productId: 'p1' },
        { id: 'v2', productId: 'p1' },
      ],
      counterparty: { id: 'prov1' },
    });

    const res = await handler.execute(
      new CreateGoodsReceiptV2Command(
        {
          counterpartyKind: DocCounterpartyKind.SUPPLIER,
          counterpartyId: 'prov1',
          receivedAt: '2026-06-18T00:00:00.000Z',
          lines: [line('v1', 'L1'), line('v2', 'L1')],
        } as never,
        actor,
      ),
    );

    expect(res).toEqual({ id: 'gr1', documentNumber: 'PNK-1' });
    const saved = trxManager.save.mock.calls[0][0] as Record<string, unknown>;
    expect(saved.status).toBe(GoodsReceiptStatus.DRAFT);
    expect(saved.providerId).toBe('prov1');
    expect(saved.counterpartyKind).toBe(DocCounterpartyKind.SUPPLIER);
    expect(saved.counterpartyId).toBe('prov1');
    expect(saved.locationId).toBe('L1'); // header derived from first line
    expect((saved.lines as unknown[]).length).toBe(2);
  });

  it('rejects two variants of one product on different locations', async () => {
    const { handler, documentNumbering } = makeHandler({
      items: [
        { id: 'v1', productId: 'p1' },
        { id: 'v2', productId: 'p1' },
      ],
    });

    await expect(
      handler.execute(
        new CreateGoodsReceiptV2Command(
          {
            receivedAt: '2026-06-18T00:00:00.000Z',
            lines: [line('v1', 'L1'), line('v2', 'L2')],
          } as never,
          actor,
        ),
      ),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(documentNumbering.generate).not.toHaveBeenCalled();
  });

  it('rejects an unknown supplier counterparty', async () => {
    const { handler } = makeHandler({
      items: [{ id: 'v1', productId: 'p1' }],
      counterparty: null,
    });

    await expect(
      handler.execute(
        new CreateGoodsReceiptV2Command(
          {
            counterpartyKind: DocCounterpartyKind.SUPPLIER,
            counterpartyId: 'missing',
            receivedAt: '2026-06-18T00:00:00.000Z',
            lines: [line('v1', 'L1')],
          } as never,
          actor,
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires an active branch', async () => {
    const { handler } = makeHandler({ items: [] });
    await expect(
      handler.execute(
        new CreateGoodsReceiptV2Command(
          { receivedAt: '2026-06-18T00:00:00.000Z', lines: [line('v1', 'L1')] } as never,
          { organizationId: 'org1', userId: 'u1', roles: [] } as never,
        ),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('media attachments (T-04-02)', () => {
    it('inserts and attaches inside one transaction, writing back the order syncOwner returns', async () => {
      const { handler, trxManager, mediaLink } = makeHandler({
        items: [{ id: 'v1', productId: 'p1' }],
      });
      mediaLink.syncOwner.mockResolvedValue(['media-1', 'media-2']);

      await handler.execute(
        new CreateGoodsReceiptV2Command(
          {
            receivedAt: '2026-06-18T00:00:00.000Z',
            attachmentIds: ['media-2', 'media-1'],
            lines: [line('v1', 'L1')],
          } as never,
          actor,
        ),
      );

      // syncOwner receives the transaction's own manager — distinct from the
      // ambient `dataSource.manager` — proving the insert and the attach share
      // one transaction.
      expect(mediaLink.syncOwner).toHaveBeenCalledWith(
        'GOODS_RECEIPT',
        'gr1',
        ['media-2', 'media-1'],
        actor,
        trxManager,
      );
      expect(trxManager.update).toHaveBeenCalledWith(expect.anything(), 'gr1', {
        attachmentIds: ['media-1', 'media-2'],
      });
    });

    it('rolls back the insert when an id belongs to another organization — no compensating delete', async () => {
      const { handler, trxManager, mediaLink } = makeHandler({
        items: [{ id: 'v1', productId: 'p1' }],
      });
      mediaLink.syncOwner.mockRejectedValue(
        new MediaException(404, 'MEDIA_NOT_FOUND', 'Media other-org-media not found'),
      );

      await expect(
        handler.execute(
          new CreateGoodsReceiptV2Command(
            {
              receivedAt: '2026-06-18T00:00:00.000Z',
              attachmentIds: ['other-org-media'],
              lines: [line('v1', 'L1')],
            } as never,
            actor,
          ),
        ),
      ).rejects.toMatchObject({ code: 'MEDIA_NOT_FOUND' });

      // syncOwner ran inside the transaction's own manager, so its rejection is
      // what rolls back the insert — there is nothing left to compensate.
      expect(mediaLink.syncOwner).toHaveBeenCalledWith(
        'GOODS_RECEIPT',
        'gr1',
        ['other-org-media'],
        actor,
        trxManager,
      );
      expect(trxManager.delete).not.toHaveBeenCalled();
    });

    it('does not call syncOwner when attachmentIds is not sent', async () => {
      const { handler, trxManager, mediaLink } = makeHandler({
        items: [{ id: 'v1', productId: 'p1' }],
      });

      await handler.execute(
        new CreateGoodsReceiptV2Command(
          { receivedAt: '2026-06-18T00:00:00.000Z', lines: [line('v1', 'L1')] } as never,
          actor,
        ),
      );

      expect(mediaLink.syncOwner).not.toHaveBeenCalled();
      expect(trxManager.update).not.toHaveBeenCalled();
    });
  });
});
