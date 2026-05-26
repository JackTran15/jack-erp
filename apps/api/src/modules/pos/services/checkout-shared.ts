import { BadRequestException } from '@nestjs/common';
import { Repository, In } from 'typeorm';
import { SessionStatus } from '@erp/shared-interfaces';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InvoiceItemEntity } from '../entities/invoice-item.entity';
import { PosSessionEntity } from '../entities/pos-session.entity';

/** Banker's round to 2 decimal places. */
export function roundMoney(v: number | string): number {
  return Math.round(Number(v) * 100) / 100;
}

/** Throws BadRequestException if any item lacks a locationId. */
export function assertAllItemsHaveLocation(
  items: InvoiceItemEntity[],
  invoiceId: string,
): void {
  const missing = items.filter((i) => !i.locationId);
  if (missing.length > 0) {
    throw new BadRequestException(
      `Invoice ${invoiceId} has items without an assigned location: ${missing
        .map((i) => i.itemId)
        .join(', ')}. Configure product → location mapping before checkout.`,
    );
  }
}

/** Find the active OPEN/ACTIVE_SALES session opened by the actor, if any. */
export async function findActiveDrawerSession(
  sessionRepo: Repository<PosSessionEntity>,
  actor: ActorContext,
): Promise<PosSessionEntity | null> {
  return sessionRepo.findOne({
    where: {
      organizationId: actor.organizationId,
      openedBy: actor.userId,
      status: In([SessionStatus.OPEN, SessionStatus.ACTIVE_SALES]),
    },
  });
}
