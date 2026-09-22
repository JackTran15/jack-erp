import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  Res,
  UseGuards,
  Version,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Repository } from 'typeorm';
import {
  Actor,
  ActorContext,
} from '../../../common/decorators/actor-context.decorator';
import { RequirePermission } from '../../auth/decorators';
import { PermissionGuard } from '../../rbac/permission.guard';
import { GeoService } from '../../geo/geo.service';
import {
  PartnerCreateOrderDto,
  PartnerCreateOrderResponseDto,
  PartnerOrderShippingDto,
} from '../dto/partner-create-order.dto';
import { SalesChannelEntity } from '../entities/sales-channel.entity';
import {
  CHANNEL_INACTIVE,
  GEO_CODE_UNKNOWN,
  PARTNER_ORDER_PERMISSION,
} from '../sales-order.constants';
import { SalesOrderService } from '../sales-order.service';

/**
 * Hình dạng phần `request.user` mà `AuthGuard` dựng cho một request API key
 * (T-01-06). `@Actor()` KHÔNG mang `salesChannelId` sang `ActorContext` — nó chỉ
 * lấy các trường chung cho cả JWT lẫn API key — nên kênh phải đọc thẳng từ
 * request ở đây.
 */
interface ApiKeyRequestUser {
  salesChannelId?: string | null;
}

/**
 * Cửa GHI cho đối tác — bản song sinh của `PartnerProductV2Controller` (cửa đọc).
 *
 * Cùng khuôn: `@ApiSecurity('api-key')` + `@UseGuards(PermissionGuard)` + đúng
 * MỘT quyền. Quyền ở đây là `partner.order.create`, tách hẳn
 * `partner.catalog.read`: một key chỉ để website đọc danh mục thì không được đặt
 * đơn. Không `@Public()` — guard api-key là thứ chặn.
 *
 * Đặt trong module `sales-order` chứ không tạo module mới: nó gọi thẳng
 * `SalesOrderService`, tách module chỉ để đổi tiền tố route là chia đôi một
 * service (ADR-01/ADR-07).
 */
@ApiTags('Partner orders')
@ApiSecurity('api-key')
@Controller('partner/orders')
@UseGuards(PermissionGuard)
export class PartnerOrderV2Controller {
  constructor(
    private readonly service: SalesOrderService,
    private readonly geo: GeoService,
    @InjectRepository(SalesChannelEntity)
    private readonly channels: Repository<SalesChannelEntity>,
  ) {}

  @Post()
  @Version('2')
  @RequirePermission(PARTNER_ORDER_PERMISSION)
  @ApiOperation({
    summary: 'Đối tác đặt đơn — đơn rơi vào pool chưa phân chi nhánh',
    description:
      'Kênh bán lấy từ cấu hình của API key, KHÔNG từ payload. Đơn giá do ' +
      'server chốt từ `items.selling_price` lúc nhận đơn — payload không có ' +
      'chỗ cho `unitPrice` và gửi kèm là 400 (`forbidNonWhitelisted`).',
  })
  @ApiCreatedResponse({
    description: 'Đơn mới được tạo',
    type: PartnerCreateOrderResponseDto,
  })
  @ApiOkResponse({
    description:
      '`externalOrderId` đã tồn tại trên kênh này — trả lại đúng đơn cũ, ' +
      'không tạo đơn thứ hai (AC-06)',
    type: PartnerCreateOrderResponseDto,
  })
  @ApiBadRequestResponse({
    description: '`GEO_CODE_UNKNOWN`, `ORDER_LINE_ITEM_UNKNOWN`, hoặc payload sai khuôn',
  })
  @ApiForbiddenResponse({
    description: '`CHANNEL_INACTIVE` — key không gắn kênh dùng được',
  })
  async create(
    @Body() dto: PartnerCreateOrderDto,
    @Actor() actor: ActorContext,
    @Req() request: Request,
    // `passthrough: true` để Nest vẫn serialize kết quả và các interceptor toàn
    // cục (idempotency) vẫn thấy body; chỉ mã trạng thái là do ta đặt.
    @Res({ passthrough: true }) res: Response,
  ): Promise<PartnerCreateOrderResponseDto> {
    const channel = await this.resolveChannel(actor, request);
    const geo = await this.resolveGeo(dto.shipping);

    const result = await this.service.createFromPartner(dto, channel, actor, geo);

    // 200 khi đây là lần gửi lại, 201 khi đơn thật sự mới (AC-06). Nest 11 đặt
    // mã mặc định TRƯỚC khi handler chạy và không ghi đè lại lúc trả lời, nên
    // `res.status()` ở đây là mã cuối cùng.
    if (result.replayed) {
      res.status(HttpStatus.OK);
    }

    return {
      id: result.id,
      documentNumber: result.documentNumber,
      status: result.status,
      amountDue: result.amountDue,
      shippingFee: result.shippingFee,
      lines: result.lines.map((line) => ({
        itemId: line.itemId,
        itemCode: line.itemCode,
        itemName: line.itemName,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
      })),
    };
  }

  /**
   * Kênh của đơn = kênh gắn trên API key, không bao giờ từ payload (nếu đối tác
   * chọn được kênh thì một key rò ra ngoài ghi được đơn vào mọi kênh).
   *
   * `findOne` lọc theo CẢ `id` LẪN `organizationId`, và đó là chỗ duy nhất
   * chặn chéo tổ chức: khi gắn kênh cho key, FK chỉ chứng minh kênh TỒN TẠI,
   * không chứng minh nó thuộc tổ chức của key — một admin gõ nhầm (hoặc cố ý)
   * id kênh của tổ chức khác thì ràng buộc DB vẫn cho qua. Ở đây nó fail
   * closed.
   *
   * Ba trường hợp — key không gắn kênh, kênh không tồn tại, kênh của tổ chức
   * khác — trả về CÙNG một 403 `CHANNEL_INACTIVE`: phân biệt chúng là cho đối
   * tác dò xem id kênh nào có thật.
   */
  private async resolveChannel(
    actor: ActorContext,
    request: Request,
  ): Promise<SalesChannelEntity> {
    const user = (request as unknown as { user?: ApiKeyRequestUser }).user;
    const salesChannelId = user?.salesChannelId;
    if (!salesChannelId) {
      throw new ForbiddenException({
        code: CHANNEL_INACTIVE,
        message: 'Kênh bán đã ngừng hoạt động',
      });
    }

    const channel = await this.channels.findOne({
      where: { id: salesChannelId, organizationId: actor.organizationId },
    });
    if (!channel) {
      throw new ForbiddenException({
        code: CHANNEL_INACTIVE,
        message: 'Kênh bán đã ngừng hoạt động',
      });
    }

    // `isActive === false` vẫn để `createFromPartner` ném — một chỗ quyết định,
    // không hai.
    return channel;
  }

  /**
   * Tra tên tỉnh/phường để CHỐT xuống đơn (ADR-05: đơn giữ snapshot tên, không
   * FK sang `geo_*`).
   *
   * `GeoService` ném `NotFoundException` vì đường đọc `/v2/geo/*` của nó hỏi
   * một tài nguyên. Ở đây mã sai nằm trong payload đối tác gửi, nên phải là
   * 400 `GEO_CODE_UNKNOWN` — để 404 lọt ra là nói dối đối tác về chỗ sai.
   *
   * Tra tuần tự, không `Promise.all`: `Promise.all` để lại một promise bị từ
   * chối không ai bắt khi cả hai mã đều sai.
   */
  private async resolveGeo(
    shipping: PartnerOrderShippingDto,
  ): Promise<{ provinceName: string; wardName: string }> {
    try {
      const province = await this.geo.findProvince(shipping.provinceCode);
      // Truyền `provinceCode` để phường phải thuộc đúng tỉnh đối tác khai;
      // lệch tỉnh cũng là mã không dùng được.
      const ward = await this.geo.findWard(shipping.wardCode, shipping.provinceCode);
      return { provinceName: province.name, wardName: ward.name };
    } catch (err) {
      // CHỈ đổi "không tìm thấy". Một lỗi kết nối DB mà thành 400
      // `GEO_CODE_UNKNOWN` là đổ lỗi sai cho đối tác và giấu sự cố của ta.
      if (err instanceof NotFoundException) {
        throw new BadRequestException({
          code: GEO_CODE_UNKNOWN,
          message: 'Mã tỉnh/thành hoặc phường/xã không tồn tại',
        });
      }
      throw err;
    }
  }
}
