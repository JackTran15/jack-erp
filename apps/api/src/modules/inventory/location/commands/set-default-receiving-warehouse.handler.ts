import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StorageEntity } from '../storage.entity';
import { SetDefaultReceivingWarehouseCommand } from './set-default-receiving-warehouse.command';

@CommandHandler(SetDefaultReceivingWarehouseCommand)
export class SetDefaultReceivingWarehouseHandler
  implements ICommandHandler<SetDefaultReceivingWarehouseCommand>
{
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async execute({
    storageId,
    actor,
  }: SetDefaultReceivingWarehouseCommand): Promise<{ storageId: string }> {
    if (!actor.branchId) {
      throw new BadRequestException(
        'An active branch is required to set the default receiving warehouse',
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const storage = await manager.findOne(StorageEntity, {
        where: {
          id: storageId,
          organizationId: actor.organizationId,
          branchId: actor.branchId,
        },
      });
      if (!storage) {
        throw new NotFoundException(
          `Storage ${storageId} not found in the active branch`,
        );
      }

      // Clear the current default first so the per-branch partial unique index
      // never sees two rows flagged true at the same time.
      await manager.update(
        StorageEntity,
        {
          organizationId: actor.organizationId,
          branchId: actor.branchId,
          isDefaultReceiving: true,
        },
        { isDefaultReceiving: false },
      );
      await manager.update(
        StorageEntity,
        { id: storageId },
        { isDefaultReceiving: true },
      );

      return { storageId };
    });
  }
}
