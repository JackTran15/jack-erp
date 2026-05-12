import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActorContext } from '../../../common/decorators/actor-context.decorator';
import { InventoryLocationService } from './inventory-location.service';
import { ItemBarcodeEntity } from './item-barcode.entity';
import { ItemEntity } from './item.entity';
import { CreateItemBarcodeDto } from './dto/create-item-barcode.dto';

const BARCODE_PATTERN = /^[A-Za-z0-9\-_.]{1,100}$/;

@Injectable()
export class ItemBarcodeService {
  constructor(
    @InjectRepository(ItemBarcodeEntity)
    private readonly repo: Repository<ItemBarcodeEntity>,
    private readonly locationService: InventoryLocationService,
  ) {}

  async list(itemId: string, actor: ActorContext): Promise<ItemBarcodeEntity[]> {
    await this.locationService.getItemById(itemId, actor);
    return this.repo.find({
      where: { itemId, organizationId: actor.organizationId },
      order: { createdAt: 'ASC' },
    });
  }

  async create(
    itemId: string,
    dto: CreateItemBarcodeDto,
    actor: ActorContext,
  ): Promise<ItemBarcodeEntity> {
    const item = await this.locationService.getItemById(itemId, actor);
    const code = dto.code.trim();
    if (!BARCODE_PATTERN.test(code)) {
      throw new BadRequestException(
        'Mã vạch không hợp lệ: chỉ gồm chữ, số và ký tự - _ .',
      );
    }
    const exists = await this.repo.findOne({
      where: { organizationId: actor.organizationId, code },
    });
    if (exists) {
      throw new ConflictException(`Mã vạch "${code}" đã tồn tại`);
    }
    return this.repo.save(
      this.repo.create({
        itemId,
        code,
        notes: dto.notes,
        organizationId: actor.organizationId,
        branchId: item.branchId,
        createdBy: actor.userId,
      }),
    );
  }

  async delete(
    itemId: string,
    barcodeId: string,
    actor: ActorContext,
  ): Promise<void> {
    await this.locationService.getItemById(itemId, actor);
    const row = await this.repo.findOne({
      where: { id: barcodeId, itemId, organizationId: actor.organizationId },
    });
    if (!row) {
      throw new NotFoundException(`Mã vạch ${barcodeId} không tồn tại`);
    }
    await this.repo.remove(row);
  }

  async lookup(
    code: string,
    actor: ActorContext,
  ): Promise<{ itemId: string; item: ItemEntity }> {
    const trimmed = code.trim();
    const row = await this.repo.findOne({
      where: { organizationId: actor.organizationId, code: trimmed },
      relations: ['item'],
    });
    if (!row || !row.item) {
      throw new NotFoundException(`Mã vạch "${trimmed}" không tồn tại`);
    }
    return { itemId: row.itemId, item: row.item };
  }
}
