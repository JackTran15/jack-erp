import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InventoryLocationService } from './inventory-location.service';
import { ItemProviderEntity } from './item-provider.entity';
import { LinkItemProviderDto } from './dto/link-item-provider.dto';

@Injectable()
export class ItemProviderService {
  constructor(
    @InjectRepository(ItemProviderEntity)
    private readonly repo: Repository<ItemProviderEntity>,
    private readonly locationService: InventoryLocationService,
    private readonly dataSource: DataSource,
  ) {}

  async list(itemId: string, actor: ActorContext): Promise<ItemProviderEntity[]> {
    await this.locationService.getItemById(itemId, actor);
    return this.repo.find({
      where: { itemId, organizationId: actor.organizationId },
      relations: ['provider'],
      order: { isPrimary: 'DESC', createdAt: 'ASC' },
    });
  }

  async link(
    itemId: string,
    dto: LinkItemProviderDto,
    actor: ActorContext,
  ): Promise<ItemProviderEntity> {
    const item = await this.locationService.getItemById(itemId, actor);
    await this.locationService.validateProvider(dto.providerId, actor);

    const existing = await this.repo.findOne({
      where: { itemId, providerId: dto.providerId },
    });
    if (existing) {
      throw new ConflictException(
        `Nhà cung cấp đã được liên kết với mặt hàng này`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const hasPrimary = await manager.count(ItemProviderEntity, {
        where: { itemId, isPrimary: true },
      });
      const shouldBePrimary = dto.isPrimary === true || hasPrimary === 0;

      if (shouldBePrimary && hasPrimary > 0) {
        await manager.update(
          ItemProviderEntity,
          { itemId, isPrimary: true },
          { isPrimary: false },
        );
      }

      const row = manager.create(ItemProviderEntity, {
        itemId,
        providerId: dto.providerId,
        isPrimary: shouldBePrimary,
        organizationId: actor.organizationId,
        branchId: item.branchId,
        createdBy: actor.userId,
      });
      return manager.save(ItemProviderEntity, row);
    });
  }

  async unlink(
    itemId: string,
    providerId: string,
    actor: ActorContext,
  ): Promise<void> {
    await this.locationService.getItemById(itemId, actor);

    const row = await this.repo.findOne({ where: { itemId, providerId } });
    if (!row) {
      throw new NotFoundException(
        `Liên kết nhà cung cấp không tồn tại cho mặt hàng này`,
      );
    }

    if (row.isPrimary) {
      const otherCount = await this.repo.count({
        where: { itemId },
      });
      if (otherCount > 1) {
        throw new BadRequestException(
          'Phải chỉ định NCC chính khác trước khi xóa NCC chính hiện tại',
        );
      }
    }
    await this.repo.remove(row);
  }

  async setPrimary(
    itemId: string,
    providerId: string,
    actor: ActorContext,
  ): Promise<ItemProviderEntity> {
    await this.locationService.getItemById(itemId, actor);

    return this.dataSource.transaction(async (manager) => {
      const target = await manager.findOne(ItemProviderEntity, {
        where: { itemId, providerId },
      });
      if (!target) {
        throw new NotFoundException(
          `Nhà cung cấp ${providerId} chưa được liên kết với mặt hàng này`,
        );
      }
      await manager.update(
        ItemProviderEntity,
        { itemId, isPrimary: true },
        { isPrimary: false },
      );
      target.isPrimary = true;
      return manager.save(ItemProviderEntity, target);
    });
  }
}
