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
import { UserBranchAssignmentEntity } from '../branch/user-branch-assignment.entity';
import { CustomerEntity } from '../customer/customer.entity';
import { DocumentNumberingService } from '../document-numbering/document-numbering.service';
import { ItemEntity } from '../inventory/location/item.entity';
import type { CreateInvoiceDto } from '../pos/dto/create-invoice.dto';
import { InvoiceEntity } from '../pos/entities/invoice.entity';
import { InvoiceService } from '../pos/services/invoice.service';
import { PosSessionService } from '../pos/services/pos-session.service';
import { EmployeeProfileEntity } from '../rbac/employee/employee-profile.entity';
import { RbacService } from '../rbac/rbac.service';
import { PointsRedemptionService } from '../pos/services/points-redemption.service';
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
  [SalesOrderStatus.DRAFT]: [SalesOrderStatus.SENT, SalesOrderStatus.CANCELLED],
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
  cancelReason: string | null;
  /** Điểm tích luỹ DỰ KIẾN dùng — chưa trừ; thu ngân chốt lúc *Nhận xử lý*. */
  pointsRedeemed: number;
  /** Lựa chọn CTKM của tư vấn (ADR-52) — app nạp lại khi sửa đơn. */
  selectedProgramIds: string[];
  excludedProgramIds: string[];
  /** Hoá đơn nháp do `approve` tạo (ADR-32); null khi chưa nhận xử lý. */
  invoiceId: string | null;
  invoiceCode: string | null;
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
    @InjectRepository(InvoiceEntity)
    private readonly invoices: Repository<InvoiceEntity>,
    private readonly dataSource: DataSource,
    private readonly numbering: DocumentNumberingService,
    private readonly rbac: RbacService,
    private readonly invoiceService: InvoiceService,
    private readonly posSessions: PosSessionService,
    private readonly points: PointsRedemptionService,
  ) {}

  async create(dto: CreateSalesOrderDto, actor: ActorContext): Promise<SalesOrderView> {
    const branchId = this.branchOf(actor);
    const salesperson = dto.salespersonId
      ? await this.salespersonById(dto.salespersonId, actor)
      : await this.salespersonOf(actor);
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
        status: dto.isDraft ? SalesOrderStatus.DRAFT : SalesOrderStatus.SENT,
        salespersonId: salesperson.id,
        salespersonName: salesperson.name,
        salesChannel: SALES_ORDER_CHANNEL,
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? null,
        customerPhone: customer?.phone ?? null,
        note: dto.note ?? null,
        // Điểm DỰ KIẾN — chỉ GHI LẠI, không trừ và không đụng `amountDue`.
        // Vắng khoá nghĩa là không dùng điểm, nên `?? 0` chứ không giữ giá trị cũ:
        // `update` thay TRỌN đơn, và một con số điểm sống sót qua một lượt sửa
        // không nhắc tới nó là một ưu đãi không ai còn nhớ đã đặt.
        pointsRedeemed: dto.pointsRedeemed ?? 0,
        // Cùng luật "thay TRỌN": vắng khoá = không chọn gì, không giữ lựa chọn cũ.
        selectedProgramIds: dto.selectedProgramIds ?? [],
        excludedProgramIds: dto.excludedProgramIds ?? [],
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

  /**
   * Sửa đơn của CHÍNH mình khi còn `DRAFT` hoặc `SENT` — thay trọn dòng, giữ số
   * chứng từ. `DRAFT` + `isDraft: false` là GỬI; `SENT` + `isDraft: true` bị từ
   * chối: đơn đã tới thu ngân không rút về lưu tạm được.
   */
  async update(id: string, dto: CreateSalesOrderDto, actor: ActorContext): Promise<SalesOrderView> {
    const me = await this.salespersonOf(actor);
    const salesperson = dto.salespersonId ? await this.salespersonById(dto.salespersonId, actor) : me;
    const prepared = await this.prepareLines(dto.lines, actor);
    const customer = await this.customerSnapshotOf(dto.customerId, actor);

    await this.dataSource.transaction(async (manager) => {
      const current = await this.lockedOrder(manager, id, actor);
      if (!this.isOwn(current, me.id, actor)) {
        // 404 chứ không 403: không xác nhận sự tồn tại của đơn người khác.
        throw new NotFoundException(`Sales order ${id} not found`);
      }
      if (current.status !== SalesOrderStatus.SENT && current.status !== SalesOrderStatus.DRAFT) {
        throw new ConflictException('Đơn hàng đã được xử lý, không sửa được nữa');
      }
      if (current.status === SalesOrderStatus.SENT && dto.isDraft) {
        throw new BadRequestException('Đơn đã gửi không lưu tạm lại được');
      }

      await manager.delete(SalesOrderLineEntity, { salesOrderId: id });
      await manager.save(
        SalesOrderLineEntity,
        prepared.lines.map((line) => manager.create(SalesOrderLineEntity, { ...line, salesOrderId: id })),
      );
      await manager.update(SalesOrderEntity, id, {
        status: dto.isDraft ? SalesOrderStatus.DRAFT : SalesOrderStatus.SENT,
        salespersonId: salesperson.id,
        salespersonName: salesperson.name,
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? null,
        customerPhone: customer?.phone ?? null,
        note: dto.note ?? null,
        // Điểm DỰ KIẾN — chỉ GHI LẠI, không trừ và không đụng `amountDue`.
        // Vắng khoá nghĩa là không dùng điểm, nên `?? 0` chứ không giữ giá trị cũ:
        // `update` thay TRỌN đơn, và một con số điểm sống sót qua một lượt sửa
        // không nhắc tới nó là một ưu đãi không ai còn nhớ đã đặt.
        pointsRedeemed: dto.pointsRedeemed ?? 0,
        // Cùng luật "thay TRỌN": vắng khoá = không chọn gì, không giữ lựa chọn cũ.
        selectedProgramIds: dto.selectedProgramIds ?? [],
        excludedProgramIds: dto.excludedProgramIds ?? [],
        ...prepared.totals,
      });
    });

    return this.getById(id, actor);
  }

  /**
   * Nhân viên của CHI NHÁNH hiện tại để gắn vào đơn: có hồ sơ, tài khoản đang
   * hoạt động, được phân vào chi nhánh (`user_branch_assignments`).
   */
  async salespeople(query: { page?: number; limit?: number; search?: string }, actor: ActorContext) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.profiles
      .createQueryBuilder('profile')
      .innerJoin('profile.user', 'user')
      .innerJoin(
        UserBranchAssignmentEntity,
        'uba',
        // So sánh qua TEXT ở cả hai vế: bảng này lưu uuid thật còn `employee_profiles`
        // /`users` trộn uuid với varchar tuỳ cột (đo 2026-09-13) — để Postgres tự suy
        // kiểu là `operator does not exist: character varying = uuid`.
        'CAST(uba.userId AS text) = CAST(user.id AS text) AND CAST(uba.branchId AS text) = :branch AND CAST(uba.organizationId AS text) = :org',
        { branch: this.branchOf(actor), org: actor.organizationId },
      )
      .where('profile.organizationId = :org', { org: actor.organizationId })
      .andWhere('user.isActive = true');

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        "(profile.code ILIKE :q OR user.firstName ILIKE :q OR user.lastName ILIKE :q OR (user.firstName || ' ' || user.lastName) ILIKE :q OR profile.mobile ILIKE :q)",
        { q: `%${search.replace(/[%_]/g, (c) => `\\${c}`)}%` },
      );
    }

    const [rows, total] = await qb
      .select(['profile.id', 'profile.code', 'profile.mobile', 'user.firstName', 'user.lastName'])
      .orderBy('user.lastName', 'ASC')
      .addOrderBy('user.firstName', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data: rows.map((profile) => ({
        id: profile.id,
        code: profile.code,
        name: `${profile.user?.firstName ?? ''} ${profile.user?.lastName ?? ''}`.trim(),
        phone: profile.mobile ?? null,
      })),
      total,
      page,
      limit,
    };
  }

  async list(query: SalesOrderListQueryDto, actor: ActorContext) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const scope = await this.scopeOf(actor);
    const mine = await this.profileIdOf(actor);
    const own = '(so.salespersonId = :sp OR so.createdBy = :me)';
    const ownParams = { sp: mine ?? '00000000-0000-0000-0000-000000000000', me: actor.userId };

    const qb = this.orders
      .createQueryBuilder('so')
      .where('so.organizationId = :org', { org: actor.organizationId })
      .andWhere('so.branchId = :branch', { branch: this.branchOf(actor) });

    // Tư vấn thấy đơn CỦA MÌNH (ghi công bán cho mình, hoặc do mình tạo cho
    // người khác); người có quyền duyệt (thu ngân) thấy mọi đơn của chi nhánh
    // — trừ đơn LƯU TẠM, thứ riêng của người gửi. Ép ở đây, không nhận từ
    // query — cùng luật với `/mobile/invoices`.
    if (scope.salespersonId) {
      qb.andWhere(own, ownParams);
    }
    if (query.status === SalesOrderStatus.DRAFT) {
      // Đơn LƯU TẠM luôn là "của mình", kể cả với người có quyền duyệt: thu ngân
      // cũng có giỏ riêng, và không ai được thấy giỏ dở của người khác. (Lượt e2e
      // 2026-09-13 đỏ đúng ở đây: tài khoản test có quyền duyệt nên bị loại
      // draft của chính nó.)
      qb.andWhere(own, ownParams).andWhere('so.status = :status', { status: SalesOrderStatus.DRAFT });
    } else if (query.status) {
      qb.andWhere('so.status = :status', { status: query.status });
    } else {
      // Không lọc = "lịch sử": đơn lưu tạm có màn riêng, không trộn vào đây.
      qb.andWhere('so.status <> :draft', { draft: SalesOrderStatus.DRAFT });
    }
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

    if (!order || (scope.salespersonId && !this.isOwn(order, scope.salespersonId, actor))) {
      throw new NotFoundException(`Sales order ${id} not found`);
    }
    if (!scope.salespersonId && order.status === SalesOrderStatus.DRAFT) {
      // Người có quyền duyệt vẫn chỉ thấy đơn lưu tạm CỦA MÌNH.
      const mine = await this.profileIdOf(actor);
      if (!this.isOwn(order, mine ?? '', actor)) throw new NotFoundException(`Sales order ${id} not found`);
    }

    const lines = await this.lines.find({ where: { salesOrderId: id }, order: { lineNo: 'ASC' } });
    // Chỉ ở đường CHI TIẾT mới tra mã hoá đơn — danh sách không N+1.
    const invoice = order.invoiceId
      ? await this.invoices.findOne({ where: { id: order.invoiceId, organizationId: actor.organizationId }, select: ['id', 'code'] })
      : null;
    return this.toView(order, lines, invoice?.code ?? null);
  }

  /**
   * *Nhận xử lý* (thu ngân). Trong CÙNG một giao dịch, đọc có khoá (ADR-32):
   * 1. đơn phải còn `SENT`;
   * 2. chi nhánh của đơn phải có phiên POS đang mở — không có thì 409 mã
   *    `NO_OPEN_SESSION`, đơn KHÔNG đổi trạng thái, app đưa sang màn Mở ca (ADR-31);
   * 3. tạo hoá đơn NHÁP từ dòng đơn (giá, giảm tay + KM đã chốt, khách, NVBH);
   * 4. ghi liên kết hai chiều và `PROCESSED`.
   *
   * Không FK giữa hai bảng: huỷ nháp sau đó chỉ dọn `invoice_id` về null (A-55).
   */
  /// Sửa số điểm DỰ KIẾN của một đơn còn `SENT`.
  ///
  /// Không đi qua {@link update}: đường kia đòi quyền TẠO đơn (của vai tư vấn),
  /// mà thu ngân cũng phải sửa được con số này — khi *Nhận xử lý* bị chặn vì
  /// khách đã tiêu bớt điểm ở nơi khác, sửa tay ngay tại chỗ là lối ra. Nới
  /// quyền của cả đường sửa đơn để phục vụ một trường là cho thu ngân sửa luôn
  /// dòng hàng và giá.
  ///
  /// Không kiểm số dư ở đây: số dư đổi được bất cứ lúc nào giữa bây giờ và lúc
  /// duyệt, nên một phép kiểm tại đây chỉ là một lời hứa hết hạn ngay. Nơi kiểm
  /// THẬT là {@link approve}, dưới khoá hàng thẻ.
  async setPoints(id: string, points: number, actor: ActorContext): Promise<SalesOrderView> {
    await this.dataSource.transaction(async (manager) => {
      const current = await this.lockedOrder(manager, id, actor);
      if (current.status !== SalesOrderStatus.SENT && current.status !== SalesOrderStatus.DRAFT) {
        throw new ConflictException(`Đơn hàng đã được xử lý (${current.status})`);
      }

      await manager.update(SalesOrderEntity, id, { pointsRedeemed: points });
    });

    return this.getById(id, actor);
  }

  async approve(id: string, actor: ActorContext): Promise<SalesOrderView> {
    await this.dataSource.transaction(async (manager) => {
      const current = await this.lockedOrder(manager, id, actor);
      if (!VALID_TRANSITIONS[current.status].includes(SalesOrderStatus.PROCESSED)) {
        throw new ConflictException(`Đơn hàng đã được xử lý (${current.status})`);
      }

      if (!current.branchId) throw new BadRequestException(`Sales order ${id} has no branch`);
      const session = await this.posSessions.findOpenForBranch(current.branchId, actor, manager);
      const lines = await manager.find(SalesOrderLineEntity, { where: { salesOrderId: id }, order: { lineNo: 'ASC' } });

      const dto: CreateInvoiceDto = {
        sessionId: session.id,
        customerId: current.customerId ?? undefined,
        salespersonId: current.salespersonId,
        note: current.note ?? undefined,
        items: lines.map((line, index) => ({
          itemId: line.itemId,
          itemCode: line.itemCode,
          itemName: line.itemName,
          unit: line.unit,
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          // CHỈ giảm tay (ADR-50). Checkout saga coi `lineDiscount` là giảm tay
          // rồi tự chạy engine KM lại lúc thu; gộp KM của đơn vào đây là trừ KM
          // hai lần (A-87). KM của đơn chỉ còn là con số tư vấn XEM lúc lập đơn —
          // lựa chọn CTKM đi theo đơn qua `selected/excludedProgramIds`.
          lineDiscount: Number(line.manualDiscount),
          lineDiscountReason: line.manualDiscountReason || undefined,
          note: line.note ?? undefined,
          sortOrder: index,
        })),
      };
      // Hoá đơn thuộc chi nhánh của ĐƠN, không phải chi nhánh trong header của người bấm.
      const draft = await this.invoiceService.createDraftIn(manager, dto, { ...actor, branchId: current.branchId });
      // Kênh bán chép sang hoá đơn (T-16-01) — màn Thu tiền đọc/đổi ngay trên hoá đơn.
      await manager.update(InvoiceEntity, draft.id, { salesOrderId: id, salesChannel: current.salesChannel });
      // Điểm DỰ KIẾN của tư vấn → trừ THẬT, ngay tại đây và trong CÙNG
      // transaction với lượt tạo hoá đơn nháp.
      //
      // Thiếu điểm thì ném, và cả lượt duyệt cuộn lại: đơn ở nguyên `SENT`,
      // KHÔNG có hoá đơn nháp nào sinh ra. Đó là nghĩa của "chặn" mà Loc chốt —
      // một lượt duyệt nửa vời để lại đơn đã PROCESSED cạnh một hoá đơn chưa
      // được giảm, và không ai dọn được trạng thái đó.
      //
      // `applyRedemptionIn` chứ không `applyRedemption`: bản kia đọc ghi qua
      // repository, tức một kết nối khác, và nó sẽ chặn trên chính hàng mà
      // transaction này đang khoá.
      const points = Number(current.pointsRedeemed ?? 0);
      if (points > 0) {
        await this.points.applyRedemptionIn(manager, draft.id, points, { ...actor, branchId: current.branchId });
      }

      await manager.update(SalesOrderEntity, id, {
        status: SalesOrderStatus.PROCESSED,
        approvedBy: actor.userId,
        approvedAt: new Date(),
        invoiceId: draft.id,
      });
      this.logger.log(`Sales order ${id} approved → draft invoice ${draft.id} (session=${session.id}, org=${actor.organizationId})`);
    });

    return this.getById(id, actor);
  }

  reject(id: string, reason: string, actor: ActorContext): Promise<SalesOrderView> {
    return this.transition(id, actor, SalesOrderStatus.REJECTED, {
      rejectedBy: actor.userId,
      rejectedAt: new Date(),
      rejectReason: reason.trim(),
    });
  }

  /**
   * Tư vấn huỷ đơn của CHÍNH mình khi còn `DRAFT` hoặc `SENT`, kèm lý do (MISA:
   * hộp thoại "Lý do hủy"). Đơn lưu tạm cũng HUỶ chứ không xoá — Loc chốt
   * 2026-09-13 — nên nó vẫn còn trong lịch sử ở "Đã huỷ".
   */
  async cancel(id: string, reason: string | undefined, actor: ActorContext): Promise<SalesOrderView> {
    const salesperson = await this.salespersonOf(actor);
    return this.transition(
      id,
      actor,
      SalesOrderStatus.CANCELLED,
      { cancelledBy: actor.userId, cancelledAt: new Date(), cancelReason: reason?.trim() || null },
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

      if (ownerSalespersonId && !this.isOwn(current, ownerSalespersonId, actor)) {
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

  private async profileIdOf(actor: ActorContext): Promise<string | undefined> {
    const profile = await this.profiles.findOne({
      where: { userId: actor.userId, organizationId: actor.organizationId },
      select: ['id'],
    });
    return profile?.id;
  }

  /** "Của mình" = ghi công bán cho hồ sơ mình, HOẶC do chính mình tạo (gửi giùm người khác). */
  private isOwn(order: SalesOrderEntity, salespersonId: string, actor: ActorContext): boolean {
    return order.salespersonId === salespersonId || order.createdBy === actor.userId;
  }

  /** Nhân viên được CHỌN trên đơn — phải thuộc tổ chức, đang hoạt động, và ở chi nhánh này. */
  private async salespersonById(id: string, actor: ActorContext): Promise<{ id: string; name: string }> {
    const profile = await this.profiles
      .createQueryBuilder('profile')
      .innerJoinAndSelect('profile.user', 'user')
      .innerJoin(UserBranchAssignmentEntity, 'uba', 'CAST(uba.userId AS text) = CAST(user.id AS text) AND CAST(uba.branchId AS text) = :branch', {
        branch: this.branchOf(actor),
      })
      .where('profile.id = :id AND profile.organizationId = :org', { id, org: actor.organizationId })
      .andWhere('user.isActive = true')
      .getOne();
    if (!profile) {
      throw new BadRequestException('Nhân viên bán hàng không thuộc chi nhánh này hoặc đã ngừng hoạt động');
    }
    const name = `${profile.user?.firstName ?? ''} ${profile.user?.lastName ?? ''}`.trim();
    return { id: profile.id, name: name || 'Nhân viên' };
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

  private toView(order: SalesOrderEntity, lines: SalesOrderLineEntity[], invoiceCode: string | null = null): SalesOrderView {
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
      pointsRedeemed: Number(order.pointsRedeemed ?? 0),
      selectedProgramIds: order.selectedProgramIds ?? [],
      excludedProgramIds: order.excludedProgramIds ?? [],
      note: order.note,
      rejectReason: order.rejectReason,
      cancelReason: order.cancelReason,
      invoiceId: order.invoiceId ?? null,
      invoiceCode,
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
