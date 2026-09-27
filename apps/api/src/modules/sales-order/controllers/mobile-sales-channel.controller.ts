import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiTags } from '@nestjs/swagger';
import { Repository } from 'typeorm';
import { Actor, ActorContext } from '../../../common/decorators/actor-context.decorator';
import { RequireBranchScope, RequirePermission } from '../../auth/decorators';
import { BranchScopeGuard } from '../../rbac/branch-scope.guard';
import { PermissionGuard } from '../../rbac/permission.guard';
import { DeliveryPartnerEntity } from '../entities/delivery-partner.entity';
import { SalesChannelEntity } from '../entities/sales-channel.entity';
import { SALES_ORDER_PERMISSIONS } from '../sales-order.service';

export interface MobileSalesChannelItem {
  id: string;
  code: string;
  name: string;
}

export interface MobileDeliveryPartnerItem {
  id: string;
  code: string;
  name: string;
}

/**
 * Sidebar kênh của trang "Đơn hàng online" trên POS — kênh active của tổ chức.
 *
 * Guard giống `SalesOrderController`: POS luôn gửi `X-Branch-Id`, và quyền
 * `read` là quyền phạm vi chi nhánh. Kênh là dữ liệu cấp tổ chức nên chỉ lọc
 * theo `organizationId`.
 */
@ApiTags('mobile')
@Controller('mobile/sales-channels')
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class MobileSalesChannelController {
  constructor(
    @InjectRepository(SalesChannelEntity)
    private readonly channels: Repository<SalesChannelEntity>,
  ) {}

  @Get()
  @RequirePermission(SALES_ORDER_PERMISSIONS.read)
  list(@Actor() actor: ActorContext): Promise<MobileSalesChannelItem[]> {
    return this.channels.find({
      select: { id: true, code: true, name: true },
      where: { organizationId: actor.organizationId, isActive: true },
      order: { name: 'ASC' },
    });
  }
}

/**
 * Danh sách đối tác giao hàng cho dialog Giao hàng trên POS (AC-11) — đối tác
 * active của tổ chức. Cùng guard/quyền với sidebar kênh ở trên. Tách class riêng
 * (không gộp vào `MobileSalesChannelController`) để constructor của controller
 * kênh không đổi.
 */
@ApiTags('mobile')
@Controller('mobile/delivery-partners')
@UseGuards(PermissionGuard, BranchScopeGuard)
@RequireBranchScope()
export class MobileDeliveryPartnerController {
  constructor(
    @InjectRepository(DeliveryPartnerEntity)
    private readonly partners: Repository<DeliveryPartnerEntity>,
  ) {}

  @Get()
  @RequirePermission(SALES_ORDER_PERMISSIONS.read)
  list(@Actor() actor: ActorContext): Promise<MobileDeliveryPartnerItem[]> {
    return this.partners.find({
      select: { id: true, code: true, name: true },
      where: { organizationId: actor.organizationId, isActive: true },
      order: { name: 'ASC' },
    });
  }
}
