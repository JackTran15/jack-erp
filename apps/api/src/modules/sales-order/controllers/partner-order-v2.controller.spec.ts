import { BadRequestException, ForbiddenException, HttpStatus, NotFoundException } from '@nestjs/common';
import { Request, Response } from 'express';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { PartnerOrderV2Controller } from './partner-order-v2.controller';
import { CHANNEL_INACTIVE, GEO_CODE_UNKNOWN } from '../sales-order.constants';
import { PartnerCreateOrderDto } from '../dto/partner-create-order.dto';

/**
 * Cửa GHI cho đối tác — bốn AC ở ticket này chỉ chứng minh được bằng `curl`
 * thủ công, nên đây là lưới an toàn duy nhất. Quan trọng nhất: chặn chéo tổ
 * chức ở `resolveChannel` — một dòng không có test nào khác và dễ bị xoá
 * lặng lẽ trong một lần refactor sau này (AC-02).
 */
describe('PartnerOrderV2Controller', () => {
  const actor: ActorContext = {
    userId: 'user-1',
    organizationId: 'org-1',
    branchId: 'branch-1',
    roles: [],
  } as ActorContext;

  const dto = {
    shipping: { provinceCode: 'P01', wardCode: 'W01' },
  } as unknown as PartnerCreateOrderDto;

  const channelOfOrg1 = { id: 'chan-1', organizationId: 'org-1', isActive: true };

  function makeReq(salesChannelId: string | null | undefined): Request {
    return { user: { salesChannelId } } as unknown as Request;
  }

  function makeRes(): Response {
    return { status: jest.fn() } as unknown as Response;
  }

  function makeController(overrides?: {
    createFromPartner?: jest.Mock;
    findProvince?: jest.Mock;
    findWard?: jest.Mock;
    findOne?: jest.Mock;
  }) {
    const service = {
      createFromPartner:
        overrides?.createFromPartner ??
        jest.fn().mockResolvedValue({
          id: 'order-1',
          documentNumber: 'SO-1',
          status: 'PENDING',
          amountDue: 100,
          shippingFee: 0,
          lines: [],
          replayed: false,
        }),
    };
    const geo = {
      findProvince: overrides?.findProvince ?? jest.fn().mockResolvedValue({ name: 'Tỉnh A' }),
      findWard: overrides?.findWard ?? jest.fn().mockResolvedValue({ name: 'Phường B' }),
    };
    const channels = {
      findOne: overrides?.findOne ?? jest.fn().mockResolvedValue(channelOfOrg1),
    };
    const controller = new PartnerOrderV2Controller(
      service as never,
      geo as never,
      channels as never,
    );
    return { controller, service, geo, channels };
  }

  // AC-02 — chặn chéo tổ chức
  describe('resolveChannel — chặn chéo tổ chức (AC-02)', () => {
    it('kênh tồn tại nhưng thuộc tổ chức khác → 403 CHANNEL_INACTIVE, không gọi service', async () => {
      const findOne = jest.fn().mockResolvedValue(null); // repo lọc theo cả id + organizationId nên trả null
      const { controller, service, channels } = makeController({ findOne });

      await expect(
        controller.create(dto, actor, makeReq('chan-of-other-org'), makeRes()),
      ).rejects.toMatchObject({
        response: { code: CHANNEL_INACTIVE },
      });

      expect(channels.findOne).toHaveBeenCalledWith({
        where: { id: 'chan-of-other-org', organizationId: 'org-1' },
      });
      expect(service.createFromPartner).not.toHaveBeenCalled();
    });

    it('không tồn tại kênh với id đó → 403 CHANNEL_INACTIVE, không gọi service', async () => {
      const findOne = jest.fn().mockResolvedValue(null);
      const { controller, service } = makeController({ findOne });

      await expect(
        controller.create(dto, actor, makeReq('chan-unknown'), makeRes()),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.createFromPartner).not.toHaveBeenCalled();
    });

    it('key không gắn kênh nào (salesChannelId null) → 403 CHANNEL_INACTIVE, không gọi service, không truy repo', async () => {
      const { controller, service, channels } = makeController();

      await expect(
        controller.create(dto, actor, makeReq(null), makeRes()),
      ).rejects.toMatchObject({
        response: { code: CHANNEL_INACTIVE },
      });

      expect(channels.findOne).not.toHaveBeenCalled();
      expect(service.createFromPartner).not.toHaveBeenCalled();
    });

    it('kênh đúng tổ chức → cho qua, service được gọi với channel đó', async () => {
      const { controller, service } = makeController();

      await controller.create(dto, actor, makeReq('chan-1'), makeRes());

      expect(service.createFromPartner).toHaveBeenCalledWith(
        dto,
        channelOfOrg1,
        actor,
        expect.any(Object),
      );
    });
  });

  // AC-07 — geo resolution
  describe('resolveGeo (AC-07)', () => {
    it('wardCode không tồn tại (NotFoundException) → 400 GEO_CODE_UNKNOWN, không gọi service', async () => {
      const findWard = jest.fn().mockRejectedValue(new NotFoundException());
      const { controller, service } = makeController({ findWard });

      await expect(
        controller.create(dto, actor, makeReq('chan-1'), makeRes()),
      ).rejects.toMatchObject({
        response: { code: GEO_CODE_UNKNOWN },
      });
      await expect(
        controller.create(dto, actor, makeReq('chan-1'), makeRes()),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(service.createFromPartner).not.toHaveBeenCalled();
    });

    it('provinceCode không tồn tại (NotFoundException) → 400 GEO_CODE_UNKNOWN, không gọi findWard', async () => {
      const findProvince = jest.fn().mockRejectedValue(new NotFoundException());
      const findWard = jest.fn();
      const { controller, service } = makeController({ findProvince, findWard });

      await expect(
        controller.create(dto, actor, makeReq('chan-1'), makeRes()),
      ).rejects.toMatchObject({
        response: { code: GEO_CODE_UNKNOWN },
      });
      expect(findWard).not.toHaveBeenCalled();
      expect(service.createFromPartner).not.toHaveBeenCalled();
    });

    it('lỗi khác NotFoundException (vd. lỗi kết nối) được ném nguyên vẹn, không bị nuốt thành GEO_CODE_UNKNOWN', async () => {
      const dbError = new Error('connection refused');
      const findProvince = jest.fn().mockRejectedValue(dbError);
      const { controller, service } = makeController({ findProvince });

      await expect(
        controller.create(dto, actor, makeReq('chan-1'), makeRes()),
      ).rejects.toBe(dbError);
      expect(service.createFromPartner).not.toHaveBeenCalled();
    });
  });

  // AC-06-adjacent — replayed / status code
  describe('mã trạng thái theo `result.replayed`', () => {
    it('replayed=true → set status 200 (OK)', async () => {
      const createFromPartner = jest.fn().mockResolvedValue({
        id: 'order-1',
        documentNumber: 'SO-1',
        status: 'PENDING',
        amountDue: 100,
        shippingFee: 0,
        lines: [],
        replayed: true,
      });
      const { controller } = makeController({ createFromPartner });
      const res = makeRes();

      await controller.create(dto, actor, makeReq('chan-1'), res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
    });

    it('replayed=false → không gọi res.status (giữ mặc định 201)', async () => {
      const createFromPartner = jest.fn().mockResolvedValue({
        id: 'order-1',
        documentNumber: 'SO-1',
        status: 'PENDING',
        amountDue: 100,
        shippingFee: 0,
        lines: [],
        replayed: false,
      });
      const { controller } = makeController({ createFromPartner });
      const res = makeRes();

      await controller.create(dto, actor, makeReq('chan-1'), res);

      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
