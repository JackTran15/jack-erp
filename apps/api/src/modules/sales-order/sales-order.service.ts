import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { DocumentType } from '@erp/shared-interfaces';
import type { ActorContext } from '../../common/decorators/actor-context.decorator';
import { CustomerEntity } from '../customer/customer.entity';
import { DocumentNumberingService } from '../document-numbering/document-numbering.service';
import { ItemEntity } from '../inventory/location/item.entity';
import { EmployeeProfileEntity } from '../rbac/employee/employee-profile.entity';
import { RbacService } from '../rbac/rbac.service';
import { CreateSalesOrderDto, SalesOrderLineDto } from './dto/create-sales-order.dto';
import { SalesOrderListQueryDto } from './dto/sales-order-list.query.dto';
import { SalesOrderLineEntity } from './entities/sales-order-line.entity';
import { SalesOrderEntity, SalesOrderStatus } from './entities/sales-order.entity';

export const SALES_ORDER_PERMISSIONS = {
  read: 'pos.sales-order.read',
  create: 'pos.sales-order.create',
  cancel: 'pos.sales-order.cancel',
  approve: 'pos.sales-order.approve',
  reject: 'pos.sales-order.reject',
} as const;

/** Kênh bán ghi trên mọi đơn từ app tư vấn — chuỗi hiển thị, chốt vào chứng từ. */
export const SALES_ORDER_CHANNEL = 'Ứng dụng Tư Vấn';

/** Chỉ `SENT` có lối ra; ba trạng thái kia là điểm cuối. */
const VALID_TRANSITIONS: Record<SalesOrderStatus, SalesOrderStatus[]> = {
  [SalesOrderStatus.SENT]: [SalesOrderStatus.PROCESSED, SalesOrderStatus.REJECTED, SalesOrderStatus.CANCELLED],
  [SalesOrderStatus.PROCESSED]: [],
  [SalesOrderStatus.REJECTED]: [],
  [SalesOrderStatus.CANCELLED]: [],
};

export interface SalesOrderLineView {
  id: string;
  itemId: string;
  code: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  manualDiscount: number;
  manualDiscountReason: string | null;
  promotionDiscount: number;
  promotionName: string | null;
  note: string | null;
  lineTotal: number;
}

export interface SalesOrderView {
  id: string;
  code: string;
  status: SalesOrderStatus;
  createdAt: Date;
  salespersonId: string;
  salespersonName: string;
  salesChannel: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  subtotal: number;
  discount: number;
  amountDue: number;
  note: string | null;
  rejectReason: string | null;
  lines: SalesOrderLineView[];
}

@Injectable()
export class SalesOrderService {
  private readonly logger = new Logger(SalesOrderService.name);

  constructor(
    @InjectRepository(SalesOrderEntity)
    private readonly orders: Repository<SalesOrderEntity>,
    @InjectRepository(SalesOrderLineEntity)
    private readonly lines: Repository<SalesOrderLineEntity>,
    @InjectRepository(EmployeeProfileEntity)
    private readonly profiles: Repository<EmployeeProfileEntity>,
    @InjectRepository(CustomerEntity)
    private readonly customers: Repository<CustomerEntity>,
    @InjectRepository(ItemEntity)
    private readonly items: Repository<ItemEntity>,
    private readonly dataSource: DataSource,
    private readonly numbering: DocumentNumberingService,
    private readonly rbac: RbacService,
  ) {}

  async create(dto: CreateSalesOrderDto, actor: ActorContext): Promise<SalesOrderView> {
    const branchId = this.branchOf(actor);
    const salesperson = await this.salespersonOf(actor);
    const prepared = await this.prepareLines(dto.lines, actor);
    const customer = await this.customerSnapshotOf(dto.customerId, actor);

    const saved = await this.dataSource.transaction(async (manager) => {
      // `manager` BẮT BUỘC: sinh số ngoài transaction là mượn connection thứ hai
      // và có thể khoá chết pool (doc tại DocumentNumberingService.generate).
      const documentNumber = await this.numbering.generate(DocumentType.SALES_ORDER, branchId, actor, manager);

      const order = manager.create(SalesOrderEntity, {
        organizationId: actor.organizationId,
        branchId,
        createdBy: actor.userId,
        documentNumber,
        status: SalesOrderStatus.SENT,
        salespersonId: salesperson.id,
        salespersonName: salesperson.name,
        salesChannel: SALES_ORDER_CHANNEL,
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? null,
        customerPhone: customer?.phone ?? null,
        note: dto.note ?? null,
        ...prepared.totals,
      });
      const persisted = await manager.save(SalesOrderEntity, order);
      await manager.save(
        SalesOrderLineEntity,
        prepared.lines.map((line) => manager.create(SalesOrderLineEntity, { ...line, salesOrderId: persisted.id })),
      );
      return persisted;
    });

    this.logger.log(`Sales order ${saved.documentNumber} created (org=${actor.organizationId}, branch=${branchId})`);
    return this.getById(saved.id, actor);
  }

  /** Sửa đơn còn `SENT` của CHÍNH mình — thay trọn dòng, giữ số chứng từ. */
  async update(id: string, dto: CreateSalesOrderDto, actor: ActorContext): Promise<SalesOrderView> {
    const salesperson = await this.salespersonOf(actor);
    const prepared = await this.prepareLines(dto.lines, actor);
    const customer = await this.customerSnapshotOf(dto.customerId, actor);

    await this.dataSource.transaction(async (manager) => {
      const current = await this.lockedOrder(manager, id, actor);
      if (current.salespersonId !== salesperson.id) {
        // 404 chứ không 403: không xác nhận sự tồn tại của đơn người khác.
        throw new NotFoundException(`Sales order ${id} not found`);
      }
      if (current.status !== SalesOrderStatus.SENT) {
        throw new ConflictException('Đơn hàng đã được xử lý, không sửa được nữa');
      }

      await manager.delete(SalesOrderLineEntity, { salesOrderId: id });
      await manager.save(
        SalesOrderLineEntity,
        prepared.lines.map((line) => manager.create(SalesOrderLineEntity, { ...line, salesOrderId: id })),
      );
      await manager.update(SalesOrderEntity, id, {
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? null,
        customerPhone: customer?.phone ?? null,
        note: dto.note ?? null,
        ...prepared.totals,
      });
    });

    return this.getById(id, actor);
  }

  async list(query: SalesOrderListQueryDto, actor: ActorContext) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const scope = await this.scopeOf(actor);

    const qb = this.orders
      .createQueryBuilder('so')
      .where('so.organizationId = :org', { org: actor.organizationId })
      .andWhere('so.branchId = :branch', { branch: this.branchOf(actor) });

    // Tư vấn thấy đơn CỦA MÌNH; người có quyền duyệt (thu ngân) thấy mọi đơn của
    // chi nhánh. Ép ở đây, không nhận từ query — cùng luật với `/mobile/invoices`.
    if (scope.salespersonId) {
      qb.andWhere('so.salespersonId = :sp', { sp: scope.salespersonId });
    }
    if (query.status) qb.andWhere('so.status = :status', { status: query.status });
    if (query.from) qb.andWhere('so.createdAt >= :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('so.createdAt <= :to', { to: new Date(query.to) });

    const [rows, total] = await qb
      .orderBy('so.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    const lines = rows.length
      ? await this.lines.find({ where: { salesOrderId: In(rows.map((r) => r.id)) }, order: { lineNo: 'ASC' } })
      : [];
    const linesByOrder = new Map<string, SalesOrderLineEntity[]>();
    for (const line of lines) {
      const bucket = linesByOrder.get(line.salesOrderId) ?? [];
      bucket.push(line);
      linesByOrder.set(line.salesOrderId, bucket);
    }

    return {
      data: rows.map((row) => this.toView(row, linesByOrder.get(row.id) ?? [])),
      total,
      page,
      limit,
    };
  }

  async getById(id: string, actor: ActorContext): Promise<SalesOrderView> {
    const order = await this.orders.findOne({ where: { id, organizationId: actor.organizationId } });
    const scope = await this.scopeOf(actor);

    if (!order || (scope.salespersonId && order.salespersonId !== scope.salespersonId)) {
      throw new NotFoundException(`Sales order ${id} not found`);
    }

    const lines = await this.lines.find({ where: { salesOrderId: id }, order: { lineNo: 'ASC' } });
    return this.toView(order, lines);
  }

  approve(id: string, actor: ActorContext): Promise<SalesOrderView> {
    return this.transition(id, actor, SalesOrderStatus.PROCESSED, {
      approvedBy: actor.userId,
      approvedAt: new Date(),
    });
  }

  reject(id: string, reason: string, actor: ActorContext): Promise<SalesOrderView> {
    return this.transition(id, actor, SalesOrderStatus.REJECTED, {
      rejectedBy: actor.userId,
      rejectedAt: new Date(),
      rejectReason: reason.trim(),
    });
  }

  /** Tư vấn huỷ đơn của CHÍNH mình khi còn `SENT`. */
  async cancel(id: string, actor: ActorContext): Promise<SalesOrderView> {
    const salesperson = await this.salespersonOf(actor);
    return this.transition(
      id,
      actor,
      SalesOrderStatus.CANCELLED,
      { cancelledBy: actor.userId, cancelledAt: new Date() },
      salesperson.id,
    );
  }

  private async transition(
    id: string,
    actor: ActorContext,
    target: SalesOrderStatus,
    patch: Partial<SalesOrderEntity>,
    ownerSalespersonId?: string,
  ): Promise<SalesOrderView> {
    await this.dataSource.transaction(async (manager) => {
      // Đọc CÓ KHOÁ: hai thu ngân bấm *Nhận xử lý* cùng lúc không được cùng thắng.
      const current = await this.lockedOrder(manager, id, actor);

      if (ownerSalespersonId && current.salespersonId !== ownerSalespersonId) {
        throw new NotFoundException(`Sales order ${id} not found`);
      }
      if (!VALID_TRANSITIONS[current.status].includes(target)) {
        throw new ConflictException(`Đơn hàng đã được xử lý (${current.status})`);
      }

      await manager.update(SalesOrderEntity, id, { ...patch, status: target });
    });

    return this.getById(id, actor);
  }

  private async lockedOrder(manager: EntityManager, id: string, actor: ActorContext): Promise<SalesOrderEntity> {
    const order = await manager
      .createQueryBuilder(SalesOrderEntity, 'so')
      .setLock('pessimistic_write')
      .where('so.id = :id AND so.organizationId = :org', { id, org: actor.organizationId })
      .getOne();
    if (!order) throw new NotFoundException(`Sales order ${id} not found`);
    return order;
  }

  /** `{ salespersonId }` khi phải thu hẹp về đơn của mình; `{}` khi thấy cả chi nhánh. */
  private async scopeOf(actor: ActorContext): Promise<{ salespersonId?: string }> {
    const canApprove = await this.rbac.hasPermission(actor.userId, actor.organizationId, SALES_ORDER_PERMISSIONS.approve);
    if (canApprove) return {};
    const profile = await this.profiles.findOne({
      where: { userId: actor.userId, organizationId: actor.organizationId },
      select: ['id'],
    });
    // Không có hồ sơ nhân viên thì không có đơn nào là "của mình" — id giả để
    // truy vấn trả rỗng thay vì trả cả chi nhánh.
    return { salespersonId: profile?.id ?? '00000000-0000-0000-0000-000000000000' };
  }

  private async salespersonOf(actor: ActorContext): Promise<{ id: string; name: string }> {
    const profile = await this.profiles.findOne({
      where: { userId: actor.userId, organizationId: actor.organizationId },
      relations: { user: true },
    });
    if (!profile) {
      throw new BadRequestException('Tài khoản chưa gắn hồ sơ nhân viên nên không gửi được đơn hàng');
    }
    const user = profile.user;
    const name = user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : '';
    return { id: profile.id, name: name || 'Nhân viên' };
  }

  private branchOf(actor: ActorContext): string {
    if (!actor.branchId) throw new BadRequestException('Thiếu chi nhánh (X-Branch-Id)');
    return actor.branchId;
  }

  private async customerSnapshotOf(customerId: string | undefined, actor: ActorContext) {
    if (!customerId) return null;
    const customer = await this.customers.findOne({
      where: { id: customerId, organizationId: actor.organizationId },
      select: ['id', 'name', 'phone'],
    });
    if (!customer) throw new BadRequestException('Khách hàng không tồn tại trong tổ chức');
    return { id: customer.id, name: customer.name, phone: customer.phone ?? null };
  }

  private async prepareLines(dtoLines: SalesOrderLineDto[], actor: ActorContext) {
    if (!dtoLines?.length) throw new BadRequestException('Đơn hàng phải có ít nhất một dòng hàng');

    const itemIds = [...new Set(dtoLines.map((l) => l.itemId))];
    const found = await this.items.find({
      where: { id: In(itemIds), organizationId: actor.organizationId },
      select: ['id'],
    });
    const missing = itemIds.filter((id) => !found.some((f) => f.id === id));
    if (missing.length) {
      throw new BadRequestException(`Hàng hoá không tồn tại trong tổ chức: ${missing.join(', ')}`);
    }

    let subtotal = 0;
    let discount = 0;
    const lines = dtoLines.map((line, index) => {
      const lineTotal = line.quantity * line.unitPrice;
      const manual = line.manualDiscount ?? 0;
      const promotion = line.promotionDiscount ?? 0;
      if (manual + promotion > lineTotal) {
        throw new BadRequestException(`Giảm giá vượt thành tiền ở dòng ${index + 1}`);
      }
      subtotal += lineTotal;
      discount += manual + promotion;
      return {
        lineNo: index + 1,
        itemId: line.itemId,
        itemCode: line.itemCode,
        itemName: line.itemName,
        unit: line.unit,
        quantity: String(line.quantity),
        unitPrice: String(line.unitPrice),
        manualDiscount: String(manual),
        manualDiscountReason: line.manualDiscountReason ?? null,
        promotionDiscount: String(promotion),
        promotionName: line.promotionName ?? null,
        note: line.note ?? null,
        lineTotal: String(lineTotal),
      };
    });

    return {
      lines,
      totals: { subtotal: String(subtotal), discount: String(discount), amountDue: String(subtotal - discount) },
    };
  }

  private toView(order: SalesOrderEntity, lines: SalesOrderLineEntity[]): SalesOrderView {
    return {
      id: order.id,
      code: order.documentNumber,
      status: order.status,
      createdAt: order.createdAt,
      salespersonId: order.salespersonId,
      salespersonName: order.salespersonName,
      salesChannel: order.salesChannel,
      customerId: order.customerId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      subtotal: Number(order.subtotal),
      discount: Number(order.discount),
      amountDue: Number(order.amountDue),
      note: order.note,
      rejectReason: order.rejectReason,
      lines: lines.map((line) => ({
        id: line.id,
        itemId: line.itemId,
        code: line.itemCode,
        name: line.itemName,
        unit: line.unit,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        manualDiscount: Number(line.manualDiscount),
        manualDiscountReason: line.manualDiscountReason,
        promotionDiscount: Number(line.promotionDiscount),
        promotionName: line.promotionName,
        note: line.note,
        lineTotal: Number(line.lineTotal),
      })),
    };
  }
}
