import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import {
  InvoiceEntity,
  InvoiceStatus,
  InvoiceType,
} from '../entities/invoice.entity';
import {
  InvoiceItemEntity,
  ItemDirection,
} from '../entities/invoice-item.entity';
import {
  CreateReturnInvoiceDto,
  ReturnInvoiceLineDto,
  ReturnInvoiceMode,
} from '../dto/create-return-invoice.dto';
import { resolveBranchItemLocations } from './resolve-branch-item-locations';
import { ReturnEligibilityService } from './return-eligibility.service';

@Injectable()
export class CreateReturnInvoiceService {
  private readonly logger = new Logger(CreateReturnInvoiceService.name);

  constructor(
    @InjectRepository(InvoiceEntity)
    private readonly invoiceRepo: Repository<InvoiceEntity>,
    private readonly dataSource: DataSource,
    private readonly eligibility: ReturnEligibilityService,
  ) {}

  async create(
    dto: CreateReturnInvoiceDto,
    actor: ActorContext,
  ): Promise<InvoiceEntity> {
    if (dto.mode === ReturnInvoiceMode.REGULAR) {
      if (!dto.originalInvoiceId) {
        throw new BadRequestException(
          'originalInvoiceId is required in REGULAR mode',
        );
      }
      for (const line of dto.lines) {
        if (!line.originalInvoiceItemId) {
          throw new BadRequestException(
            'originalInvoiceItemId is required for every line in REGULAR mode',
          );
        }
        await this.eligibility.assertLineEligible(
          line.originalInvoiceItemId,
          line.quantity,
          actor,
        );
      }
    } else {
      // QUICK mode — items free-form, no eligibility check.
      if (dto.originalInvoiceId) {
        throw new BadRequestException(
          'originalInvoiceId must NOT be set in QUICK mode',
        );
      }
    }

    const subtotal = dto.lines.reduce(
      (sum, l) => sum + computeLineTotal(l),
      0,
    );

    const invoice = await this.dataSource.transaction(async (manager) => {
      const entity = manager.create(InvoiceEntity, {
        organizationId: actor.organizationId,
        branchId: actor.branchId,
        createdBy: actor.userId,
        code: `DRAFT-${uuid().slice(0, 8)}`,
        sessionId: dto.sessionId,
        customerId: dto.customerId,
        type: InvoiceType.RETURN,
        originalInvoiceId:
          dto.mode === ReturnInvoiceMode.REGULAR ? dto.originalInvoiceId : undefined,
        isDraft: true,
        status: InvoiceStatus.DRAFT,
        staffId: actor.userId,
        subtotal,
        discountAmount: 0,
        depositAmount: 0,
        amountDue: subtotal,
        refundedAmount: 0,
        netAmount: 0,
        note: dto.reason,
      });
      const saved = await manager.save(entity);

      // Returned stock is credited back to the showroom, mirroring how a sale
      // deducts from the showroom — never to the storage warehouse the FE may
      // have sent (the quick path defaults to the highest-stock location).
      const itemIds = [...new Set(dto.lines.map((l) => l.itemId))];
      const showroomLocations = await resolveBranchItemLocations(
        manager,
        itemIds,
        actor,
        { showroomOnly: true },
      );

      const items = dto.lines.map((line, index) =>
        manager.create(InvoiceItemEntity, {
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          createdBy: actor.userId,
          invoiceId: saved.id,
          itemId: line.itemId,
          locationId: showroomLocations.get(line.itemId) ?? line.locationId,
          itemCode: line.itemCode,
          itemName: line.itemName,
          unit: line.unit,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          unitPriceDefault: line.unitPrice,
          costPrice: 0,
          lineDiscount: line.lineDiscount ?? 0,
          lineTotal: computeLineTotal(line),
          direction: ItemDirection.IN,
          returnedQuantity: 0,
          originalInvoiceItemId: line.originalInvoiceItemId,
          note: line.note,
          sortOrder: index,
        }),
      );
      await manager.save(items);
      saved.subtotal = subtotal;
      return saved;
    });

    this.logger.log(
      `Created draft RETURN invoice ${invoice.id} mode=${dto.mode} lines=${dto.lines.length}`,
    );

    return invoice;
  }
}

function computeLineTotal(line: ReturnInvoiceLineDto): number {
  return line.quantity * line.unitPrice - (line.lineDiscount ?? 0);
}
