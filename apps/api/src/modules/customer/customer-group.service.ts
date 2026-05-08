import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActorContext } from '../../common/decorators/actor-context.decorator';
import { CustomerGroupEntity } from './customer-group.entity';
import { CreateCustomerGroupDto } from './dto/create-customer-group.dto';

@Injectable()
export class CustomerGroupService {
  constructor(
    @InjectRepository(CustomerGroupEntity)
    private readonly groupRepo: Repository<CustomerGroupEntity>,
  ) {}

  async create(
    dto: CreateCustomerGroupDto,
    actor: ActorContext,
  ): Promise<CustomerGroupEntity> {
    const group = this.groupRepo.create({
      organizationId: actor.organizationId,
      branchId: actor.branchId, // Todo check business rule need to be org-wide or branch-wide
      name: dto.name,
      description: dto.description,
      createdBy: actor.userId,
    });
    return this.groupRepo.save(group);
  }

  async findAll(actor: ActorContext): Promise<CustomerGroupEntity[]> {
    return this.groupRepo.find({
      where: { organizationId: actor.organizationId },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string, actor: ActorContext): Promise<CustomerGroupEntity> {
    const group = await this.groupRepo.findOne({
      where: { id, organizationId: actor.organizationId },
    });
    if (!group) {
      throw new NotFoundException(`Customer group ${id} not found`);
    }
    return group;
  }

  async update(
    id: string,
    dto: Partial<CreateCustomerGroupDto>,
    actor: ActorContext,
  ): Promise<CustomerGroupEntity> {
    const group = await this.findOne(id, actor);
    if (dto.name !== undefined) group.name = dto.name;
    if (dto.description !== undefined) group.description = dto.description;
    return this.groupRepo.save(group);
  }

  async remove(id: string, actor: ActorContext): Promise<void> {
    const group = await this.findOne(id, actor);
    await this.groupRepo.remove(group);
  }
}
