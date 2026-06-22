import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { DocCounterpartyKind } from '@erp/shared-interfaces';
import { ProviderEntity } from '../provider.entity';
import { CustomerEntity } from '../../../customer/customer.entity';
import { UserEntity } from '../../../auth/user.entity';

export interface DocCounterpartyInput {
  providerId?: string;
  counterpartyKind?: DocCounterpartyKind | null;
  counterpartyId?: string | null;
}

export interface ResolvedDocCounterparty {
  /** Set only for suppliers — drives the legacy provider_id FK + debt path. */
  providerId?: string;
  counterpartyKind: DocCounterpartyKind | null;
  counterpartyId: string | null;
}

/**
 * Resolve the "Đối tượng" of a goods document (receipt / issue). Validates the
 * counterparty exists in the org and routes it:
 *  - supplier  → provider_id (+ counterparty cols) so post()'s nợ-NCC path works
 *  - customer  → counterparty cols only, provider_id null
 *  - employee  → counterparty cols only, provider_id null
 *
 * Only validates/routes when counterpartyKind is explicitly set. Legacy callers
 * that send a bare providerId (e.g. transfer exports) pass through unchanged.
 */
export async function resolveDocCounterparty(
  manager: EntityManager,
  input: DocCounterpartyInput,
  organizationId: string,
): Promise<ResolvedDocCounterparty> {
  if (!input.counterpartyKind) {
    return {
      providerId: input.providerId,
      counterpartyKind: null,
      counterpartyId: null,
    };
  }
  if (!input.counterpartyId) {
    throw new BadRequestException(
      'counterpartyId is required when counterpartyKind is set',
    );
  }
  const id = input.counterpartyId;

  if (input.counterpartyKind === DocCounterpartyKind.SUPPLIER) {
    const provider = await manager.findOne(ProviderEntity, {
      where: { id, organizationId },
    });
    if (!provider) {
      throw new BadRequestException(
        'Supplier counterparty not found in organization',
      );
    }
    return {
      providerId: id,
      counterpartyKind: DocCounterpartyKind.SUPPLIER,
      counterpartyId: id,
    };
  }

  if (input.counterpartyKind === DocCounterpartyKind.CUSTOMER) {
    const customer = await manager.findOne(CustomerEntity, {
      where: { id, organizationId },
    });
    if (!customer) {
      throw new BadRequestException(
        'Customer counterparty not found in organization',
      );
    }
    return {
      providerId: undefined,
      counterpartyKind: DocCounterpartyKind.CUSTOMER,
      counterpartyId: id,
    };
  }

  const employee = await manager.findOne(UserEntity, {
    where: { id, organizationId, isActive: true },
  });
  if (!employee) {
    throw new BadRequestException(
      'Employee counterparty not found in organization',
    );
  }
  return {
    providerId: undefined,
    counterpartyKind: DocCounterpartyKind.EMPLOYEE,
    counterpartyId: id,
  };
}
