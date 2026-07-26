import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerReaderPort, CustomerView } from '../../domain/ports/customer-reader.port';
import { CustomerEntity } from '../../../customer/customer.entity';
import { MembershipCardEntity } from '../../../customer/membership-card.entity';
import { MembershipCardTypeEntity } from '../../../customer/membership-card-type.entity';

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
      birthDate: customer.birthDate,
      cardTierId,
    };
  }
}
