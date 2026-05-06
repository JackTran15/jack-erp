import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { ProductEntity } from './product.entity';
import { ProductAttributeDefinitionEntity } from './product-attribute-definition.entity';
import { ProductAttributeOptionEntity } from './product-attribute-option.entity';
import { CreateAttributeDefinitionDto } from './dto/create-attribute-definition.dto';
import { CreateAttributeOptionDto } from './dto/create-attribute-option.dto';

@Injectable()
export class ProductAttributeService {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly productRepo: Repository<ProductEntity>,
    @InjectRepository(ProductAttributeDefinitionEntity)
    private readonly defRepo: Repository<ProductAttributeDefinitionEntity>,
    @InjectRepository(ProductAttributeOptionEntity)
    private readonly optionRepo: Repository<ProductAttributeOptionEntity>,
  ) {}

  async listDefinitions(productId: string, actor: ActorContext) {
    await this.resolveProduct(productId, actor);
    return this.defRepo.find({
      where: { productId, organizationId: actor.organizationId },
      relations: ['options'],
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  async createDefinition(
    productId: string,
    dto: CreateAttributeDefinitionDto,
    actor: ActorContext,
  ) {
    await this.resolveProduct(productId, actor);

    const def = this.defRepo.create({
      productId,
      name: dto.name,
      sortOrder: dto.sortOrder ?? 0,
      organizationId: actor.organizationId,
      createdBy: actor.userId,
    });

    try {
      return await this.defRepo.save(def);
    } catch (err) {
      if (err instanceof QueryFailedError && (err as any).code === '23505') {
        throw new ConflictException(
          `Attribute "${dto.name}" already exists for this product`,
        );
      }
      throw err;
    }
  }

  async updateDefinition(
    productId: string,
    defId: string,
    dto: Partial<CreateAttributeDefinitionDto>,
    actor: ActorContext,
  ) {
    const def = await this.resolveDefinition(productId, defId, actor);

    if (dto.name !== undefined) def.name = dto.name;
    if (dto.sortOrder !== undefined) def.sortOrder = dto.sortOrder;

    try {
      return await this.defRepo.save(def);
    } catch (err) {
      if (err instanceof QueryFailedError && (err as any).code === '23505') {
        throw new ConflictException(
          `Attribute "${dto.name}" already exists for this product`,
        );
      }
      throw err;
    }
  }

  async deleteDefinition(productId: string, defId: string, actor: ActorContext) {
    const def = await this.resolveDefinition(productId, defId, actor);
    await this.defRepo.remove(def);
  }

  async createOption(
    productId: string,
    attrDefId: string,
    dto: CreateAttributeOptionDto,
    actor: ActorContext,
  ) {
    await this.resolveDefinition(productId, attrDefId, actor);

    const option = this.optionRepo.create({
      attributeDefinitionId: attrDefId,
      valueLabel: dto.valueLabel,
      sortOrder: dto.sortOrder ?? 0,
      codeSuffix: dto.codeSuffix,
      organizationId: actor.organizationId,
      createdBy: actor.userId,
    });

    return this.optionRepo.save(option);
  }

  async updateOption(
    productId: string,
    attrDefId: string,
    optionId: string,
    dto: Partial<CreateAttributeOptionDto>,
    actor: ActorContext,
  ) {
    const option = await this.resolveOption(productId, attrDefId, optionId, actor);

    if (dto.valueLabel !== undefined) option.valueLabel = dto.valueLabel;
    if (dto.sortOrder !== undefined) option.sortOrder = dto.sortOrder;
    if (dto.codeSuffix !== undefined) option.codeSuffix = dto.codeSuffix;

    return this.optionRepo.save(option);
  }

  async deleteOption(
    productId: string,
    attrDefId: string,
    optionId: string,
    actor: ActorContext,
  ) {
    const option = await this.resolveOption(productId, attrDefId, optionId, actor);
    await this.optionRepo.remove(option);
  }

  private async resolveProduct(productId: string, actor: ActorContext): Promise<ProductEntity> {
    const product = await this.productRepo.findOne({
      where: { id: productId, organizationId: actor.organizationId },
    });
    if (!product) {
      throw new NotFoundException(`Product ${productId} not found`);
    }
    return product;
  }

  private async resolveDefinition(
    productId: string,
    defId: string,
    actor: ActorContext,
  ): Promise<ProductAttributeDefinitionEntity> {
    await this.resolveProduct(productId, actor);
    const def = await this.defRepo.findOne({
      where: { id: defId, productId, organizationId: actor.organizationId },
    });
    if (!def) {
      throw new NotFoundException(`Attribute definition ${defId} not found`);
    }
    return def;
  }

  private async resolveOption(
    productId: string,
    attrDefId: string,
    optionId: string,
    actor: ActorContext,
  ): Promise<ProductAttributeOptionEntity> {
    await this.resolveDefinition(productId, attrDefId, actor);
    const option = await this.optionRepo.findOne({
      where: { id: optionId, attributeDefinitionId: attrDefId, organizationId: actor.organizationId },
    });
    if (!option) {
      throw new NotFoundException(`Attribute option ${optionId} not found`);
    }
    return option;
  }
}
