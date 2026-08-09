import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerReaderPort, CustomerView } from '../../domain/ports/customer-reader.port';
import { CustomerEntity } from '../../../customer/customer.entity';
import { MembershipCardEntity } from '../../../customer/membership-card.entity';
import { MembershipCardTypeEntity } from '../../../customer/membership-card-type.entity';

/**
 * `customers.birth_date` is a Postgres `date`, which the driver hands back as a
 * 'YYYY-MM-DD' string, not a Date — while `CustomerView.birthDate` is a Date and
 * `CustomerScope` calls getMonth()/getDate() on it. Build the Date from local
 * parts so the calendar day survives (`new Date('2026-08-01')` is UTC midnight,
 * which reads as the previous day west of Greenwich).
 */
function toDate(value: Date | string | undefined): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

@Injectable()
export class TypeormCustomerReader implements CustomerReaderPort {
  constructor(
    @InjectRepository(CustomerEntity) private readonly customerRepo: Repository<CustomerEntity>,
    @InjectRepository(MembershipCardEntity) private readonly cardRepo: Repository<MembershipCardEntity>,
    @InjectRepository(MembershipCardTypeEntity) private readonly cardTypeRepo: Repository<MembershipCardTypeEntity>,
  ) {}

  async load(orgId: string, customerId: string): Promise<CustomerView | null> {
    const customer = await this.customerRepo.findOne({ where: { id: customerId, organizationId: orgId } });
    if (!customer) return null;

    const card = await this.cardRepo.findOne({
      where: { customerId, organizationId: orgId, isActive: true },
    });

    let cardTierId: string | undefined;
    if (card) {
      // membership_cards only stores the tier enum, not a membership_card_types
      // id — look the type row up by (org, tier) to get the id the domain expects.
      const cardType = await this.cardTypeRepo.findOne({ where: { organizationId: orgId, tier: card.tier } });
      cardTierId = cardType?.id;
    }

    return {
      groupId: customer.groupId,
      birthDate: toDate(customer.birthDate),
      cardTierId,
    };
  }
}
