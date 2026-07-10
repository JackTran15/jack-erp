import { BadRequestException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import {
  DocCounterpartyKind,
  DocumentType,
  GoodsReceiptPurpose,
  GoodsReceiptStatus,
} from '@erp/shared-interfaces';
import { DocumentNumberingService } from '../../../document-numbering/document-numbering.service';
import { assertProductUniformLocation } from '../../location/services/product-location.util';
import { ItemEntity } from '../../location/item.entity';
import { ProviderEntity } from '../../location/provider.entity';
import { CustomerEntity } from '../../../customer/customer.entity';
import { UserEntity } from '../../../auth/user.entity';
import { GoodsReceiptEntity } from '../goods-receipt.entity';
import { GoodsReceiptLineEntity } from '../goods-receipt-line.entity';
import { CreateGoodsReceiptV2Command } from './create-goods-receipt-v2.command';

@CommandHandler(CreateGoodsReceiptV2Command)
export class CreateGoodsReceiptV2Handler
  implements ICommandHandler<CreateGoodsReceiptV2Command>
{
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly documentNumbering: DocumentNumberingService,
  ) {}

  async execute({
    dto,
    actor,
  }: CreateGoodsReceiptV2Command): Promise<{ id: string; documentNumber: string }> {
    if (!actor.branchId) {
      throw new BadRequestException('An active branch is required to create a goods receipt');
    }
    const manager = this.dataSource.manager;
    const orgId = actor.organizationId;

    await this.validateCounterparty(manager, dto, orgId);
    await this.validatePurchasingEmployee(manager, dto.purchasingEmployeeId, orgId);

    // Resolve each line's product so siblings can be checked for a uniform location.
    const itemIds = [...new Set(dto.lines.map((l) => l.itemId))];
    const items = await manager.find(ItemEntity, {
      where: { id: In(itemIds), organizationId: orgId },
      select: { id: true, productId: true },
    });
    const productByItem = new Map(items.map((i) => [i.id, i.productId ?? null]));
    assertProductUniformLocation(
      dto.lines.map((l) => ({
        itemId: l.itemId,
        productId: productByItem.get(l.itemId) ?? null,
        locationId: l.locationId,
      })),
    );

    const documentNumber = await this.documentNumbering.generate(
      DocumentType.GOODS_RECEIPT,
      actor.branchId,
      actor,
    );

    // A supplier counterparty also populates the legacy provider_id so the proven
    // post() debt path (nợ NCC) keeps working unchanged.
    const providerId =
      dto.counterpartyKind === DocCounterpartyKind.SUPPLIER
        ? dto.counterpartyId
        : undefined;

    const receipt = manager.create(GoodsReceiptEntity, {
      organizationId: orgId,
      branchId: actor.branchId,
      createdBy: actor.userId,
      documentNumber,
      status: GoodsReceiptStatus.DRAFT,
      purpose: dto.purpose ?? GoodsReceiptPurpose.OTHER,
      providerId,
      counterpartyKind: dto.counterpartyKind ?? null,
      counterpartyId: dto.counterpartyId ?? null,
      deliveredBy: dto.deliveredBy,
      purchasingEmployeeId: dto.purchasingEmployeeId ?? null,
      reason: dto.reason,
      description: dto.description,
      receivedAt: new Date(dto.receivedAt),
      locationId: dto.locationId ?? dto.lines[0].locationId,
      paymentMethod: dto.paymentMethod,
      cashAccountId: dto.cashAccountId,
      attachmentIds: dto.attachmentIds ?? [],
      references: dto.references ?? [],
      lines: dto.lines.map((l) =>
        manager.create(GoodsReceiptLineEntity, {
          organizationId: orgId,
          branchId: actor.branchId,
          createdBy: actor.userId,
          itemId: l.itemId,
          locationId: l.locationId,
          binId: l.binId,
          uomCode: l.uomCode,
          quantity: String(l.quantity),
          unitPrice: String(l.unitPrice),
          lineTotal: String(Number(l.quantity) * Number(l.unitPrice)),
          note: l.note,
        }),
      ),
    });

    const saved = await manager.save(receipt);
    return { id: saved.id, documentNumber };
  }

  private async validateCounterparty(
    manager: EntityManager,
    dto: CreateGoodsReceiptV2Command['dto'],
    orgId: string,
  ): Promise<void> {
    if (!dto.counterpartyKind) return;
    if (!dto.counterpartyId) {
      throw new BadRequestException(
        'counterpartyId is required when counterpartyKind is set',
      );
    }
    if (dto.counterpartyKind === DocCounterpartyKind.SUPPLIER) {
      const provider = await manager.findOne(ProviderEntity, {
        where: { id: dto.counterpartyId, organizationId: orgId },
      });
      if (!provider) {
        throw new BadRequestException('Supplier counterparty not found in organization');
      }
    } else {
      const customer = await manager.findOne(CustomerEntity, {
        where: { id: dto.counterpartyId, organizationId: orgId },
      });
      if (!customer) {
        throw new BadRequestException('Customer counterparty not found in organization');
      }
    }
  }

  private async validatePurchasingEmployee(
    manager: EntityManager,
    purchasingEmployeeId: string | undefined,
    orgId: string,
  ): Promise<void> {
    if (!purchasingEmployeeId) return;
    const user = await manager.findOne(UserEntity, {
      where: { id: purchasingEmployeeId, organizationId: orgId, isActive: true },
    });
    if (!user) {
      throw new BadRequestException('Purchasing employee not found in organization');
    }
  }
}
