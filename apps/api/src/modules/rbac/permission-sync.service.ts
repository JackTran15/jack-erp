import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PermissionEntity } from '../auth/permission.entity';
import { PERMISSION_SEEDS } from './permissions.seed';

@Injectable()
export class PermissionSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionSyncService.name);

  constructor(
    @InjectRepository(PermissionEntity)
    private readonly permissionRepo: Repository<PermissionEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const existing = await this.permissionRepo.find();
    const existingKeys = new Set(existing.map((p) => p.key));

    const missing = PERMISSION_SEEDS.filter((s) => !existingKeys.has(s.key));
    if (missing.length === 0) return;

    const entities = missing.map((s) =>
      this.permissionRepo.create({
        key: s.key,
        description: s.description,
        module: s.module,
      }),
    );

    await this.permissionRepo.save(entities);
    this.logger.log(
      `Synced ${missing.length} new permission(s): ${missing.map((m) => m.key).join(', ')}`,
    );
  }
}
