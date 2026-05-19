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
    const byKey = new Map(existing.map((p) => [p.key, p]));

    let inserted = 0;
    let updated = 0;

    for (const seed of PERMISSION_SEEDS) {
      const row = byKey.get(seed.key);
      if (!row) {
        await this.permissionRepo.save(
          this.permissionRepo.create({
            key: seed.key,
            description: seed.description,
            module: seed.module,
          }),
        );
        inserted += 1;
        continue;
      }

      if (
        row.description !== seed.description ||
        row.module !== seed.module
      ) {
        row.description = seed.description;
        row.module = seed.module;
        await this.permissionRepo.save(row);
        updated += 1;
      }
    }

    if (inserted > 0 || updated > 0) {
      this.logger.log(
        `Permission catalogue sync: ${inserted} inserted, ${updated} updated`,
      );
    }
  }
}
