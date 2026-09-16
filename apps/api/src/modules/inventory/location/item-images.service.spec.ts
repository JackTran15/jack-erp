import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { MediaLinkService } from '../../media/media-link.service';
import { MediaOwnerType } from '../../media/media-object.entity';
import { MediaException } from '../../media/media.exception';
import { ItemImagesService } from './item-images.service';

/**
 * T-01-02 — owner resolution and partial success of `setImages` (AC-06,
 * AC-09). `MediaLinkService` is stubbed like `cash-receipts.service.spec.ts`;
 * the owner query is answered by a stubbed `dataSource.query`, so what is
 * proven here is the mapping from rows to owner types and the per-row
 * error handling, not the SQL itself (the e2e covers that).
 */
describe('ItemImagesService', () => {
  const PRODUCT_ID = 'aa000000-0000-4000-8000-000000000001';
  const ITEM_ID = 'ab000000-0000-4000-8000-000000000002';
  const UNKNOWN_ID = 'ac000000-0000-4000-8000-000000000003';
  const MEDIA_1 = 'dd000000-0000-4000-8000-000000000001';
  const MEDIA_2 = 'dd000000-0000-4000-8000-000000000002';

  const actor: ActorContext = {
    userId: 'c0000000-0000-4000-8000-000000000001',
    organizationId: 'a0000000-0000-4000-8000-000000000001',
    roles: [],
  } as unknown as ActorContext;

  const manager = { __tag: 'tx-manager' };

  let service: ItemImagesService;
  let dataSource: { query: jest.Mock; transaction: jest.Mock };
  let mediaLink: { syncOwner: jest.Mock };

  beforeEach(async () => {
    dataSource = {
      // Both known ids resolve; anything else is simply absent from the rows.
      query: jest.fn().mockResolvedValue([
        { id: PRODUCT_ID, owner_type: 'PRODUCT', code: 'PROD-A' },
        { id: ITEM_ID, owner_type: 'ITEM', code: 'ITEM-C' },
      ]),
      transaction: jest.fn((cb: (m: unknown) => Promise<unknown>) => cb(manager)),
    };
    mediaLink = {
      syncOwner: jest.fn((_t, _id, ids: string[]) => Promise.resolve(ids)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ItemImagesService,
        { provide: DataSource, useValue: dataSource },
        { provide: MediaLinkService, useValue: mediaLink },
      ],
    }).compile();
    service = module.get(ItemImagesService);
  });

  it('resolves PRODUCT and ITEM owners from the one owner query and reports imageCount', async () => {
    const res = await service.setImages(
      [
        { id: PRODUCT_ID, imageIds: [MEDIA_1, MEDIA_2] },
        { id: ITEM_ID, imageIds: [MEDIA_1] },
      ],
      actor,
    );

    expect(dataSource.query).toHaveBeenCalledTimes(1);
    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toMatch(/FROM products/);
    expect(sql).toMatch(/FROM items/);
    expect(sql).toMatch(/product_id IS NULL/);
    expect(params).toEqual([actor.organizationId, [PRODUCT_ID, ITEM_ID]]);

    expect(mediaLink.syncOwner).toHaveBeenNthCalledWith(
      1,
      MediaOwnerType.PRODUCT,
      PRODUCT_ID,
      [MEDIA_1, MEDIA_2],
      actor,
      manager,
    );
    expect(mediaLink.syncOwner).toHaveBeenNthCalledWith(
      2,
      MediaOwnerType.ITEM,
      ITEM_ID,
      [MEDIA_1],
      actor,
      manager,
    );
    expect(res).toEqual({
      updated: [
        { id: PRODUCT_ID, code: 'PROD-A', imageCount: 2 },
        { id: ITEM_ID, code: 'ITEM-C', imageCount: 1 },
      ],
      failed: [],
    });
  });

  it('runs each assignment in its own transaction and hands syncOwner that manager', async () => {
    await service.setImages(
      [
        { id: PRODUCT_ID, imageIds: [MEDIA_1] },
        { id: ITEM_ID, imageIds: [] },
      ],
      actor,
    );
    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
    for (const call of mediaLink.syncOwner.mock.calls) {
      expect(call[4]).toBe(manager);
    }
  });

  it('reports an unknown id as OWNER_NOT_FOUND without calling syncOwner', async () => {
    const res = await service.setImages([{ id: UNKNOWN_ID, imageIds: [MEDIA_1] }], actor);
    expect(mediaLink.syncOwner).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(res).toEqual({
      updated: [],
      failed: [{ id: UNKNOWN_ID, code: null, reason: 'OWNER_NOT_FOUND' }],
    });
  });

  it('turns a MediaException into a failed row and keeps going with the rest', async () => {
    mediaLink.syncOwner
      .mockRejectedValueOnce(new MediaException(404, 'MEDIA_NOT_FOUND', 'Media not found'))
      .mockResolvedValueOnce([MEDIA_2]);

    const res = await service.setImages(
      [
        { id: PRODUCT_ID, imageIds: [MEDIA_1] },
        { id: UNKNOWN_ID, imageIds: [MEDIA_1] },
        { id: ITEM_ID, imageIds: [MEDIA_2] },
      ],
      actor,
    );

    expect(mediaLink.syncOwner).toHaveBeenCalledTimes(2);
    expect(res).toEqual({
      updated: [{ id: ITEM_ID, code: 'ITEM-C', imageCount: 1 }],
      failed: [
        { id: PRODUCT_ID, code: 'PROD-A', reason: 'MEDIA_NOT_FOUND' },
        { id: UNKNOWN_ID, code: null, reason: 'OWNER_NOT_FOUND' },
      ],
    });
  });

  it('propagates a non-media error instead of swallowing it into failed', async () => {
    mediaLink.syncOwner.mockRejectedValueOnce(new Error('connection reset'));
    await expect(
      service.setImages(
        [
          { id: PRODUCT_ID, imageIds: [MEDIA_1] },
          { id: ITEM_ID, imageIds: [MEDIA_2] },
        ],
        actor,
      ),
    ).rejects.toThrow('connection reset');
    expect(mediaLink.syncOwner).toHaveBeenCalledTimes(1);
  });

  it('matches owner ids case-insensitively, as Postgres prints uuids in lower case', async () => {
    const res = await service.setImages(
      [{ id: PRODUCT_ID.toUpperCase(), imageIds: [MEDIA_1] }],
      actor,
    );
    expect(mediaLink.syncOwner).toHaveBeenCalledWith(
      MediaOwnerType.PRODUCT,
      PRODUCT_ID,
      [MEDIA_1],
      actor,
      manager,
    );
    expect(res.updated).toEqual([{ id: PRODUCT_ID, code: 'PROD-A', imageCount: 1 }]);
  });
});
